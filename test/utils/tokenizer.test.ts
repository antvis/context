import { describe, it, expect } from 'vitest';
import { isCJK, detectLanguage, tokenizerForLanguage, detectTokenizer } from '../../src/utils/tokenizer';

describe('tokenizer', () => {
  describe('isCJK', () => {
    it('should detect Chinese characters', () => {
      expect(isCJK('中')).toBe(true);
      expect(isCJK('国')).toBe(true);
    });

    it('should detect Japanese hiragana/katakana', () => {
      expect(isCJK('あ')).toBe(true);
      expect(isCJK('ア')).toBe(true);
    });

    it('should detect Korean hangul', () => {
      expect(isCJK('한')).toBe(true);
      expect(isCJK('글')).toBe(true);
    });

    it('should return false for Latin characters', () => {
      expect(isCJK('a')).toBe(false);
      expect(isCJK('A')).toBe(false);
    });
  });

  describe('detectLanguage', () => {
    it('should detect Chinese-dominant text', () => {
      expect(detectLanguage('你好世界')).toBe('cjk');
    });

    it('should detect Latin-dominant text', () => {
      expect(detectLanguage('hello world')).toBe('latin');
      expect(detectLanguage('The quick brown fox')).toBe('latin');
    });

    it('should detect mixed CJK/Latin as mixed', () => {
      expect(detectLanguage('Hello 世界')).toBe('mixed');
      expect(detectLanguage('测试 test')).toBe('mixed');
    });

    it('should return latin for empty string', () => {
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
    it('should return tokenizer based on detected language', () => {
      expect(detectTokenizer('hello')).toBe('standard');
      expect(detectTokenizer('你好')).toBe('jieba');
      expect(detectTokenizer('Hello 世界')).toBe('jieba');
    });
  });
});