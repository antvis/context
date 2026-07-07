/**
 * Embedder interface — text-to-vector conversion contract.
 */

export interface Embedder {
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
