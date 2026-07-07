/**
 * embedder — aggregate entry point for all embedding modules.
 *
 * Re-exports from split files:
 *   types.ts        → Embedder interface
 *   transformers.ts → TransformersEmbedder
 *   manager.ts      → EmbedderManager, getEmbedder, resetEmbedder
 *   resolve.ts      → resolveEmbedder
 *
 * Language detection & tokenizer utilities have moved to src/utils/tokenizer.ts.
 * They are still available via the embedder module for backward compatibility.
 */

// Types
export type { Embedder } from './types';

// Language detection & CJK utilities — re-exported from utils for backward compatibility
export { isCJK, detectLanguage, tokenizerForLanguage, detectTokenizer } from '../utils/tokenizer';
export type { LanguageHint } from '../utils/tokenizer';

// TransformersEmbedder — production-quality model embedder
export { TransformersEmbedder } from './transformers';

// EmbedderManager & global convenience functions
export { EmbedderManager, getEmbedder, resetEmbedder } from './manager';

// Embedder resolution
export { resolveEmbedder } from './resolve';
export type { EmbedderInfo, EmbedderKind } from './resolve';