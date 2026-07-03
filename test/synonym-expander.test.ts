import { describe, it, expect } from 'vitest';
import { SynonymExpander, NoopExpander } from '../src/query-expander';

describe('SynonymExpander', () => {
  describe('with user-provided synonyms', () => {
    const expander = new SynonymExpander({
      '折线图': ['line chart', '折线'],
      'tooltip': ['提示框', '提示', 'hover'],
      'animation': ['动效', 'animate', 'transition'],
      'config': ['配置', 'configuration', '设置'],
    });

    it('should expand CN chart type to EN equivalent', () => {
      const result = expander.expand('折线图');
      expect(result).toContain('line chart');
    });

    it('should expand EN term to CN equivalent', () => {
      const result = expander.expand('tooltip');
      expect(result).toContain('提示框');
    });

    it('should not duplicate terms already in query', () => {
      const result = expander.expand('tooltip 提示框');
      const promptCount = result.split('提示框').length - 1;
      expect(promptCount).toBe(1);
    });

    it('should expand multiple terms in one query', () => {
      const result = expander.expand('tooltip config');
      expect(result).toContain('提示框');
      expect(result).toContain('配置');
    });

    it('should preserve original query text', () => {
      const result = expander.expand('animation settings');
      expect(result.startsWith('animation settings')).toBe(true);
    });

    it('should return original query when no synonyms match', () => {
      const result = expander.expand('random unrelated terms');
      expect(result).toBe('random unrelated terms');
    });

    it('should handle empty query', () => {
      const result = expander.expand('');
      expect(result).toBe('');
    });
  });

  describe('with no synonyms (empty map)', () => {
    const expanderEmpty = new SynonymExpander({});
    const expanderDefault = new SynonymExpander();

    it('should return original query unchanged with empty map', () => {
      const result = expanderEmpty.expand('tooltip configuration');
      expect(result).toBe('tooltip configuration');
    });

    it('should return original query unchanged with no arguments', () => {
      const result = expanderDefault.expand('tooltip configuration');
      expect(result).toBe('tooltip configuration');
    });

    it('should handle empty query', () => {
      const result = expanderDefault.expand('');
      expect(result).toBe('');
    });
  });
});

describe('NoopExpander', () => {
  const expander = new NoopExpander();

  it('should return query unchanged', () => {
    const result = expander.expand('tooltip configuration');
    expect(result).toBe('tooltip configuration');
  });

  it('should handle empty query', () => {
    const result = expander.expand('');
    expect(result).toBe('');
  });
});
