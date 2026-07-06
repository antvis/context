import { describe, it, expect } from 'vitest';
import { cosineSimilarity, evalMemoryFilter } from '../src/storage/utils';

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

describe('evalMemoryFilter', () => {
  const fields = {
    content: 'hello world',
    sourceFilePath: 'docs/getting-started.md',
  };

  describe('string equality', () => {
    it('should match string field with quoted value', () => {
      expect(evalMemoryFilter("sourceFilePath = 'docs/getting-started.md'", fields)).toBe(true);
    });

    it('should reject non-matching string value', () => {
      expect(evalMemoryFilter("sourceFilePath = 'xyz'", fields)).toBe(false);
    });

    it('should match content field', () => {
      expect(evalMemoryFilter("content = 'hello world'", fields)).toBe(true);
    });
  });

  describe('AND conjunction', () => {
    it('should match when all clauses are true', () => {
      expect(evalMemoryFilter("content = 'hello world' AND sourceFilePath = 'docs/getting-started.md'", fields)).toBe(true);
    });

    it('should reject when any clause is false', () => {
      expect(evalMemoryFilter("content = 'hello' AND sourceFilePath = 'docs/getting-started.md'", fields)).toBe(false);
    });

    it('should reject when all clauses are false', () => {
      expect(evalMemoryFilter("content = 'foo' AND sourceFilePath = 'xyz'", fields)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should pass through unknown clause format', () => {
      // Unknown format → true (let native zvec handle it)
      expect(evalMemoryFilter("field > 10", fields)).toBe(true);
    });

    it('should pass through empty filter', () => {
      expect(evalMemoryFilter('', fields)).toBe(true);
    });

    it('should handle AND with case-insensitive keyword', () => {
      expect(evalMemoryFilter("content = 'hello world' and sourceFilePath = 'docs/getting-started.md'", fields)).toBe(true);
    });

    it('should handle missing field gracefully (string clause)', () => {
      expect(evalMemoryFilter("unknownField = 'value'", fields)).toBe(false);
    });
  });
});
