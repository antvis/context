/**
 * embedder — aggregate entry point for all embedding modules.
 *
 * Re-exports from split files for backward compatibility:
 *   types.ts        → Embedder interface
 *   language.ts     → isCJK, detectLanguage, tokenizerForLanguage, detectTokenizer
 *   simple.ts       → SimpleEmbedder
 *   transformers.ts → TransformersEmbedder
 *   manager.ts      → EmbedderManager, getEmbedder, resetEmbedder
 *   resolve.ts      → resolveEmbedder, isRecoverableError
 */

// Types
export type { Embedder } from './types';

// Language detection & CJK utilities
export { isCJK, splitMixed, detectLanguage, tokenizerForLanguage, detectTokenizer } from './language';
export type { LanguageHint } from './language';

// SimpleEmbedder — lightweight fallback
export { SimpleEmbedder } from './simple';

// TransformersEmbedder — production-quality model embedder
export { TransformersEmbedder } from './transformers';

// EmbedderManager & global convenience functions
export { EmbedderManager, getEmbedder, resetEmbedder } from './manager';

// Embedder resolution & error classification
export { resolveEmbedder, isRecoverableError } from './resolve';
export type { EmbedderInfo, EmbedderKind, ResolveResult } from './resolve';