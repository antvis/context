import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../src/storage/utils';

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const vec = [1, 0, 0];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('should return -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('should return 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('should handle high-dimensional vectors', () => {
    const a = Array.from({ length: 512 }, (_, i) => i % 2 === 0 ? 0.1 : 0.2);
    const b = Array.from({ length: 512 }, (_, i) => i % 2 === 0 ? 0.2 : 0.1);
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});