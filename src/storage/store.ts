import * as fs from 'fs';
import * as path from 'path';
import {
  createZvecStore,
  openZvecStoreSync,
} from './zvec-store';
import type { IZvecStore, ZvecStoreConfig, ActualZvecStoreOptions } from './zvec-store';
import type { ZvecDoc, ZvecQueryResult } from './types';
import type { Embedder } from '../embedder';
import { detectTokenizer } from '../utils/tokenizer';
import type { ContextOptions } from '../types';

// ---------------------------------------------------------------------------
// Default schema constants
// ---------------------------------------------------------------------------

const DEFAULT_VECTOR_FIELD = 'embedding';
const DEFAULT_FTS_FIELDS = ['content'];
const DEFAULT_RANK_CONSTANT = 60;

function resolveTokenizer(sampleText?: string): string {
  // Always auto-detect based on sample text content.
  // Falls back to 'jieba' as safe default for mixed-language content
  // when no sample has been loaded yet.
  if (sampleText && sampleText.trim().length > 0) {
    return detectTokenizer(sampleText);
  }
  return 'jieba';
}

function contextStoreConfig(dims: number, sampleText?: string): ZvecStoreConfig {
  const ftsFields = DEFAULT_FTS_FIELDS;
  const tokenizerName = resolveTokenizer(sampleText);

  return {
    collectionName: 'context_docs',
    vectorField: DEFAULT_VECTOR_FIELD,
    vectorDims: dims,
    ftsFields,
    fields: [
      {
        name: 'content',
        dataType: 'STRING',
        indexType: ftsFields.includes('content') ? 'FTS' : 'NONE',
        indexOptions: { tokenizerName },
      },
      { name: 'meta', dataType: 'STRING' },
      { name: 'sourceFilePath', dataType: 'STRING' },
    ],
  };
}

function storeOpenOptions(options?: ContextOptions): ActualZvecStoreOptions {
  return {
    vectorField: DEFAULT_VECTOR_FIELD,
    ftsFields: options?.ftsFields ?? DEFAULT_FTS_FIELDS,
    rankConstant: options?.rankConstant ?? DEFAULT_RANK_CONSTANT,
  };
}

// ---------------------------------------------------------------------------
// Query params type for Store.queryDoc()
// ---------------------------------------------------------------------------

export interface StoreQueryParams {
  /** Search mode: 'hybrid' combines vector + FTS, 'vector' is pure semantic. */
  mode: 'hybrid' | 'vector';
  /** Query text for the FTS path (hybrid mode only). */
  queryText?: string;
  /** Query vector (pre-computed by the embedder). */
  queryVector: number[];
  /** Number of results to return. */
  topK: number;
  /** Optional field-level filter expression. */
  filter?: string;
}

// ---------------------------------------------------------------------------
// Store — manages zvec store lifecycle per library
// ---------------------------------------------------------------------------

/**
 * Store manages creation, caching, and querying of zvec store instances.
 *
 * Each library gets its own `.zvec` file on disk. The public API is
 * intentionally minimal — three methods cover all usage:
 *
 *   - `create(library)`      — create / open a store for a library
 *   - `addDoc(docs)`         — batch-insert documents into a store
 *   - `queryDoc(params)`     — search a store (vector or hybrid)
 */
export class Store {
  private readonly vectorsDir: string;
  private readonly embedder: Embedder;
  private readonly rankConstant: number;
  private readonly contextOptions?: ContextOptions;
  private readonly stores: Map<string, IZvecStore> = new Map();
  /** In-flight creation promises — prevents duplicate stores from concurrent calls. */
  private readonly pending: Map<string, Promise<IZvecStore>> = new Map();

