/**
 * embedder — aggregate entry point for all embedding modules.
 *
 * Re-exports from split files:
 *   types.ts        → Embedder interface
 *   language.ts     → isCJK, detectLanguage, tokenizerForLanguage, detectTokenizer
 *   transformers.ts → TransformersEmbedder
 *   manager.ts      → EmbedderManager, getEmbedder, resetEmbedder
 *   resolve.ts      → resolveEmbedder
 */

// Types
export type { Embedder } from './types';

// Language detection & CJK utilities
export { isCJK, splitMixed, detectLanguage, tokenizerForLanguage, detectTokenizer } from './language';
export type { LanguageHint } from './language';

// TransformersEmbedder — production-quality model embedder
export { TransformersEmbedder } from './transformers';

// EmbedderManager & global convenience functions
export { EmbedderManager, getEmbedder, resetEmbedder } from './manager';

// Embedder resolution
export { resolveEmbedder } from './resolve';
export type { EmbedderInfo, EmbedderKind, ResolveResult } from './resolve';