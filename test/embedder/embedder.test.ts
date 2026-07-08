import { describe, it, expect } from 'vitest';
import { Embedder } from '../../src/embedder/embedder';

describe('Embedder', () => {
  it('should have default dimensions of 512', () => {
    const embedder = new Embedder();
    expect(embedder.dimensions).toBe(512);
  });

  it('should have static pipeline property', () => {
    expect(Embedder.pipeline).toBeNull();
  });

  it('should be instantiable', () => {
    const embedder = new Embedder();
    expect(embedder).toBeInstanceOf(Embedder);
  });
});