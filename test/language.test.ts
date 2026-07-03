import { describe, it, expect } from 'vitest';
import { isCJK, detectLanguage, tokenizerForLanguage, detectTokenizer } from '../src/embedder/language';

describe('isCJK', () => {
  it('should detect Chinese characters', () => {
    expect(isCJK('中')).toBe(true);
    expect(isCJK('图')).toBe(true);
  });

  it('should detect Hiragana', () => {
    expect(isCJK('あ')).toBe(true);
  });

  it('should detect Katakana', () => {
    expect(isCJK('ア')).toBe(true);
  });

  it('should detect Hangul', () => {
    expect(isCJK('한')).toBe(true);
  });

  it('should not detect ASCII letters', () => {
    expect(isCJK('a')).toBe(false);
    expect(isCJK('Z')).toBe(false);
  });

  it('should not detect digits', () => {
    expect(isCJK('0')).toBe(false);
  });

  it('should not detect punctuation', () => {
    expect(isCJK('.')).toBe(false);
    expect(isCJK('!')).toBe(false);
  });
});

describe('detectLanguage', () => {
  it('should detect CJK-dominant text', () => {
    expect(detectLanguage('折线图配置方法详解')).toBe('cjk');
  });

  it('should detect Latin text', () => {
    expect(detectLanguage('hello world configuration')).toBe('latin');
  });

  it('should detect mixed text with >15% CJK', () => {
    expect(detectLanguage('Line Chart 折线图')).toBe('mixed');
  });

  it('should classify low CJK ratio as latin', () => {
    // Only 1 CJK char out of ~20 chars — < 15% threshold
    expect(detectLanguage('this is a long English sentence with one 字')).toBe('latin');
  });

  it('should return latin for empty text', () => {
    expect(detectLanguage('')).toBe('latin');
  });
});

describe('tokenizerForLanguage', () => {
  it('should return jieba for cjk', () => {
    expect(tokenizerForLanguage('cjk')).toBe('jieba');
  });

  it('should return jieba for mixed', () => {
    expect(tokenizerForLanguage('mixed')).toBe('jieba');
  });

  it('should return standard for latin', () => {
    expect(tokenizerForLanguage('latin')).toBe('standard');
  });
});

describe('detectTokenizer', () => {
  it('should auto-detect jieba for Chinese text', () => {
    expect(detectTokenizer('折线图')).toBe('jieba');
  });

  it('should auto-detect standard for English text', () => {
    expect(detectTokenizer('hello world')).toBe('standard');
  });

  it('should auto-detect jieba for mixed text', () => {
    expect(detectTokenizer('chart 折线图')).toBe('jieba');
  });
});
