import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import {
  ContextOptions,
  QueryOptions,
  QueryResult,
  Document,
  LoadedDoc,
  LoadPhase,
  LoadProgress,
} from './types';
import { Embedder } from './embedder';

type EmbedderInfo = { dimensions: number };
import { getLoader } from './loaders';
import { pathToId } from './utils/doc';
import { Store } from './storage/store';
import type { ZvecDoc } from './storage/zvec-store';
import {
  createReranker,
  safeJsonParse,
  computeContentHash,
  loadSampleText,
} from './utils';
import { expand } from './expander';
import type { Reranker, RerankCandidate } from './utils';

// ---------------------------------------------------------------------------
// Context class
// ---------------------------------------------------------------------------

export class Context {
  private readonly options: ContextOptions;
  private readonly embedder: Embedder;
  readonly embedderInfo: EmbedderInfo;
  private readonly store: Store;
  private readonly reranker: Reranker | null;

  private constructor(options: ContextOptions, embedder: Embedder, embedderInfo: EmbedderInfo) {
    this.options = {
      basePath: process.cwd(),
      vectorsDir: '.context/vectors',
      ...options,
    };
    this.embedder = embedder;
    this.embedderInfo = embedderInfo;
    this.store = new Store(this.options.vectorsDir!, embedder, this.options);
    this.reranker = createReranker(this.options.rerankWeights);
  }

  static async create(options: ContextOptions): Promise<Context> {
    const embedder = new Embedder();
    await embedder.embed('probe');

    const vectorsDir = options.vectorsDir ?? '.context/vectors';

    if (!fs.existsSync(vectorsDir)) {
      fs.mkdirSync(vectorsDir, { recursive: true });
    }

    return new Context(options, embedder, { dimensions: embedder.dimensions });
  }

  async load(library: string, pattern: string | string[]): Promise<void> {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    const files = await glob(patterns, { absolute: true });

    const sampleText = await loadSampleText(files);

    await this.store.create(library, sampleText);

    const docs: LoadedDoc[] = await Promise.all(
      files.map(async (filePath) => {
        const loader = getLoader(filePath);
        if (!loader) throw new Error(`No loader for ${filePath}`);

        const doc = await loader.load(filePath);
        const relativePath = path.relative(this.options.basePath!, filePath);
        return {
          ...doc,
          id: pathToId(relativePath),
          contentHash: computeContentHash(doc.content),
          path: relativePath,
        };
      }),
    );

    const docIds = docs.map((d) => d.id);
    const existing = await this.store.fetchDocs(library, docIds, ['contentHash']);

    const docsToEmbed = docs.filter(
      (doc) => !existing[doc.id] || existing[doc.id].fields.contentHash !== doc.contentHash,
    );

    if (this.options.onProgress) {
      this.options.onProgress('load', { loaded: docsToEmbed.length, total: files.length });
    }

    if (docsToEmbed.length === 0) return;

    const contents = docsToEmbed.map((doc) => doc.content);
    const vectors = await this.embedder.embedBatch(contents);

    if (this.options.onProgress) {
      this.options.onProgress('embed', { loaded: vectors.length, total: docsToEmbed.length });
    }

    const zvecDocs: ZvecDoc[] = docsToEmbed.map((doc, index) => ({
      id: doc.id,
      vector: vectors[index],
      fields: {
        content: doc.content,
        meta: doc.meta ? JSON.stringify(doc.meta) : '',
        path: doc.path,
        contentHash: doc.contentHash,
      },
    }));

    await this.store.addDoc(library, zvecDocs);

    if (this.options.onProgress) {
      this.options.onProgress('insert', { loaded: zvecDocs.length, total: docsToEmbed.length });
    }
  }

  async query(text: string, options: QueryOptions): Promise<QueryResult[]> {
    const opt = { topK: 5, mode: 'hybrid' as const, rerank: { rerankFactor: 3, minCandidates: 10 }, ...options };

    const { library, topK, mode, rerank } = opt;

    // Expand the query with synonyms / cross-language bridging terms.
    const expandedText = expand(text, this.options.queryExpansion);

    const vector = await this.embedder.embed(expandedText);

    const rerankConfig = typeof rerank === 'object' ? rerank : null;
    const rerankEnabled = rerankConfig !== null;
    const rerankFactor = rerankConfig?.rerankFactor ?? 3;
    const minCandidates = rerankConfig?.minCandidates ?? 10;
    const searchTopK = rerankEnabled ? Math.max(topK * rerankFactor, minCandidates) : topK;

    const searchResults = await this.store.queryDoc(library, {
      mode,
      queryText: expandedText,
      queryVector: vector,
      topK: searchTopK,
      filter: options.filter,
    });

    const queryResults: QueryResult[] = searchResults.map((result) => {
      const content = String(result.fields?.content ?? '');
      const metaStr = result.fields?.meta as string | undefined;
      const meta = safeJsonParse(metaStr) as Record<string, unknown> | undefined;

      return {
        id: result.id,
        content,
        score: result.score,
        scoreMode: mode === 'hybrid' ? ('hybrid' as const) : ('vector' as const),
        meta,
        path: result.fields?.path as string | undefined,
      };
    });

    if (rerankEnabled && queryResults.length > topK) {
      const docs: RerankCandidate[] = queryResults.map((r) => ({
        id: r.id,
        content: r.content,
        score: r.score,
      }));

      const reranked = await this.reranker!.rerank(text, docs);

      const scoreMap = new Map(reranked.map((r) => [r.id, r.score]));
      for (const result of queryResults) {
        const newScore = scoreMap.get(result.id);
        if (newScore !== undefined) {
          result.score = newScore;
          result.scoreMode = 'reranked';
        }
      }
    }

    queryResults.sort((a, b) => b.score - a.score);
    return queryResults.slice(0, topK);
  }

  async close(): Promise<void> {
    await this.store.closeAll();
  }
}