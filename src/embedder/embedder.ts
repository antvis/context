/**
 * Embedder — local sentence-transformers model via @huggingface/transformers.
 */

const DEFAULT_MODEL_ID = 'onnx-community/bge-small-zh-v1.5-ONNX';
const DEFAULT_DIMENSIONS = 512;

type TransformersPipeline = (texts: string[], options: Record<string, unknown>) => Promise<{ tolist(): number[][] }>;

export class Embedder {
  private static pipeline: TransformersPipeline | null = null;

  readonly dimensions = DEFAULT_DIMENSIONS;

  private static async getPipeline(): Promise<TransformersPipeline> {
    if (Embedder.pipeline) return Embedder.pipeline;

    const mod = await import('@huggingface/transformers');
    const hfEndpoint = process.env.HF_ENDPOINT;
    if (hfEndpoint && (mod as any).env) {
      (mod as any).env.remoteHost = hfEndpoint;
    }

    const pipe = await mod.pipeline('feature-extraction', DEFAULT_MODEL_ID) as TransformersPipeline;
    Embedder.pipeline = pipe;
    return Embedder.pipeline;
  }

  async embed(text: string): Promise<number[]> {
    return (await this.embedBatch([text]))[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const pipe = await Embedder.getPipeline();
    const outputs = await pipe(texts, { pooling: 'mean', normalize: true });
    return outputs.tolist();
  }
}
