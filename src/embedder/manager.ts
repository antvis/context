/**
 * EmbedderManager — encapsulates module-level state for embedder resolution.
 *
 * Previously the transformers module cache, failure tracking, and default
 * embedder singleton were scattered as loose module-level variables.  This
 * class consolidates them into a single object so each Context instance can
 * manage its own lifecycle without hidden global side-effects.
 */

import { Embedder } from './types';
import { SimpleEmbedder } from './simple';
import { TransformersEmbedder, loadTransformersModule, resetTransformersModule } from './transformers';

// ---------------------------------------------------------------------------
// EmbedderManager
// ---------------------------------------------------------------------------

export class EmbedderManager {
  private _defaultEmbedder: Embedder | null = null;

  /**
   * Return a shared Embedder instance (async).
   *
   * Tries TransformersEmbedder first (needs @huggingface/transformers installed
   * AND the model downloadable from HuggingFace Hub). If either fails, falls
   * back to SimpleEmbedder gracefully.
   */
  async getEmbedder(synonymMap?: Map<string, string[]>): Promise<Embedder> {
    if (this._defaultEmbedder) return this._defaultEmbedder;

    const t = await loadTransformersModule();
    if (t) {
      try {
        const probe = new TransformersEmbedder();
        await probe.embed('probe'); // triggers lazy model download
        this._defaultEmbedder = probe;
      } catch (err) {
        console.warn(
          `[embedder] Bilingual model (bge-small-zh-v1.5) load failed, falling back to SimpleEmbedder.\n` +
          `  Error: ${(err as Error).message?.split('\n')[0]}\n` +
          `\n` +
          `  SimpleEmbedder has lower recall quality. To fix model download:\n` +
          `    1. Set mirror: export HF_ENDPOINT=https://hf-mirror.com\n` +
          `    2. Manual download: node scripts/download-model.mjs\n`
        );
        this._defaultEmbedder = new SimpleEmbedder(synonymMap);
      }
    } else {
      console.warn(
        '[embedder] @huggingface/transformers not installed, using SimpleEmbedder.\n' +
        '  Install it to enable bilingual model for better recall:\n' +
        '    npm install @huggingface/transformers\n' +
        '    node scripts/download-model.mjs\n'
      );
      this._defaultEmbedder = new SimpleEmbedder(synonymMap);
    }
    return this._defaultEmbedder;
  }

  /**
   * Force-reset all cached state (useful for tests).
   */
  reset(): void {
    this._defaultEmbedder = null;
    resetTransformersModule();
  }
}

// ---------------------------------------------------------------------------
// Global convenience functions (backward-compatible, prefer EmbedderManager)
// ---------------------------------------------------------------------------

/** Global manager instance for backward-compatible convenience functions. */
const _globalManager = new EmbedderManager();

/**
 * Return a shared Embedder instance (async) via the global manager.
 *
 * @deprecated Prefer `new EmbedderManager().getEmbedder()` or pass an
 *   explicit embedder to `Context.create({ embedder })` to avoid hidden
 *   global state. This function remains for backward compatibility.
 *
 * @param synonymMap Optional synonym map to inject into SimpleEmbedder fallback.
 */
export async function getEmbedder(synonymMap?: Map<string, string[]>): Promise<Embedder> {
  return _globalManager.getEmbedder(synonymMap);
}

/**
 * Force-reset the global cached default embedder (useful for tests).
 *
 * @deprecated Prefer `new EmbedderManager().reset()` on a manager instance
 *   to avoid affecting other Context instances. This function remains for
 *   backward compatibility and test cleanup.
 */
export function resetEmbedder(): void {
  _globalManager.reset();
}
