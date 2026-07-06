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
import { DocumentRegistry } from './registry';
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
  private readonly vectorsDir: string;
  private readonly basePath: string;
  private readonly embedder: Embedder;
  private readonly _embedderInfo: EmbedderInfo;
  private readonly store: Store;
  private readonly registry: DocumentRegistry;
  private readonly loaders: Loader[];
  private readonly reranker: Reranker | null;
  private readonly queryExpander: QueryExpander;
  private readonly _onProgress?: (phase: LoadPhase, detail: LoadProgress) => void;

  private constructor(options: ContextOptions, embedder: Embedder, embedderInfo: EmbedderInfo) {
    this.vectorsDir = options.vectorsDir;
    this.basePath = options.basePath ?? process.cwd();
    this.embedder = embedder;
    this._embedderInfo = embedderInfo;
    this.store = new Store(options.vectorsDir, embedder, options);
    this.registry = new DocumentRegistry();
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

    // Auto-recover registry from existing index files on disk.
    // When a process restarts, the in-memory registry is empty, but the
    // zvec store and `.index.json` files persist. Scanning for these
    // files and loading them into the registry prevents duplicate
    // re-embedding of unchanged documents.
    if (fs.existsSync(options.vectorsDir)) {
      const indexFiles = fs
        .readdirSync(options.vectorsDir)
        .filter((f) => f.endsWith('.index.json'));
      for (const indexFile of indexFiles) {
        const library = indexFile.replace('.index.json', '');
        ctx.registry.loadFromDisk(options.vectorsDir, library);
      }
    }

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
   * Documents that have already been loaded (same id) are skipped to
   * prevent duplicate vectors in the store. Uses batch embedding for
   * better performance when loading many files at once.
   *
   * Document IDs are derived from the file path relative to `basePath`,
   * ensuring the same document gets the same ID across different machines.
   *
   * @param library  Library name for organizing documents.
   * @param pattern  Glob pattern(s) matching files to load.
   */
  async load(library: string, pattern: string | string[]): Promise<void> {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    const files = await glob(patterns, { absolute: true });

    // Sample multiple files for FTS tokenizer auto-detection.
    // Only used when `tokenizer` is 'auto' and the store does not yet exist.
    // Sampling up to 5 files from different positions in the file list
    // ensures we don't pick the wrong tokenizer when the first file is
    // an English README but most content is Chinese.
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

    const openedStore = await this.store.create(library, sampleText);

    // Load registry from disk if not already loaded for this library
    if (!this.registry.hasLibrary(library)) {
      this.registry.loadFromDisk(this.vectorsDir, library);
    }

    // Phase 1: Load all documents concurrently and filter out duplicates.
    // Each file is an independent I/O operation — running them in parallel
    // eliminates the serial disk-read bottleneck.  We use allSettled so
    // one broken file does not kill the entire batch.
    //
    // Change detection: files whose content hash differs from the stored
    // hash are re-embedded (content was updated since last load).
    const loadSettled = await Promise.allSettled(
      files.map(async (filePath) => {
        const loader = this.getLoader(filePath);
        if (!loader) return null;

        const doc = await loader.load(filePath);

        // Derive ID from relative path for cross-machine consistency
        const relativePath = path.relative(this.basePath, filePath);
        const docId = pathToId(relativePath);

        // Compute content hash for change detection
        const contentHash = computeContentHash(doc.content);

        // Deduplication: skip documents whose content hasn't changed.
        // If the hash differs, the file was updated — re-embed it.
        if (this.registry.has(library, docId, contentHash)) return null;

        return { ...doc, id: docId, contentHash, sourceFilePath: relativePath };
      }),
    );

    // Internal type that extends Document with load-phase metadata.
    // id is required here — Context.load() always assigns it via pathToId.
    interface LoadedDoc extends Document {
      id: string; // override optional Document.id → required
      contentHash?: string;
      sourceFilePath?: string;
    }

    const docsToEmbed: LoadedDoc[] = [];
    let failCount = 0;
    for (const r of loadSettled) {
      if (r.status === 'fulfilled' && r.value !== null) {
        docsToEmbed.push(r.value);
      } else if (r.status === 'rejected') {
        failCount++;
      }
    }
    if (failCount > 0) {
      console.warn(
        `[context] ${failCount}/${files.length} file(s) failed to load in library "${library}" and were skipped.`,
      );
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

    // Phase 3: Batch insert into store
    const zvecDocs: ZvecDoc[] = docsToEmbed.map((doc, index) => ({
      id: doc.id,
      vector: vectors[index],
      fields: {
        content: doc.content,
        meta: doc.meta && Object.keys(doc.meta).length > 0 ? JSON.stringify(doc.meta) : '',
        sourceFilePath: doc.sourceFilePath ?? '',
      },
    }));

    await this.store.addDoc(library, zvecDocs);

    // Progress: insert phase complete
    if (this._onProgress) {
      this._onProgress('insert', { loaded: zvecDocs.length, total: docsToEmbed.length });
    }

    // Phase 4: Update registry (track by parent doc ID for deduplication + change detection)
    for (const doc of docsToEmbed) {
      this.registry.add(library, doc.id, doc.contentHash);
    }
    this.registry.saveToDisk(this.vectorsDir, library);
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
