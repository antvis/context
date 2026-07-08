import { describe, it, expect } from 'vitest';
import { expand } from '../../src/expander';

describe('expand', () => {
  const queryExpansion = {
    synonyms: {
      '折线图': ['line chart', '折线'],
      'tooltip': ['提示框', '提示', 'hover'],
      'animation': ['动效', 'animate', 'transition'],
      'config': ['配置', 'configuration', '设置'],
    },
  };

  it('should expand CN chart type to EN equivalent', () => {
    const result = expand('折线图', queryExpansion);
    expect(result).toContain('line chart');
  });

  it('should expand EN term to CN equivalent', () => {
    const result = expand('tooltip', queryExpansion);
    expect(result).toContain('提示框');
  });

  it('should not duplicate terms already in query', () => {
    const result = expand('tooltip 提示框', queryExpansion);
    const promptCount = result.split('提示框').length - 1;
    expect(promptCount).toBe(1);
  });

  it('should expand multiple terms in one query', () => {
    const result = expand('tooltip config', queryExpansion);
    expect(result).toContain('提示框');
    expect(result).toContain('配置');
  });

  it('should preserve original query text', () => {
    const result = expand('animation settings', queryExpansion);
    expect(result.startsWith('animation settings')).toBe(true);
  });

  it('should return original query when no synonyms match', () => {
    const result = expand('random unrelated terms', queryExpansion);
    expect(result).toBe('random unrelated terms');
  });

  it('should handle empty query', () => {
    const result = expand('', queryExpansion);
    expect(result).toBe('');
  });

  it('should return original query with no synonyms', () => {
    const result = expand('tooltip configuration');
    expect(result).toBe('tooltip configuration');
  });

  it('should return original query with empty synonyms', () => {
    const result = expand('tooltip configuration', {});
    expect(result).toBe('tooltip configuration');
  });

  it('should return query unchanged when queryExpansion is false', () => {
    const result = expand('折线图配置', false);
    expect(result).toBe('折线图配置');
  });

  it('should handle CJK terms with substring match', () => {
    // Line 14: containsCJK(term) returns true, so substring match is used
    const result = expand('折线图', queryExpansion);
    expect(result).toContain('折线');
  });

  it('should handle term at start of query', () => {
    // Line 18-28: while loop with word boundary at start
    const result = expand('tooltip chart', queryExpansion);
    expect(result).toContain('提示框');
  });

  it('should handle term at end of query', () => {
    // Test term matching at end of query
    const result = expand('chart tooltip', queryExpansion);
    expect(result).toContain('提示框');
  });

  it('should handle term in middle of query', () => {
    const result = expand('show tooltip here', queryExpansion);
    expect(result).toContain('提示框');
  });

  it('should not add synonym already in query', () => {
    // Line 45: containsTerm check prevents duplication
    const result = expand('tooltip 提示框', queryExpansion);
    const parts = result.split(' ');
    const promptCount = parts.filter(p => p === '提示框').length;
    expect(promptCount).toBe(1);
  });

  it('should handle synonyms with already added terms', () => {
    // Multiple terms matching same synonym
    const result = expand('折线图 折线', queryExpansion);
    expect(result).toContain('line chart');
  });

  it('should handle term at word boundary returning true immediately', () => {
    // This tests the path where containsTerm finds a match and returns true (line 26)
    // Direct term at word boundary
    const result = expand('test tooltip config', queryExpansion);
    expect(result).toContain('提示');
  });

  it('should not match partial Latin substring in word', () => {
    // This tests the path where term is found but not at word boundaries (lines 27-29)
    // Searching for "config" in "configured" - gets past include check but not boundary check
    const testExpansion = {
      synonyms: { 'config': ['setting'] }
    };
    const result = expand('configured', testExpansion);
    // "config" is part of "configured", not a standalone word - should not match
    expect(result).toBe('configured');
  });

  it('should handle term found but never at word boundary', () => {
    // This tests line 29-30: term found but all occurrences fail boundary check
    // Using a term that appears only as part of a longer word
    const testExpansion = {
      synonyms: { 'abc': ['xyz'] }
    };
    // "abc" does NOT appear in this text at all - so line 11 returns false early
    // Need text that contains "abc" but never as a standalone word
    const result = expand('xabcy', testExpansion);
    // "abc" is in "xabcy" but not at word boundary (surrounded by letters)
    // This will go through the loop, never find a boundary match, then return false
    // This triggers lines 29-30
    expect(result).toBe('xabcy');
  });
});