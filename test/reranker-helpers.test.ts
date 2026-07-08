import { describe, it, expect } from 'vitest';
import {
  tokenizeQuery,
  countOccurrences,
  countTermMatches,
  isWordBoundary,
} from '../src/reranker/helpers';

describe('tokenizeQuery', () => {
  it('should split English query into terms', () => {
    const tokens = tokenizeQuery('tooltip configuration');
    expect(tokens).toContain('tooltip');
    expect(tokens).toContain('configuration');
  });

  it('should split on punctuation', () => {
    const tokens = tokenizeQuery('chart, axis; label');
    expect(tokens).toContain('chart');
    expect(tokens).toContain('axis');
    expect(tokens).toContain('label');
  });

  it('should deduplicate tokens', () => {
    const tokens = tokenizeQuery('chart chart');
    const chartCount = tokens.filter((t) => t === 'chart').length;
    expect(chartCount).toBe(1);
  });

  it('should generate bigrams for CJK terms', () => {
    const tokens = tokenizeQuery('折线图');
    expect(tokens).toContain('折线');
    expect(tokens).toContain('线图');
  });

  it('should generate bigrams for CJK mixed with English', () => {
    const tokens = tokenizeQuery('chart 折线图');
    expect(tokens).toContain('chart');
    expect(tokens).toContain('折线图');
    expect(tokens).toContain('折线');
    expect(tokens).toContain('线图');
  });

  it('should return empty array for empty string', () => {
    const tokens = tokenizeQuery('');
    expect(tokens).toEqual([]);
  });

  it('should handle single character', () => {
    const tokens = tokenizeQuery('a');
    expect(tokens).toEqual(['a']);
  });

  it('should not generate bigrams for short CJK string (length < 2)', () => {
    const tokens = tokenizeQuery('图');
    expect(tokens).toContain('图');
    expect(tokens).not.toContain('线图');
  });

  it('should handle Chinese punctuation as delimiter', () => {
    const tokens = tokenizeQuery('折线图、柱状图');
    expect(tokens).toContain('折线图');
    expect(tokens).toContain('柱状图');
  });
});

describe('countOccurrences', () => {
  it('should count substring occurrences', () => {
    expect(countOccurrences('hello hello hello', 'hello')).toBe(3);
  });

  it('should count single occurrence', () => {
    expect(countOccurrences('hello world', 'hello')).toBe(1);
  });

  it('should return 0 when substring not found', () => {
    expect(countOccurrences('hello world', 'xyz')).toBe(0);
  });

  it('should count overlapping occurrences without double counting', () => {
    // "aaa" contains "aa" at positions 0 and 1, but countOccurrences
    // advances past the match, so it counts 1
    expect(countOccurrences('aaa', 'aa')).toBe(1);
  });

  it('should handle empty text', () => {
    expect(countOccurrences('', 'hello')).toBe(0);
  });

  it('should handle empty substring', () => {
    expect(countOccurrences('hello', '')).toBe(0);
  });
});

describe('isWordBoundary', () => {
  it('should return true for word at start of text', () => {
    expect(isWordBoundary('hello world', 'hello')).toBe(true);
  });

  it('should return true for word at end of text', () => {
    expect(isWordBoundary('hello world', 'world')).toBe(true);
  });

  it('should return true for word surrounded by spaces', () => {
    expect(isWordBoundary('the tooltip provides info', 'tooltip')).toBe(true);
  });

  it('should return false for substring within a word', () => {
    expect(isWordBoundary('configuration', 'config')).toBe(false);
  });

  it('should return true for word surrounded by punctuation', () => {
    expect(isWordBoundary('chart, axis', 'chart')).toBe(true);
  });

  it('should return true for word adjacent to newline', () => {
    expect(isWordBoundary('line1\nline2', 'line1')).toBe(true);
  });

  it('should return false when term not in text', () => {
    expect(isWordBoundary('hello', 'world')).toBe(false);
  });

  it('should handle Chinese punctuation as boundary', () => {
    expect(isWordBoundary('配置，图表', '配置')).toBe(true);
  });

  it('should handle explicit position parameter', () => {
    // "tooltip" appears at position 4 in "the tooltip settings"
    expect(isWordBoundary('the tooltip settings', 'tooltip', 4)).toBe(true);
  });

  it('should return false for substring match inside longer word', () => {
    // "tip" inside "tooltip" — no word boundary before "tip"
    expect(isWordBoundary('the tooltip settings', 'tip')).toBe(false);
  });
});

describe('countTermMatches', () => {
  it('should count word-boundary matches only', () => {
    // "config" inside "configuration" should NOT count
    expect(countTermMatches('configuration settings', 'config')).toBe(0);
  });

  it('should count exact word matches', () => {
    expect(countTermMatches('chart chart chart', 'chart')).toBe(3);
  });

  it('should return 0 when term not found', () => {
    expect(countTermMatches('hello world', 'xyz')).toBe(0);
  });

  it('should return 0 for empty text', () => {
    expect(countTermMatches('', 'chart')).toBe(0);
  });

  it('should distinguish substring from word match', () => {
    // "chart" as a standalone word appears once; inside "chartConfig" it is not a word boundary match
    expect(countTermMatches('chart chartConfig', 'chart')).toBe(1);
  });

  it('should count matches separated by punctuation', () => {
    expect(countTermMatches('chart, axis; chart', 'chart')).toBe(2);
  });
});
