// ---------------------------------------------------------------------------
// Public API — main entry points for typical usage
// ---------------------------------------------------------------------------

export { Context } from './context';
export * from './types';

// Loaders — file format handlers (commonly extended by users)
export {
  Loader,
  MarkdownLoader,
  JsonLoader,
  TextLoader,
} from './loaders';
export { pathToId } from './loaders/util';

// Reranker — two-stage retrieval precision scoring
export { KeywordReranker, createReranker } from './reranker';
export type { Reranker, RerankCandidate, RerankResult } from './reranker';

// Query expansion — synonym bridging for cross-language recall
export { SynonymExpander, NoopExpander } from './query-expander';
export type { QueryExpander } from './query-expander';

// ---------------------------------------------------------------------------
// Advanced API — for extending or customizing internals
// ---------------------------------------------------------------------------

// Embedder — custom embedding strategies
export {
  TransformersEmbedder,
  EmbedderManager,
  getEmbedder,
  resetEmbedder,
  isCJK,
  detectLanguage,
  tokenizerForLanguage,
  detectTokenizer,
} from './embedder';
export type { Embedder } from './embedder';
export type { LanguageHint } from './embedder';
export type { EmbedderInfo, EmbedderKind } from './embedder';

// Zvec store — custom vector storage backends
export {
  IZvecStore,
  MemoryZvecStore,
  ActualZvecStore,
  createZvecStore,
  openZvecStore,
  openZvecStoreSync,
  isZvecAvailable,
  buildZvecSchema,
  cosineSimilarity,
} from './storage/zvec-store';
export type {
  ZvecDoc,
  ZvecQueryResult,
  ZvecSearchParams,
  ZvecHybridParams,
  FtsFieldWeight,
  ZvecFieldSchema,
  ZvecStoreConfig,
  ActualZvecStoreOptions,
} from './storage/zvec-store';

// DocumentRegistry — dedup tracking
export { DocumentRegistry } from './registry';

// StoreManager — zvec store lifecycle management
export { StoreManager } from './store-manager';

