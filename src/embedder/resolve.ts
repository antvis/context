/**
 * Embedder resolution — auto-selects the best available embedder.
 *
 * Provides `resolveEmbedder()` which tries TransformersEmbedder first,
 * falling back to SimpleEmbedder on model-load failures. Also exports
 * `isRecoverableError()` for distinguishing transient vs code-level errors.
 */

import { Embedder } from './types';
import { SimpleEmbedder } from './simple';
import { TransformersEmbedder, loadTransformersModule } from './transformers';

// ---------------------------------------------------------------------------
// Embedder type info
// ---------------------------------------------------------------------------

/** Describes the kind of embedder being used. */
export type EmbedderKind = 'transformers' | 'simple';

/** Diagnostic information about the resolved embedder. */
export interface EmbedderInfo {
  /** Which embedder implementation is active. */
  kind: EmbedderKind;
  /** Vector dimensions of the active embedder. */
  dimensions: number;
  /** Model ID (only set for TransformersEmbedder). */
  modelId?: string;
  /** Whether the resolution fell back from the preferred embedder. */
  isFallback: boolean;
  /** Reason for fallback (if applicable). */
  fallbackReason?: string;
}

// ---------------------------------------------------------------------------
// Resolve result
// ---------------------------------------------------------------------------

/** The result of embedder resolution — embedder instance + diagnostic info. */
export interface ResolveResult {
  embedder: Embedder;
  info: EmbedderInfo;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Resolve which Embedder to use based on the model option.
 *
 * - If model is specified, try TransformersEmbedder first, fall back to
 *   SimpleEmbedder on failure (with a cooldown to allow retry).
 * - If no model, try TransformersEmbedder with the default model.
 *
 * Returns both the embedder instance and diagnostic info so callers
 * can detect fallbacks and report them to users.
 */
export async function resolveEmbedder(model?: string): Promise<ResolveResult> {
  const t = await loadTransformersModule();

  if (t) {
    try {
      const embedder = new TransformersEmbedder(undefined, { modelId: model });
      await embedder.embed('probe');
      return {
        embedder,
        info: {
          kind: 'transformers',
          dimensions: embedder.dimensions,
          modelId: model ?? 'onnx-community/bge-small-zh-v1.5-ONNX',
          isFallback: false,
        },
      };
    } catch (err) {
      // Only fallback for network/model-load errors, not for code bugs
      if (isRecoverableError(err)) {
        const reason = (err as Error).message?.split('\n')[0] ?? 'unknown';
        console.warn(
          `[context] Model (${model ?? 'bge-small-zh-v1.5'}) load failed, falling back to basic mode (lower recall quality).\n` +
          `  To fix model download:\n` +
          `    1. Set mirror: export HF_ENDPOINT=https://hf-mirror.com\n` +
          `    2. Manual download: node scripts/download-model.mjs\n`
        );
        const fallback = new SimpleEmbedder();
        return {
          embedder: fallback,
          info: {
            kind: 'simple',
            dimensions: fallback.dimensions,
            isFallback: true,
            fallbackReason: reason,
          },
        };
      }
      // Unrecoverable errors should propagate
      throw err;
    }
  }

  // Transformers not installed — fallback
  console.warn(
    '[context] @huggingface/transformers not installed, using basic mode (lower recall quality).\n' +
    '  Install it for better retrieval:\n' +
    '    npm install @huggingface/transformers\n'
  );
  const fallback = new SimpleEmbedder();
  return {
    embedder: fallback,
    info: {
      kind: 'simple',
      dimensions: fallback.dimensions,
      isFallback: true,
      fallbackReason: '@huggingface/transformers not installed',
    },
  };
}

/**
 * Determine if an error is recoverable (network, model-not-found, etc.)
 * vs a code-level bug that should not be silently swallowed.
 */
export function isRecoverableError(err: unknown): boolean {
  if (!(err instanceof Error)) return true; // unknown errors → fallback

  const message = err.message ?? '';

  // Network / download failures
  if (message.includes('fetch') || message.includes('network') ||
      message.includes('ENOTFOUND') || message.includes('ECONNREFUSED') ||
      message.includes('timeout') || message.includes('Failed to fetch')) {
    return true;
  }

  // Model not found or invalid
  if (message.includes('not found') || message.includes('404') ||
      message.includes('model') || message.includes('shape') ||
      message.includes('dimension') || message.includes('size')) {
    return true;
  }

  // WASM / native binding issues
  if (message.includes('wasm') || message.includes('native') ||
      message.includes('binding')) {
    return true;
  }

  // SyntaxError, TypeError, ReferenceError are code bugs — don't swallow
  if (err instanceof SyntaxError || err instanceof TypeError ||
      err instanceof ReferenceError || err instanceof RangeError) {
    return false;
  }

  // Default: recoverable (most runtime errors in model loading are transient)
  return true;
}
