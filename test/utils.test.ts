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
    chunkIndex: 0,
    parentDocId: 'abc__test',
    totalChunks: 5,
    headingPath: 'Line Chart > Tooltip',
  };

  describe('string equality', () => {
    it('should match string field with quoted value', () => {
      expect(evalMemoryFilter("parentDocId = 'abc__test'", fields)).toBe(true);
    });

    it('should reject non-matching string value', () => {
      expect(evalMemoryFilter("parentDocId = 'xyz'", fields)).toBe(false);
    });

    it('should match content field', () => {
      expect(evalMemoryFilter("content = 'hello world'", fields)).toBe(true);
    });
  });

  describe('number equality', () => {
    it('should match numeric field with integer value', () => {
      expect(evalMemoryFilter("chunkIndex = 0", fields)).toBe(true);
    });

    it('should reject non-matching numeric value', () => {
      expect(evalMemoryFilter("chunkIndex = 3", fields)).toBe(false);
    });

    it('should match totalChunks field', () => {
      expect(evalMemoryFilter("totalChunks = 5", fields)).toBe(true);
    });

    it('should handle negative numbers', () => {
      expect(evalMemoryFilter("chunkIndex = -1", { chunkIndex: -1 })).toBe(true);
    });
  });

  describe('AND conjunction', () => {
    it('should match when all clauses are true', () => {
      expect(evalMemoryFilter("chunkIndex = 0 AND parentDocId = 'abc__test'", fields)).toBe(true);
    });

    it('should reject when any clause is false', () => {
      expect(evalMemoryFilter("chunkIndex = 1 AND parentDocId = 'abc__test'", fields)).toBe(false);
    });

    it('should reject when all clauses are false', () => {
      expect(evalMemoryFilter("chunkIndex = 3 AND parentDocId = 'xyz'", fields)).toBe(false);
    });

    it('should support mixed string and number clauses', () => {
      expect(evalMemoryFilter("chunkIndex = 0 AND headingPath = 'Line Chart > Tooltip'", fields)).toBe(true);
    });

    it('should support three clauses with AND', () => {
      expect(evalMemoryFilter("chunkIndex = 0 AND totalChunks = 5 AND parentDocId = 'abc__test'", fields)).toBe(true);
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
      expect(evalMemoryFilter("chunkIndex = 0 and parentDocId = 'abc__test'", fields)).toBe(true);
    });

    it('should handle missing field gracefully (string clause)', () => {
      expect(evalMemoryFilter("unknownField = 'value'", fields)).toBe(false);
    });

    it('should handle missing field gracefully (number clause)', () => {
      expect(evalMemoryFilter("unknownField = 42", fields)).toBe(false);
    });
  });
});
