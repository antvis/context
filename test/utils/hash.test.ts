import { describe, it, expect } from 'vitest';
import { computeContentHash } from '../../src/utils/hash';

describe('computeContentHash', () => {
  it('should return a 16-character hex string', () => {
    const hash = computeContentHash('test content');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should produce consistent results', () => {
    const hash1 = computeContentHash('test content');
    const hash2 = computeContentHash('test content');
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different content', () => {
    const hash1 = computeContentHash('content a');
    const hash2 = computeContentHash('content b');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty string', () => {
    const hash = computeContentHash('');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});