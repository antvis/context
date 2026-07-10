import * as fs from 'fs';
import * as path from 'path';
import type { ZvecDoc, ZvecQueryResult, StoreQueryParams } from './types';

import { ZVecCreateAndOpen, ZVecOpen, ZVecIndexType, ZVecCollection } from '@zvec/zvec';
import { buildZvecSchema } from './schema';
import { Embedder } from '../embedder';
import type { ContextOptions } from '../types';

const VECTOR_FIELD = 'embedding';
const FTS_FIELDS = ['content'];

/**
 * Store - zvec storage for multiple libraries.
 *
 * Usage:
 *   const store = new Store('./data', embedder, options);
 *   store.acquireZvec('lib', 'jieba');  // get or create
 *   store.addDoc('lib', docs);          // insert docs
 *   store.queryDoc('lib', params);      // query
 *   store.close();                       // close all
 */
export class Store {
  private vectorsDir: string;
  private embedder: Embedder;
  private options?: ContextOptions;
  private zvecs: Map<string, ZVecCollection> = new Map();

  constructor(vectorsDir: string, embedder: Embedder, options?: ContextOptions) {
    this.vectorsDir = vectorsDir;
    this.embedder = embedder;
    this.options = options;
  }

  /** Get or create zvec instance. tokenizerName configures tokenizer on first creation. */
  acquireZvec(library: string, tokenizerName?: string): ZVecCollection {
    const cached = this.zvecs.get(library);
    if (cached) return cached;

    const filePath = path.join(this.vectorsDir, `${library}.zvec`);
    let collection: ZVecCollection;

    if (fs.existsSync(filePath)) {
      collection = ZVecOpen(filePath);
    } else {
      if (this.options?.readOnly) {
        throw new Error(`Cannot open zvec for library "${library}" in read-only mode: ${filePath} does not exist`);
      }

      const schema = buildZvecSchema(this.embedder.dimensions, tokenizerName);
      collection = ZVecCreateAndOpen(filePath, schema);
    }

    this.zvecs.set(library, collection);
    return collection;
  }

  /** Insert docs (upsert semantics). */
  addDoc(library: string, docs: ZvecDoc[]): void {
    if (this.options?.readOnly) {
      throw new Error(`Cannot add docs to library "${library}" in read-only mode`);
    }

    const collection = this.acquireZvec(library);
    if (docs.length === 0) return;

    const opts = this.getStoreOptions();
    const records = docs.map((d) => ({
      id: d.id,
      vectors: { [opts.vectorField]: d.vector },
      fields: d.fields,
    }));
    collection.upsertSync(records);
  }

  /** Fetch docs by IDs. */
  fetchDocs(library: string, ids: string[], outputFields?: string[]): Record<string, ZvecQueryResult> {
    const collection = this.acquireZvec(library);

    if (ids.length === 0) return {};

    const raw = collection.fetchSync({
      ids,
      outputFields,
      includeVector: false,
    });

    const result: Record<string, ZvecQueryResult> = {};
    for (const [id, doc] of Object.entries(raw)) {
      result[id] = {
        id,
        score: 0,
        fields: doc.fields ?? {},
      };
    }
    return result;
  }

  /** Query docs. Supports hybrid (vector + fulltext) or vector-only mode. */
  queryDoc(library: string, params: StoreQueryParams): ZvecQueryResult[] {
    const collection = this.acquireZvec(library);

    const opts = this.getStoreOptions();

    if (params.mode === 'hybrid') {
      return this.hybridSearch(collection, opts, params);
    }

    return this.vectorSearch(collection, opts, params);
  }

  /** Close all zvec instances. */
  close(): void {
    for (const [, collection] of this.zvecs) {
      collection.closeSync();
    }
    this.zvecs.clear();
  }

  private getStoreOptions() {
    return {
      vectorField: VECTOR_FIELD,
      ftsFields: this.options?.ftsFields ?? FTS_FIELDS,
      rankConstant: this.options?.rankConstant ?? 60,
    };
  }

  private vectorSearch(collection: ZVecCollection, opts: { vectorField: string }, params: StoreQueryParams): ZvecQueryResult[] {
    const query = {
      fieldName: opts.vectorField,
      vector: params.queryVector,
      topk: params.topK,
      ...(params.filter ? { filter: params.filter } : {}),
    };

    const rawResults = collection.querySync(query);
    return rawResults.map((r) => ({
      id: r.id,
      score: r.score,
      fields: r.fields ?? {},
    }));
  }

  private hybridSearch(collection: ZVecCollection, opts: { vectorField: string; ftsFields: string[]; rankConstant: number }, params: StoreQueryParams): ZvecQueryResult[] {
    if (!opts.ftsFields?.length) {
      return this.vectorSearch(collection, opts, params);
    }

    const ftsQueries = opts.ftsFields.map((fieldName) => ({
      fieldName,
      fts: { matchString: params.queryText ?? '' },
      numCandidates: params.topK * 2,
      params: { indexType: ZVecIndexType.FTS, defaultOperator: 'OR' as const },
    }));

    const query = {
      queries: [
        {
          fieldName: opts.vectorField,
          vector: params.queryVector,
          numCandidates: params.topK * 2,
        },
        ...ftsQueries,
      ],
      topk: params.topK,
      rerank: { type: 'rrf' as const, rankConstant: opts.rankConstant },
      ...(params.filter ? { filter: params.filter } : {}),
    };

    const rawResults = collection.multiQuerySync(query);
    return rawResults.map((r) => ({
      id: r.id,
      score: r.score,
      fields: r.fields ?? {},
    }));
  }
}