  constructor(vectorsDir: string, embedder: Embedder, options?: ContextOptions) {
    this.vectorsDir = vectorsDir;
    this.embedder = embedder;
    this.rankConstant = options?.rankConstant ?? DEFAULT_RANK_CONSTANT;
    this.contextOptions = options;
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Create (or re-open) a zvec store for a library.
   *
   * - If the store is already cached, returns it immediately.
   * - If a `.zvec` file exists on disk, opens it.
   * - Otherwise, creates a new store with the configured schema.
   *
   * Uses a Promise-based lock so concurrent calls for the same library
   * share a single creation attempt instead of racing.
   *
   * @param library    Library name.
   * @param sampleText Optional document sample for auto-detecting FTS tokenizer
   *                   when `tokenizer` is `'auto'`. Only used for new stores.
   */
  async create(library: string, sampleText?: string): Promise<IZvecStore> {
    const cached = this.stores.get(library);
    if (cached) return cached;

    const pendingPromise = this.pending.get(library);
    if (pendingPromise) return pendingPromise;

    const promise = this._doCreate(library, sampleText);
    this.pending.set(library, promise);
    try {
      const store = await promise;
      this.stores.set(library, store);
      return store;
    } finally {
      this.pending.delete(library);
    }
  }

  /**
   * Batch-insert documents into a library's store.
   *
   * The store must have been created via `create()` first.
   *
   * @param library  Library name whose store to insert into.
   * @param docs     Documents to insert (id, vector, fields).
   */
  async addDoc(library: string, docs: ZvecDoc[]): Promise<void> {
    const store = this.stores.get(library);
    if (!store) {
      throw new Error(`Store for library "${library}" has not been created. Call create() first.`);
    }
    await store.insert(docs);
  }

  /**
   * Query a library's store for similar documents.
   *
   * - `mode: 'hybrid'` combines vector + FTS text matching via RRF fusion.
   * - `mode: 'vector'` is pure semantic ANN search.
   *
   * The store must have been created via `create()` first. Returns
   * empty array if the library has no store.
   *
   * @param library  Library name to query.
   * @param params   Search parameters (mode, vectors, topK, filter).
   * @returns        Ranked query results with scores and fields.
   */
  async queryDoc(library: string, params: StoreQueryParams): Promise<ZvecQueryResult[]> {
    const store = this.stores.get(library) ?? this._tryOpenFromDisk(library);
    if (!store) return [];

    if (params.mode === 'hybrid') {
      return store.searchHybrid({
        queryText: params.queryText ?? '',
        queryVector: params.queryVector,
        topK: params.topK,
        filter: params.filter,
      });
    }

    return store.search({
      vector: params.queryVector,
      topK: params.topK,
      filter: params.filter,
    });
  }

  // ── Lifecycle helpers (used by Context internally) ─────────────────────

  /**
   * Close and remove a single library's store from cache.
   */
  async close(library: string): Promise<void> {
    const store = this.stores.get(library);
    if (store) {
      await store.close();
      this.stores.delete(library);
    }
  }

  /**
   * Delete a library's store file from disk (after closing it).
   */
  async deleteStore(library: string): Promise<void> {
    await this.close(library);
    const filePath = this._getStorePath(library);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Close all cached stores and release resources.
   *
   * Called by `Context.close()` at process exit.
   */
  async closeAll(): Promise<void> {
    for (const [, store] of this.stores) {
      await store.close();
    }
    this.stores.clear();
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private _getStorePath(library: string): string {
    return path.join(this.vectorsDir, `${library}.zvec`);
  }

  private async _doCreate(library: string, sampleText?: string): Promise<IZvecStore> {
    const filePath = this._getStorePath(library);

    if (fs.existsSync(filePath)) {
      return openZvecStoreSync(filePath, storeOpenOptions(this.contextOptions));
    }

    return await createZvecStore(
      filePath,
      contextStoreConfig(this.embedder.dimensions, sampleText),
    );
  }

  /**
   * Try to lazily open an existing store from disk if not already cached.
   * Used by queryDoc() to auto-open stores on first query.
   */
  private _tryOpenFromDisk(library: string): IZvecStore | undefined {
    const filePath = this._getStorePath(library);
    if (fs.existsSync(filePath)) {
      try {
        const store = openZvecStoreSync(filePath, storeOpenOptions(this.contextOptions));
        this.stores.set(library, store);
        return store;
      } catch {
        // @zvec/zvec not available — cannot open
        return undefined;
      }
    }
    return undefined;
  }
}
