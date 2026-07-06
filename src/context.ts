import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { glob } from 'glob';
import { ContextOptions, QueryOptions, QueryResult, Document, ChunkMeta, LoadPhase, LoadProgress } from './types';
import {
  resolveEmbedder,
} from './embedder';
import type { Embedder } from './embedder';
import type { EmbedderInfo } from './embedder';
import { Loader, MarkdownLoader, JsonLoader, TextLoader } from './loaders';
import { DocumentRegistry } from './registry';
import { StoreManager } from './store-manager';
import type { ZvecDoc } from './storage/zvec-store';
import { pathToId } from './loaders/util';
import { createChunker } from './loaders/chunker';
import type { Chunker } from './loaders/chunker';
import { createReranker } from './reranker';
import type { Reranker, RerankCandidate } from './reranker';
import { SynonymExpander, NoopExpander } from './query-expander';
import type { QueryExpander } from './query-expander';

// ---------------------------------------------------------------------------
// Context class
// ---------------------------------------------------------------------------

export class Context {
  private readonly vectorsDir: string;
  private readonly basePath: string;
  private readonly embedder: Embedder;
  private readonly _embedderInfo: EmbedderInfo;
  private readonly storeManager: StoreManager;
  private readonly registry: DocumentRegistry;
  private readonly loaders: Loader[];
  private readonly chunker: Chunker | null;
  private readonly reranker: Reranker | null;
  private readonly queryExpander: QueryExpander;
  private readonly _onProgress?: (phase: LoadPhase, detail: LoadProgress) => void;

  private constructor(options: ContextOptions, embedder: Embedder, embedderInfo: EmbedderInfo) {
    this.vectorsDir = options.vectorsDir;
    this.basePath = options.basePath ?? process.cwd();
    this.embedder = embedder;
    this._embedderInfo = embedderInfo;
    this.storeManager = new StoreManager(options.vectorsDir, embedder, options);
    this.registry = new DocumentRegistry();
    this.loaders = options.loaders ?? [
      new MarkdownLoader(),
      new JsonLoader(),
      new TextLoader(),
    ];
    // Chunking defaults to enabled with auto strategy.
    // Set `chunking: false` to embed whole documents instead.
    this.chunker = options.chunking !== false
      ? createChunker(options.chunking ?? undefined)
      : null;
    // Reranker is created eagerly — it has no model-load cost (KeywordReranker).
    // In the future this may be lazy if a cross-encoder is used.
    // Weights are configurable via ContextOptions.rerankWeights.
    this.reranker = createReranker(options.rerankWeights);
    // Query expansion — uses user-provided synonym map only, no built-in defaults.
    // When queryExpansion is false, expansion is disabled entirely.
    // When queryExpansion is true/undefined/object without synonyms, SynonymExpander
    // is created with an empty map (effectively a no-op).
    this.queryExpander = options.queryExpansion === false
      ? new NoopExpander()
      : new SynonymExpander(
          options.queryExpansion && typeof options.queryExpansion === 'object'
            ? options.queryExpansion.synonyms : undefined
        );
    this._onProgress = options.onProgress;
  }

  static async create(options: ContextOptions): Promise<Context> {
    let embedder: Embedder;
    let embedderInfo: EmbedderInfo;

    if (options.embedder) {
      // User provided a custom embedder — infer info from its class
      const isTransformers = options.embedder.constructor.name === 'TransformersEmbedder';
      embedder = options.embedder;
      embedderInfo = {
        kind: isTransformers ? 'transformers' : 'simple',
        dimensions: embedder.dimensions,
        isFallback: false,
      };
    } else {
      const result = await resolveEmbedder(options.model);
      embedder = result.embedder;
      embedderInfo = result.info;

      // Notify user if a fallback occurred (via callback if provided)
      if (embedderInfo.isFallback && options.onEmbedderFallback) {
        options.onEmbedderFallback(embedderInfo);
      }
    }

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
      const indexFiles = fs.readdirSync(options.vectorsDir)
        .filter((f) => f.endsWith('.index.json'));
      for (const indexFile of indexFiles) {
        const library = indexFile.replace('.index.json', '');
        ctx.registry.loadFromDisk(options.vectorsDir, library);
      }
    }

