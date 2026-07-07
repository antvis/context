/**
 * utils — aggregate entry point for all utility modules.
 *
 * Pure functions and lightweight classes that don't belong to
 * a specific domain module (embedder, loaders, storage).
 */

// Common helpers — JSON parsing, sampling
export {
  safeParseMeta,
  selectSampleFiles,
} from './common';

// Hashing — SHA-256 content hash for dedup & ID generation
export { computeContentHash } from './hash';

// Tokenizer selection — language detection & FTS tokenizer auto-configuration
export {
  isCJK,
  detectLanguage,
  tokenizerForLanguage,
  detectTokenizer,
} from './tokenizer';
export type { LanguageHint } from './tokenizer';

// Query expansion — synonym-based query augmentation
export { SynonymExpander, NoopExpander } from './expander';
export type { QueryExpander } from './expander';

// Reranking — second-stage keyword precision scoring
export { KeywordReranker, createReranker } from './reranker';
export type { Reranker, RerankCandidate, RerankResult, RerankOptions } from './reranker';
