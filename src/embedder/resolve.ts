/**
 * Embedder resolution — resolves the TransformersEmbedder from the
 * configured model. Throws an error when the model cannot be loaded
 * or @huggingface/transformers is not installed.
 */

import { Embedder } from './types';
import { TransformersEmbedder, loadTransformersModule } from './transformers';

// ---------------------------------------------------------------------------
// Embedder type info
// ---------------------------------------------------------------------------

/** Describes the kind of embedder being used. */
export type EmbedderKind = 'transformers';

/** Diagnostic information about the resolved embedder. */
export interface EmbedderInfo {
  /** Which embedder implementation is active. */
  kind: EmbedderKind;
  /** Vector dimensions of the active embedder. */
  dimensions: number;
  /** Model ID (only set for TransformersEmbedder). */
  modelId?: string;
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
 * Requires @huggingface/transformers to be installed and the model to be
 * loadable. Throws a descriptive error when either condition is not met.
 */
export async function resolveEmbedder(model?: string): Promise<ResolveResult> {
  const t = await loadTransformersModule();

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
    const embedder = new TransformersEmbedder(undefined, { modelId: model });
    await embedder.embed('probe');
    return {
      embedder,
      info: {
        kind: 'transformers',
        dimensions: embedder.dimensions,
        modelId: model ?? 'onnx-community/bge-small-zh-v1.5-ONNX',
      },
    };
  } catch (err) {
    throw new Error(
      `Failed to load embedding model (${model ?? 'bge-small-zh-v1.5'}): ${(err as Error).message?.split('\n')[0] ?? 'unknown'}\n` +
      '  To fix model download:\n' +
      '    1. Set mirror: export HF_ENDPOINT=https://hf-mirror.com\n' +
      '    2. Manual download: node scripts/download-model.mjs'
    );
  }
}