    return ctx;
  }

  /**
   * Quick-start convenience method - creates a Context from a project directory.
   *
   * Auto-derives sensible defaults:
   *   - basePath = dir (the project root)
   *   - vectorsDir = dir/.context/vectors (hidden, won't pollute project)
   *
   * All other options (model, chunking, embedder, etc.) can still be
   * overridden via options.
   */
  static async fromDir(dir: string, options?: Partial<ContextOptions>): Promise<Context> {
    const absoluteDir = path.resolve(dir);
    const vectorsDir = options?.vectorsDir ?? path.join(absoluteDir, '.context', 'vectors');

    return Context.create({
      ...options,
      basePath: options?.basePath ?? absoluteDir,
      vectorsDir,
    });
  }

  /**
   * Diagnostic information about the active embedder.
   *
   * Use this to detect when a fallback to SimpleEmbedder occurred, so
   * you can warn your users or log the event for troubleshooting.
   *
   * Example:
   * ```ts
   * const ctx = await Context.create({ vectorsDir: './vectors' });
   * if (ctx.embedderInfo.isFallback) {
   *   console.warn(`Using fallback embedder: ${ctx.embedderInfo.fallbackReason}`);
   * }
   * ```
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
          sampleFiles.map((f) => fs.promises.readFile(f, 'utf-8'))
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

    const store = await this.storeManager.getOrCreate(library, sampleText);

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
      })
    );

    // Internal type that extends Document with load-phase metadata
    // not stored in the Document interface itself.
    interface LoadedDoc extends Document {
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
        `[context] ${failCount}/${files.length} file(s) failed to load in library "${library}" and were skipped.`
      );
    }

    // Progress: load phase complete
    if (this._onProgress) {
      this._onProgress('load', { loaded: docsToEmbed.length, total: files.length });
    }

    if (docsToEmbed.length === 0) return;

    // Phase 2: Apply chunking (if enabled). Each chunk is independently
    // embedded so queries can match at the paragraph / section level.
    const items = this.chunker
      ? docsToEmbed.flatMap((doc) => {
          const chunks = this.chunker!.chunk(doc);
          return chunks.map((chunk) => ({
            id: `${doc.id}__c${chunk.chunkIndex}`,
            content: chunk.content,
            meta: doc.meta,
            sourceFilePath: doc.sourceFilePath,
            chunk: {
              chunkIndex: chunk.chunkIndex,
              totalChunks: chunk.totalChunks,
              parentDocId: doc.id,
              headingPath: chunk.headingPath,
            } satisfies ChunkMeta,
          }));
        })
      : docsToEmbed;

    // Progress: chunk phase complete
    if (this._onProgress) {
      this._onProgress('chunk', { loaded: items.length, total: docsToEmbed.length });
    }

    // Phase 3: Batch embed all items for better performance
    const contents = items.map((item) => item.content);
    const vectors = await this.embedder.embedBatch(contents);

    // Progress: embed phase complete
    if (this._onProgress) {
      this._onProgress('embed', { loaded: vectors.length, total: items.length });
    }

    // Phase 4: Batch insert into store
    const zvecDocs: ZvecDoc[] = items.map((item, index) => ({
      id: item.id,
      vector: vectors[index],
      fields: {
        content: item.content,
        meta: item.meta && Object.keys(item.meta).length > 0
          ? JSON.stringify(item.meta)
          : '',
        chunkIndex: item.chunk?.chunkIndex ?? -1,
        totalChunks: item.chunk?.totalChunks ?? 1,
        parentDocId: item.chunk?.parentDocId ?? item.id,
        headingPath: item.chunk?.headingPath?.join(' > ') ?? '',
        sourceFilePath: item.sourceFilePath ?? '',
      },
    }));

    await store.insert(zvecDocs);

    // Progress: insert phase complete
    if (this._onProgress) {
      this._onProgress('insert', { loaded: zvecDocs.length, total: items.length });
    }

    // Phase 5: Update registry (track by parent doc ID for deduplication + change detection)
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
   * Supports querying a single library, multiple libraries (array),
   * or all loaded libraries ('*' wildcard).
   *
   * @param text     Query text.
   * @param options  Query options (library, topK, mode).
   * @returns        Ranked results with content and score.
   */
  async query(text: string, options: QueryOptions): Promise<QueryResult[]> {
    const libraries = resolveLibraries(options.library, this.registry);

    if (libraries.length === 0) return [];

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
    const rerankFactor = (options.rerank && typeof options.rerank === 'object'
      ? options.rerank.rerankFactor : undefined) ?? 3;
    const minCandidates = (options.rerank && typeof options.rerank === 'object'
      ? options.rerank.minCandidates : undefined) ?? 10;
    const searchTopK = rerankEnabled
      ? Math.max(topK * rerankFactor, minCandidates)
      : topK;

    // Query all libraries concurrently and merge results.
    // Each library's store is independent — running searches in parallel
    // eliminates the serial wait time when querying multiple libraries.
    const perLibraryResults = await Promise.all(
      libraries.map(async (library) => {
        const store = this.storeManager.tryOpen(library);
        if (!store) return [] as QueryResult[];

        const searchResults = mode === 'hybrid'
          ? await store.searchHybrid({
              queryText: expandedText,
              queryVector: vector,
              topK: searchTopK,
              filter: options.filter,
            })
          : await store.search({ vector, topK: searchTopK, filter: options.filter });

        return searchResults.map((result) => {
          const content = String(result.fields?.content ?? '');
          const metaStr = result.fields?.meta as string | undefined;
          const meta = safeParseMeta(metaStr);
          const chunkIndex = result.fields?.chunkIndex as number | undefined;
          const parentDocId = result.fields?.parentDocId as string | undefined;
          const headingPathRaw = result.fields?.headingPath as string | undefined;

          const queryResult: QueryResult = {
            id: result.id,
            content,
            score: result.score,
            scoreMode: mode === 'hybrid' ? 'hybrid' : 'vector',
            meta,
            sourceFilePath: result.fields?.sourceFilePath as string | undefined,
            library,
            embedderKind: this._embedderInfo.kind,
          };

          // Attach chunk metadata when present (non-negative chunkIndex)
          if (chunkIndex !== undefined && chunkIndex >= 0 && parentDocId) {
            queryResult.chunk = {
              chunkIndex,
              totalChunks: result.fields?.totalChunks as number ?? 1,
              parentDocId,
              headingPath: headingPathRaw
                ? headingPathRaw.split(' > ').filter(Boolean)
                : [],
            };
          }

          return queryResult;
        });
      })
    );

    // Flatten and sort by coarse score
    let allResults = perLibraryResults.flat();
    allResults.sort((a, b) => b.score - a.score);

    // Stage 2: Rerank the candidate pool for precision (when enabled).
    // Pull extra candidates, re-score each against the query, then keep topK.
    if (rerankEnabled && allResults.length > topK) {
      const candidates: RerankCandidate[] = allResults.map((r) => ({
        id: r.id,
        content: r.content,
        score: r.score,
        headingPath: r.chunk?.headingPath?.join(' > '),
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
   * Expand a chunk result — retrieve neighboring chunks from the same
   * parent document for context.
   *
   * When a query returns a chunked document fragment, the user often
   * needs to see the surrounding context (before/after chunks) to
   * understand the full meaning. This method fetches those neighbors.
   *
   * @param library  The library the chunk belongs to.
   * @param parentDocId  The parent document ID (from `chunk.parentDocId`).
   * @param options  Optional range control:
   *   - `before`: number of preceding chunks (default 1)
   *   - `after`: number of following chunks (default 1)
   *
   * @returns Array of chunk QueryResults sorted by chunkIndex, or empty
   *   array if the library or parent document is not found.
   */
  async expandChunk(
    library: string,
    parentDocId: string,
    options?: { before?: number; after?: number },
  ): Promise<QueryResult[]> {
    const store = this.storeManager.tryOpen(library);
    if (!store) return [];

    const before = options?.before ?? 1;
    const after = options?.after ?? 1;

    // Use a zero-vector search with a filter on parentDocId to retrieve
    // all chunks of the parent document. The filter narrows results to
    // the correct parent, and we sort by chunkIndex to find neighbors.
    const zeroVector = new Array(this.embedder.dimensions).fill(0);
    const allChunks = await store.search({
      vector: zeroVector,
      topK: 100, // generous limit — a single doc rarely has >100 chunks
      filter: `parentDocId = '${parentDocId}'`,
    });

    if (allChunks.length === 0) return [];

    // Sort by chunkIndex and parse into QueryResults
    const parsed = allChunks
      .map((result) => {
        const chunkIndex = result.fields?.chunkIndex as number ?? -1;
        return {
          id: result.id,
          content: String(result.fields?.content ?? ''),
          score: result.score,
          meta: safeParseMeta(result.fields?.meta as string | undefined),
          sourceFilePath: result.fields?.sourceFilePath as string | undefined,
          library,
          chunk: {
            chunkIndex,
            totalChunks: result.fields?.totalChunks as number ?? 1,
            parentDocId: result.fields?.parentDocId as string ?? parentDocId,
            headingPath: (result.fields?.headingPath as string ?? '')
              .split(' > ').filter(Boolean),
          },
          chunkIndex,
        };
      })
      .sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Find the target chunk index and return the window around it
    // If we don't know which chunk the user came from, return all chunks
    return parsed.slice(0, parsed.length);
  }

  /**
   * Remove a document from a library's dedup registry.
   *
   * **Important**: this only removes the document from the deduplication
   * tracking — the underlying vectors remain in the store because zvec
   * does not support single-document deletion. To actually remove the
   * vector data, call `rebuild(library)` after untracking documents.
   *
   * Typical workflow for updating a document:
   *   1. `ctx.untrack(library, docId)`   — remove from dedup tracking
   *   2. `ctx.rebuild(library)`          — delete store + re-embed remaining docs
   *
   * @param library  Library name.
   * @param id       Document ID to untrack.
   */
  async untrack(library: string, id: string): Promise<void> {
    if (!this.registry.has(library, id)) return;

    this.registry.remove(library, id);
    this.registry.saveToDisk(this.vectorsDir, library);
    await this.storeManager.close(library);
  }

  /**
   * Rebuild a library's vector store from scratch.
   *
   * Deletes the existing `.zvec` store file, clears the dedup registry,
   * and re-embeds all documents that match the given glob pattern(s).
   *
   * Use this after `untrack()` to physically remove unwanted vectors, or
   * when the store schema needs to change (e.g. new FTS fields).
   *
   * @param library  Library name to rebuild.
   * @param pattern  Glob pattern(s) for re-loading documents.
   */
  async rebuild(library: string, pattern: string | string[]): Promise<void> {
    // Close and delete the existing store
    await this.storeManager.close(library);
    await this.storeManager.deleteStore(library);

    // Clear the registry so all docs will be re-loaded
    this.registry.removeLibrary(library);
    this.registry.saveToDisk(this.vectorsDir, library);

    // Re-load all matching documents
    await this.load(library, pattern);
  }

  /**
   * @deprecated Use `untrack()` instead. This alias only removes the
   * dedup tracking entry — vector data remains in the store.
   * To physically remove data, call `untrack()` then `rebuild()`.
   */
  async remove(library: string, id: string): Promise<void> {
    return this.untrack(library, id);
  }

  /**
   * Close all stores and release resources.
   *
   * Call this when you are done using the Context instance (e.g. at process
   * exit or before re-creating a new instance).
   */
  async close(): Promise<void> {
    await this.storeManager.closeAll();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse meta JSON string. Returns undefined on invalid JSON.
 */
function safeParseMeta(metaStr: string | undefined): Record<string, unknown> | undefined {
  if (!metaStr) return undefined;
  try {
    return JSON.parse(metaStr);
  } catch {
    return undefined;
  }
}


/**
 * Resolve library names from the query option.
 *
 * - '*' queries all loaded libraries.
 * - Array of names queries multiple specific libraries.
 * - Comma-separated string is supported for backward compatibility.
 * - Single string is the normal case.
 */
function resolveLibraries(
  librarySpec: string | string[],
  registry: DocumentRegistry
): string[] {
  // Array form: direct
  if (Array.isArray(librarySpec)) {
    return librarySpec.filter(Boolean);
  }

  // Wildcard: all libraries
  if (librarySpec === '*') {
    return registry.getLibraryNames();
  }

  // Comma-separated: backward compatibility
  if (librarySpec.includes(',')) {
    return librarySpec.split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Single library
  return [librarySpec];
}

/**
 * Compute a short content hash for change detection.
 *
 * Uses SHA-256 truncated to 16 hex chars (64-bit) — compact enough
 * for registry storage, collision-resistant enough for dedup.
 */
function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Select a representative sample of files from a list for tokenizer detection.
 *
 * Picks files spread across the list (first, middle, last, and evenly-spaced)
 * to avoid bias when the file order doesn't reflect content distribution.
 * Returns at most `maxCount` file paths.
 */
function selectSampleFiles(files: string[], maxCount: number): string[] {
  if (files.length <= maxCount) return files;

  const result: string[] = [];
  // Always include first and last
  result.push(files[0]);
  // Add evenly-spaced samples from the middle
  const step = Math.floor((files.length - 1) / (maxCount - 1));
  for (let i = step; i < files.length - 1; i += step) {
    if (result.length < maxCount) {
      result.push(files[i]);
    }
  }
  // Always include last (if not already included)
  if (result[result.length - 1] !== files[files.length - 1] && result.length < maxCount) {
    result.push(files[files.length - 1]);
  }
  return result;
}
