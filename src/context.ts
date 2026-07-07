import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import {
  ContextOptions,
  QueryOptions,
  QueryResult,
  Document,
  LoadPhase,
  LoadProgress,
} from './types';
import { resolveEmbedder } from './embedder';
import type { Embedder, EmbedderInfo } from './embedder';
import { Loader, MarkdownLoader, JsonLoader, TextLoader } from './loaders';
import { Store } from './storage/store';
import type { ZvecDoc } from './storage/zvec-store';
import { pathToId } from './loaders/util';
import {
  createReranker,
  SynonymExpander,
  NoopExpander,
  safeParseMeta,
  computeContentHash,
  selectSampleFiles,
} from './utils';
import type { Reranker, RerankCandidate, QueryExpander } from './utils';

// ---------------------------------------------------------------------------
// Context class
// ---------------------------------------------------------------------------

export class Context {
  private readonly basePath: string;
  private readonly embedder: Embedder;
  private readonly _embedderInfo: EmbedderInfo;
  private readonly store: Store;
  private readonly loaders: Loader[];
  private readonly reranker: Reranker | null;
  private readonly queryExpander: QueryExpander;
  private readonly _onProgress?: (phase: LoadPhase, detail: LoadProgress) => void;

  private constructor(options: ContextOptions, embedder: Embedder, embedderInfo: EmbedderInfo) {
    this.basePath = options.basePath ?? process.cwd();
    this.embedder = embedder;
    this._embedderInfo = embedderInfo;
    this.store = new Store(options.vectorsDir, embedder, options);
    this.loaders = [new MarkdownLoader(), new JsonLoader(), new TextLoader()];
    this.reranker = createReranker(options.rerankWeights);
    this.queryExpander =
      options.queryExpansion === false
        ? new NoopExpander()
        : new SynonymExpander(
            options.queryExpansion && typeof options.queryExpansion === 'object'
              ? options.queryExpansion.synonyms
              : undefined,
          );
    this._onProgress = options.onProgress;
  }

  static async create(options: ContextOptions): Promise<Context> {
    const result = await resolveEmbedder();
    const embedder = result.embedder;
    const embedderInfo = result.info;

    // Ensure vectors directory exists
    if (!fs.existsSync(options.vectorsDir)) {
      fs.mkdirSync(options.vectorsDir, { recursive: true });
    }

    const ctx = new Context(options, embedder, embedderInfo);

    return ctx;
  }

  /**
   * Diagnostic information about the active embedder.
   */
  get embedderInfo(): EmbedderInfo {
    return this._embedderInfo;
  }

  private getLoader(filePath: string): Loader | undefined {
    return this.loaders.find((loader) => loader.canHandle(filePath));
  }

  /**
   * Load documents into a library with automatic vectorization.
   *
   * Deduplication uses zvec's native document catalog as the single source
   * of truth — already-loaded documents whose content hasn't changed
   * (same contentHash) are skipped. No separate registry file is needed.
   *
   * @param library  Library name for organizing documents.
   * @param pattern  Glob pattern(s) matching files to load.
   */
  async load(library: string, pattern: string | string[]): Promise<void> {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    const files = await glob(patterns, { absolute: true });

    // Sample multiple files for FTS tokenizer auto-detection.
    let sampleText: string | undefined;
    if (files.length > 0) {
      try {
        const sampleFiles = selectSampleFiles(files, 5);
        const samples = await Promise.allSettled(
          sampleFiles.map((f) => fs.promises.readFile(f, 'utf-8')),
        );
        const validSamples = samples
          .filter((r) => r.status === 'fulfilled')
          .map((r) => (r as PromiseFulfilledResult<string>).value);
        if (validSamples.length > 0) {
          sampleText = validSamples.join('\n');
        }
      } catch {
        // Sample failure is non-fatal — fall back to default tokenizer
      }
    }

    await this.store.create(library, sampleText);

    // Internal type that extends Document with load-phase metadata.
    interface LoadedDoc extends Document {
      id: string;
      contentHash: string;
      sourceFilePath: string;
    }

    // Phase 1: Load all files concurrently and collect candidates.
    const loadSettled = await Promise.allSettled(
      files.map(async (filePath) => {
        const loader = this.getLoader(filePath);
        if (!loader) return null;

        const doc = await loader.load(filePath);
        const relativePath = path.relative(this.basePath, filePath);
        const docId = pathToId(relativePath);
        const contentHash = computeContentHash(doc.content);

        return { ...doc, id: docId, contentHash, sourceFilePath: relativePath };
      }),
    );

    const candidates: LoadedDoc[] = [];
    let failCount = 0;
    for (const r of loadSettled) {
      if (r.status === 'fulfilled' && r.value !== null) {
        candidates.push(r.value);
      } else if (r.status === 'rejected') {
        failCount++;
      }
    }
    if (failCount > 0) {
      console.warn(
        `[context] ${failCount}/${files.length} file(s) failed to load in library "${library}" and were skipped.`,
      );
    }

    if (candidates.length === 0) return;

    // Phase 1b: Dedup via zvec — batch-fetch stored contentHashes.
    // Zvec is the single source of truth; no separate registry needed.
    const candidateIds = candidates.map((d) => d.id);
    const existing = await this.store.fetchDocs(library, candidateIds, ['contentHash']);

    const docsToEmbed: LoadedDoc[] = [];
    for (const doc of candidates) {
      const stored = existing[doc.id];
      if (!stored) {
        // New document — embed and insert
        docsToEmbed.push(doc);
      } else if (stored.fields.contentHash !== doc.contentHash) {
        // Content changed — re-embed and update
        docsToEmbed.push(doc);
      }
      // else: contentHash matches → skip (already up to date)
    }

    // Progress: load phase complete
    if (this._onProgress) {
      this._onProgress('load', { loaded: docsToEmbed.length, total: files.length });
    }

    if (docsToEmbed.length === 0) return;

    // Phase 2: Batch embed all items for better performance
    const contents = docsToEmbed.map((doc) => doc.content);
    const vectors = await this.embedder.embedBatch(contents);

    // Progress: embed phase complete
    if (this._onProgress) {
      this._onProgress('embed', { loaded: vectors.length, total: docsToEmbed.length });
    }

    // Phase 3: Batch insert into store (upsert — handles both new and changed docs)
    const zvecDocs: ZvecDoc[] = docsToEmbed.map((doc, index) => ({
      id: doc.id,
      vector: vectors[index],
      fields: {
        content: doc.content,
        meta: doc.meta && Object.keys(doc.meta).length > 0 ? JSON.stringify(doc.meta) : '',
        sourceFilePath: doc.sourceFilePath ?? '',
        contentHash: doc.contentHash,
      },
    }));

    await this.store.addDoc(library, zvecDocs);

    // Progress: insert phase complete
    if (this._onProgress) {
      this._onProgress('insert', { loaded: zvecDocs.length, total: docsToEmbed.length });
    }
  }

