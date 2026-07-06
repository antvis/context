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
export { KeywordReranker, createReranker } from './utils/reranker';
export type { Reranker, RerankCandidate, RerankResult } from './utils/reranker';

// Query expansion — synonym bridging for cross-language recall
export { SynonymExpander, NoopExpander } from './utils/expander';
export type { QueryExpander } from './utils/expander';

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
  ZvecFieldSchema,
  ZvecStoreConfig,
  ActualZvecStoreOptions,
} from './storage/zvec-store';

// DocumentRegistry — dedup tracking
export { DocumentRegistry } from './registry';

// Store — zvec store lifecycle management
export { Store } from './storage/store';
export type { StoreQueryParams } from './storage/store';

