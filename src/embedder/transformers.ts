/**
 * TransformersEmbedder — local sentence-transformers model via @huggingface/transformers.
 *
 * Constructor is cheap – the model is loaded lazily on the first embed() call.
 * Uses the provided EmbedderManager for module loading (or the global one).
 */

import { Embedder } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL_ID = 'onnx-community/bge-small-zh-v1.5-ONNX';
const DEFAULT_TRANSFORMERS_DIMS = 512;

/** Cooldown period (ms) before retrying Transformers module load after failure. */
const TRANSFORMERS_RETRY_COOLDOWN_MS = 60_000; // 1 minute

// ---------------------------------------------------------------------------
// Minimal type interfaces for @huggingface/transformers
// ---------------------------------------------------------------------------

/** Transformers module type — minimal interface we rely on. */
interface TransformersModule {
  pipeline(task: string, modelId: string): Promise<TransformersPipeline>;
  env?: { remoteHost?: string };
}

/** Transformers pipeline type — minimal interface we rely on. */
interface TransformersPipeline {
  (texts: string[], options: Record<string, unknown>): Promise<TransformersOutput>;
}

/** Transformers output type — minimal interface we rely on. */
interface TransformersOutput {
  tolist(): number[][];
}

// ---------------------------------------------------------------------------
// Module loading
// ---------------------------------------------------------------------------

let _transformersModule: TransformersModule | undefined;
let _transformersLoadFailed = false;
let _transformersLoadFailedAt = 0;

/**
 * Load the @huggingface/transformers module with TTL-based retry.
 *
 * This function is used by EmbedderManager but also available standalone
 * for direct TransformersEmbedder construction.
 */
export async function loadTransformersModule(): Promise<TransformersModule | undefined> {
  if (_transformersModule) return _transformersModule;

  // TTL-based retry: allow re-attempting after cooldown period
  if (_transformersLoadFailed) {
    const elapsed = Date.now() - _transformersLoadFailedAt;
    if (elapsed < TRANSFORMERS_RETRY_COOLDOWN_MS) {
      return undefined;
    }
    // Cooldown expired — reset failure flag and try again
    _transformersLoadFailed = false;
  }

  try {
    // @huggingface/transformers v4 is an ESM-first package (type: "module").
    // Dynamic import() loads the proper ESM bundle where `pipeline` is a
    // real async function.
    const mod = await import('@huggingface/transformers');
    _transformersModule = mod as TransformersModule;
  } catch {
    _transformersLoadFailed = true;
    _transformersLoadFailedAt = Date.now();
    return undefined;
  }

  // Apply HF_ENDPOINT mirror if set (e.g. https://hf-mirror.com for China).
  // @huggingface/transformers v4 does NOT read HF_ENDPOINT automatically;
  // it hardcodes "https://huggingface.co/" as env.remoteHost.
  const hfEndpoint = process.env.HF_ENDPOINT;
  if (hfEndpoint && _transformersModule?.env) {
    _transformersModule.env.remoteHost = hfEndpoint;
  }

  return _transformersModule;
}

/** Reset the transformers module cache (for tests / EmbedderManager.reset). */
export function resetTransformersModule(): void {
  _transformersModule = undefined;
  _transformersLoadFailed = false;
  _transformersLoadFailedAt = 0;
}

// ---------------------------------------------------------------------------
// TransformersEmbedder
// ---------------------------------------------------------------------------

export class TransformersEmbedder implements Embedder {
  readonly dimensions: number;
  private _modelId: string;
  private _pipeline: TransformersPipeline | null = null;
  private _loadPromise: Promise<TransformersPipeline> | null = null;
  private _loadTransformers: () => Promise<TransformersModule | undefined>;

  constructor(
    loadTransformers?: () => Promise<TransformersModule | undefined>,
    options?: { modelId?: string; dimensions?: number }
  ) {
    this._loadTransformers = loadTransformers ?? loadTransformersModule;
    this._modelId = options?.modelId ?? DEFAULT_MODEL_ID;
    this.dimensions = options?.dimensions ?? DEFAULT_TRANSFORMERS_DIMS;
  }

  private async _getPipeline(): Promise<TransformersPipeline> {
    if (this._pipeline) {
      return this._pipeline;
    }

    if (!this._loadPromise) {
      this._loadPromise = (async () => {
        const t = await this._loadTransformers();
        if (!t) {
          throw new Error(
            '@huggingface/transformers is not installed. Install it with:\n' +
            '  npm install @huggingface/transformers\n' +
            '  Or set HF_ENDPOINT for mirror download.'
          );
        }
        this._pipeline = await t.pipeline('feature-extraction', this._modelId);
        return this._pipeline;
      })().catch((err) => {
        // Reset so subsequent calls can retry instead of returning a
        // forever-rejected cached promise.
        this._loadPromise = null;
        throw err;
      });
    }

    return this._loadPromise;
  }

  async embed(text: string): Promise<number[]> {
    return (await this.embedBatch([text]))[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const pipe = await this._getPipeline();
    const outputs = await pipe(texts, {
      pooling: 'mean',
      normalize: true
    });
    return outputs.tolist();
  }
}