  /**
   * Query documents by semantic similarity.
   *
   * Default mode is `'hybrid'` which combines vector similarity + FTS text
   * matching via RRF fusion for better recall. Use `mode: 'vector'` for
   * pure semantic search when FTS is not needed.
   *
   * @param text     Query text.
   * @param options  Query options (library, topK, mode).
   * @returns        Ranked results with content and score.
   */
  async query(text: string, options: QueryOptions): Promise<QueryResult[]> {
    const library = options.library;

    // Expand the query with synonyms / cross-language bridging terms.
    // The expanded text is used for both embedding and FTS, so a single
    // expanded query can match CN and EN documents simultaneously.
    const expandedText = this.queryExpander.expand(text);
    const vector = await this.embedder.embed(expandedText);
    const topK = options.topK ?? 5;
    const mode = options.mode ?? 'hybrid';
    const rerankEnabled = options.rerank !== false;

    // Reranking pipeline: pull extra candidates from the coarse search so the
    // reranker has a larger pool to select from. Without reranking, search
    // exactly topK for efficiency.
    const rerankFactor =
      (options.rerank && typeof options.rerank === 'object'
        ? options.rerank.rerankFactor
        : undefined) ?? 3;
    const minCandidates =
      (options.rerank && typeof options.rerank === 'object'
        ? options.rerank.minCandidates
        : undefined) ?? 10;
    const searchTopK = rerankEnabled ? Math.max(topK * rerankFactor, minCandidates) : topK;

    const searchResults = await this.store.queryDoc(library, {
      mode,
      queryText: expandedText,
      queryVector: vector,
      topK: searchTopK,
      filter: options.filter,
    });

    if (searchResults.length === 0) return [];

    const allResults: QueryResult[] = searchResults.map((result) => {
      const content = String(result.fields?.content ?? '');
      const metaStr = result.fields?.meta as string | undefined;
      const meta = safeParseMeta(metaStr);

      return {
        id: result.id,
        content,
        score: result.score,
        scoreMode: mode === 'hybrid' ? ('hybrid' as const) : ('vector' as const),
        meta,
        sourceFilePath: result.fields?.sourceFilePath as string | undefined,
        embedderKind: this._embedderInfo.kind,
      };
    });

    // Stage 2: Rerank the candidate pool for precision (when enabled).
    // Pull extra candidates, re-score each against the query, then keep topK.
    if (rerankEnabled && allResults.length > topK) {
      const candidates: RerankCandidate[] = allResults.map((r) => ({
        id: r.id,
        content: r.content,
        score: r.score,
      }));

      const reranked = await this.reranker!.rerank(text, candidates);

      // Merge reranked scores back into results
      const scoreMap = new Map(reranked.map((r) => [r.id, r.score]));
      for (const result of allResults) {
        const newScore = scoreMap.get(result.id);
        if (newScore !== undefined) {
          result.score = newScore;
          result.scoreMode = 'reranked';
        }
      }
    }

    // Final sort by (possibly reranked) score and return topK
    allResults.sort((a, b) => b.score - a.score);
    return allResults.slice(0, topK);
  }

  /**
   * Close all stores and release resources.
   *
   * Call this when you are done using the Context instance (e.g. at process
   * exit or before re-creating a new instance).
   */
  async close(): Promise<void> {
    await this.store.closeAll();
  }
}
