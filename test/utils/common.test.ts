import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../../src/utils/common';

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    expect(safeJsonParse('{"a": 1}')).toEqual({ a: 1 });
    expect(safeJsonParse('[1, 2, 3]')).toEqual([1, 2, 3]);
    expect(safeJsonParse('"string"')).toBe('string');
    expect(safeJsonParse('123')).toBe(123);
    expect(safeJsonParse('true')).toBe(true);
  });

  it('should return undefined for invalid JSON', () => {
    expect(safeJsonParse('invalid')).toBeUndefined();
    expect(safeJsonParse('{a: 1}')).toBeUndefined();
    expect(safeJsonParse('')).toBeUndefined();
  });

  it('should return undefined for undefined input', () => {
    expect(safeJsonParse(undefined)).toBeUndefined();
  });
});