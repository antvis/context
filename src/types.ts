/**
 * Document structure
 */
export interface Document {
  /** Document unique identifier (default: file path) */
  id: string;
  /** Document content */
  content: string;
  /** Markdown front-matter metadata */
  meta?: Record<string, unknown>;
  /**
   * Chunk metadata — populated when document chunking is enabled.
   * Undefined for whole-document (unchunked) mode.
   */
  chunk?: ChunkMeta;
  /**
   * SHA-256 content hash (16 chars) — used internally for change detection.
   * Populated by `Context.load()` before registry insertion; not stored in zvec.
   */
  contentHash?: string;
}

/** Metadata for a chunked document fragment. */
export interface ChunkMeta {
  /** Zero-based chunk index within the parent document. */
  chunkIndex: number;
  /** Total number of chunks in the parent document. */
  totalChunks: number;
  /** Parent document ID (hash-based). */
  parentDocId: string;
  /** Heading path from the document root to this chunk. */
  headingPath: string[];
}

/** Configuration for query expansion. */
export interface QueryExpansionOptions {
  /**
   * Synonym map for query term expansion.
   *
   * Entirely user-provided — no built-in defaults. Each key maps to
   * an array of alternative terms that will be appended to the query
   * when the key is found. Useful for CN↔EN terminology bridging
   * or domain-specific synonym expansion.
   *
   * Oomit or pass an empty map for no expansion (effectively a no-op).
   * Set `queryExpansion: false` to disable expansion entirely.
   */
  synonyms?: Record<string, string[]>;
}

/** Configuration for reranking. */
export interface RerankOptions {
  /**
   * How many extra candidates to pull from the coarse search stage.
   * e.g. with topK=5 and rerankFactor=3, 15 candidates are reranked.
   * Default: 3
   */
  rerankFactor?: number;
  /**
   * Minimum number of candidates to rerank (floor).
   * Default: 10
   */
  minCandidates?: number;
}

/** Configuration for document chunking. Set to `false` to disable.
 *
 * Re-exported from loaders/chunker for convenience.
 * See {@link import('./loaders/chunker').ChunkingOptions} for full details. */
export type { ChunkingOptions } from './loaders/chunker';

/**
 * Context initialization options
 */
export interface ContextOptions {
  /** Directory to store vector files */
  vectorsDir: string;
  /** Transformers model name */
  model?: string;
  /**
   * Base path for resolving document IDs.
   *
   * When set, file paths are resolved relative to this directory before
   * generating IDs, so the same document gets the same ID regardless of
   * the absolute path on different machines.
   *
   * Defaults to `process.cwd()`.
   */
  basePath?: string;
  /** Custom loaders to register (default: MarkdownLoader, JsonLoader, TextLoader) */
  loaders?: import('./loaders').Loader[];
  /**
   * Custom embedder instance. When provided, skips the auto-resolution
   * logic and uses this embedder directly. Useful for tests or when you
   * have a pre-initialized embedder.
   */
  embedder?: import('./embedder').Embedder;

  /**
   * Callback invoked when the embedder resolution falls back to
   * SimpleEmbedder (lower recall quality).
   *
   * Use this to alert users, log diagnostics, or trigger a retry later.
   * Not called when a custom `embedder` is provided.
   *
   * Example:
   * ```ts
   * const ctx = await Context.create({
   *   vectorsDir: './vectors',
   *   onEmbedderFallback: (info) => {
   *     console.warn(`Embedder fallback: ${info.fallbackReason}`);
   *   },
   * });
   * ```
   */
  onEmbedderFallback?: (info: import('./embedder/resolve').EmbedderInfo) => void;

  /**
   * Progress callback for `load()` — called after each major phase completes.
   *
   * Useful for logging, progress bars, or UI updates when loading large
   * document sets. Not called for `query()` or other methods.
   *
   * Example:
   * ```ts
   * const ctx = await Context.create({
   *   vectorsDir: './vectors',
   *   onProgress: (phase, detail) => {
   *     console.log(`${phase}: ${detail.loaded}/${detail.total} files`);
   *   },
   * });
   * ```
   */
  onProgress?: (phase: LoadPhase, detail: LoadProgress) => void;

  /**
   * Document chunking configuration.
   *
   * When enabled, each document is split into semantic chunks (heading-aware
   * for Markdown, fixed-size for plain text). Each chunk is independently
   * embedded and can be retrieved at a finer granularity.
   *
   * Set to `false` to disable chunking and embed whole documents instead.
   * Defaults to enabled with `{ strategy: 'auto', maxChunkSize: 1024, chunkOverlap: 128 }`.
   */
  chunking?: import('./loaders/chunker').ChunkingOptions | false;

  /**
   * Query expansion configuration.
   *
   * When enabled, query terms are expanded with CN↔EN synonym bridges so a
   * single query can match documents in both languages. The expanded text
   * is used for embedding and FTS.
   *
   * Pass a custom `synonyms` map to add domain-specific terms. Set to `false`
   * to disable expansion entirely.
   *
   * Defaults to enabled with built-in visualization synonym pairs.
   */
  queryExpansion?: QueryExpansionOptions | false;

  // ── Hybrid search & weighting ─────────────────────────────────────────

