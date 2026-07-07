import { describe, it, expect } from 'vitest';
import { expand } from '../src/expander';

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
});