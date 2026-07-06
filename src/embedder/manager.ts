/**
 * EmbedderManager — encapsulates embedder resolution and lifecycle.
 *
 * Each instance maintains its own embedder cache and (optionally) its own
 * transformers module loader, enabling true instance-level isolation for
 * multi-tenant servers and test environments.
 */

import { Embedder } from './types';
import {
  TransformersEmbedder,
  loadTransformersModule,
  resetTransformersModule,
  createTransformersLoader,
} from './transformers';
import type { TransformersLoader } from './transformers';

// ---------------------------------------------------------------------------
// EmbedderManager
// ---------------------------------------------------------------------------

export interface EmbedderManagerOptions {
  /**
   * Custom transformers module loader for instance-level isolation.
   * When omitted, uses the shared global loader (backward-compatible).
   */
  transformersLoader?: TransformersLoader;
}

export class EmbedderManager {
  private _defaultEmbedder: Embedder | null = null;
  private readonly _loader: TransformersLoader;
  private readonly _ownsLoader: boolean;

  constructor(options?: EmbedderManagerOptions) {
    if (options?.transformersLoader) {
      this._loader = options.transformersLoader;
      this._ownsLoader = false;
    } else {
      // Default: use global shared loader (backward-compatible)
      this._loader = {
        load: loadTransformersModule,
        reset: resetTransformersModule,
      };
      this._ownsLoader = false;
    }
  }

  /**
   * Create an EmbedderManager with a fully isolated transformers loader.
   *
   * The returned manager has its own module cache and failure state,
   * completely independent of other managers and the global state.
   */
  static createIsolated(): EmbedderManager {
    const loader = createTransformersLoader();
    return new EmbedderManager({ transformersLoader: loader });
  }

  /**
   * Return a shared Embedder instance (async).
   *
   * Requires @huggingface/transformers to be installed and the model to be
   * loadable. Throws an error when either condition is not met.
   */
  async getEmbedder(): Promise<Embedder> {
    if (this._defaultEmbedder) return this._defaultEmbedder;

    const t = await this._loader.load();
    if (!t) {
      throw new Error(
        '@huggingface/transformers is not installed. Semantic search requires a model-based embedder.\n' +
        '  Install it with:\n' +
        '    npm install @huggingface/transformers\n' +
        '  Then download the model:\n' +
        '    node scripts/download-model.mjs\n' +
        '  Or set mirror for China:\n' +
        '    export HF_ENDPOINT=https://hf-mirror.com'
      );
    }

    try {
      const probe = new TransformersEmbedder(() => this._loader.load());
      await probe.embed('probe');
      this._defaultEmbedder = probe;
    } catch (err) {
      throw new Error(
        `Failed to load embedding model (bge-small-zh-v1.5): ${(err as Error).message?.split('\n')[0] ?? 'unknown'}\n` +
        '  To fix model download:\n' +
        '    1. Set mirror: export HF_ENDPOINT=https://hf-mirror.com\n' +
        '    2. Manual download: node scripts/download-model.mjs'
      );
    }
    return this._defaultEmbedder;
  }

  /**
   * Force-reset all cached state (useful for tests).
   *
   * Only resets the owned loader if this manager was created via
   * `createIsolated()`. Global-loader managers delegate to the shared reset.
   */
  reset(): void {
    this._defaultEmbedder = null;
    this._loader.reset();
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
 */
export async function getEmbedder(): Promise<Embedder> {
  return _globalManager.getEmbedder();
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