  /**
   * Fields to index for Full Text Search (FTS).
   *
   * By default, `content` is indexed. Add more fields (e.g. `meta.title`)
   * to include metadata in text-based recall.
   *
   * Only affects newly created stores — existing stores keep their schema.
   */
  ftsFields?: string[];

  /**
   * Per-field boost weights for the FTS text path in hybrid search.
   *
   * Higher weight → field contributes more to the text ranking score.
   * Example: `{ content: 1, title: 3 }` makes title matches 3× more
   * influential than content matches.
   *
   * Defaults to `{ content: 1 }` when `ftsFields` includes `content`.
   */
  ftsFieldWeights?: Record<string, number>;

  /**
   * FTS tokenizer for full-text search indexing.
   *
   * - `'jieba'` (default): Chinese word segmentation, best for CN/mixed content
   * - `'standard'`: English stemmer + stop words, best for pure English content
   * - `'auto'`: same as `'jieba'` (safe default for bilingual datasets)
   *
   * Only affects newly created stores. Existing stores keep their schema.
   */
  tokenizer?: 'jieba' | 'standard' | 'auto';

  /**
   * RRF rank constant for hybrid search fusion.
   *
   * Controls how much influence rare (low-rank) results have.
   * - Lower value (e.g. 10) → top ranks dominate, more "winner-takes-all"
   * - Higher value (e.g. 100) → ranks are more evenly weighted
   *
   * Defaults to 60 (standard RRF default).
   */
  rankConstant?: number;
}

/**
 * Query options
 */
export interface QueryOptions {
  /**
   * Library name(s) to query.
   *
   * - Single library: `'g2'`
   * - Multiple libraries: `['g2', 'f2']`
   * - All libraries: `'*'`
   *
   * Comma-separated strings (`'g2,f2'`) are also supported for backward
   * compatibility but the array form is preferred.
   */
  library: string | string[];
  /** Number of results to return */
  topK?: number;
  /**
   * Search mode.
   *
   * - `'hybrid'` (default): combines vector similarity + FTS text matching
   *   via RRF fusion. Better recall when query terms appear literally in
   *   documents (e.g. exact API names, configuration keys).
   * - `'vector'`: pure semantic vector search only. Useful when FTS is not
   *   needed or the store has no FTS indexes.
   */
  mode?: 'hybrid' | 'vector';

  /**
   * Reranking configuration.
   *
   * When enabled, the query pipeline uses two-stage retrieval:
   *   1. Coarse search (vector / hybrid) returns topK × rerankFactor candidates
   *   2. Reranker scores each candidate against the query for precision
   *   3. Final sort by reranked score → topK results
   *
   * Set to `false` to skip reranking (default). Pass an object to configure
   * the rerank factor and minimum candidate pool size.
   */
  rerank?: RerankOptions | false;

  /**
   * Filter expression to narrow search results.
   *
   * Passed directly to the zvec engine as an exact-match filter.
   * Format: `"field = 'value'"` or `"field = 'val1' AND field2 = 'val2'"`.
   *
   * Useful for scoping queries to specific document categories, versions,
   * or parent documents:
   *   `"parentDocId = 'f3a1b2c4__getting_started'"` — all chunks of one doc
   *   `"chunkIndex = 0"` — only first chunks
   */
  filter?: string;
}

/**
 * Query result
 */
export interface QueryResult {
  /** Document ID */
  id: string;
  /** Document content */
  content: string;
  /** Similarity score (normalized to [0, 1] range) */
  score: number;
  /**
   * How the score was computed — helps users interpret and compare
   * scores across different query modes.
   *
   * - `'vector'`: cosine similarity from pure vector search (0~1)
   * - `'hybrid'`: RRF fusion score from vector + FTS text path
   * - `'reranked'`: keyword reranker score, min-max normalized to [0, 1]
   */
  scoreMode?: 'vector' | 'hybrid' | 'reranked';
  /** Document metadata */
  meta?: Record<string, unknown>;
  /**
   * Chunk metadata — present when the result is a chunk of a larger document.
   * Use `parentDocId` to look up the original document; `headingPath` shows
   * the section path (e.g. ["Configuration", "Line Chart"]).
   */
  chunk?: ChunkMeta;
  /**
   * Original file path relative to `basePath` — allows users to trace
   * back to the source document for context review or navigation.
   *
   * Populated during `load()` and stored as a zvec field.
   */
  sourceFilePath?: string;
  /**
   * The library this result came from.
   *
   * Useful when querying multiple libraries (`library: ['g2', 'f2']` or `'*'`)
   * to distinguish which library contributed each result.
   */
  library?: string;
}

/**
 * Load progress phases — emitted by `Context.load()` via the `onProgress` callback.
 */
export type LoadPhase = 'load' | 'chunk' | 'embed' | 'insert';

/**
 * Load progress detail — passed to `onProgress` callback.
 */
export interface LoadProgress {
  /** How many documents/chunks have been processed in this phase */
  loaded: number;
  /** Total documents/chunks to process in this phase */
  total: number;
}

// Re-export zvec types for convenience (also available from storage/zvec-store)
export type {
  ZvecDoc,
  ZvecQueryResult,
  ZvecSearchParams,
  ZvecHybridParams,
  FtsFieldWeight,
  ZvecFieldSchema,
  ZvecStoreConfig,
} from './storage/zvec-store';
