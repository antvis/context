import { describe, it, expect } from 'vitest';
import * as utils from '../../src/utils';

describe('utils', () => {
  it('should export safeJsonParse', () => {
    expect(utils.safeJsonParse).toBeDefined();
    expect(typeof utils.safeJsonParse).toBe('function');
  });

  it('should export computeContentHash', () => {
    expect(utils.computeContentHash).toBeDefined();
    expect(typeof utils.computeContentHash).toBe('function');
  });

  it('should export containsCJK', () => {
    expect(utils.containsCJK).toBeDefined();
    expect(typeof utils.containsCJK).toBe('function');
  });

  it('should export pathToId', () => {
    expect(utils.pathToId).toBeDefined();
    expect(typeof utils.pathToId).toBe('function');
  });

  it('should export tokenizer functions', () => {
    expect(utils.isCJK).toBeDefined();
    expect(utils.detectLanguage).toBeDefined();
    expect(utils.tokenizerForLanguage).toBeDefined();
    expect(utils.detectTokenizer).toBeDefined();
  });

  it('should export loadSampleText', () => {
    expect(utils.loadSampleText).toBeDefined();
    expect(typeof utils.loadSampleText).toBe('function');
  });
});