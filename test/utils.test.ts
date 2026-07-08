import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../src/utils/common';
import { computeContentHash } from '../src/utils/hash';
import { pathToId } from '../src/utils/doc';
import { containsCJK } from '../src/utils/str';
import { loadSampleText } from '../src/utils/sample';

describe('safeJsonParse', () => {
  it('should parse valid JSON string', () => {
    const result = safeJsonParse('{"name":"test","value":1}');
    expect(result).toEqual({ name: 'test', value: 1 });
  });

  it('should parse valid JSON array', () => {
    const result = safeJsonParse('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('should parse valid JSON string value', () => {
    const result = safeJsonParse('"hello"');
    expect(result).toBe('hello');
  });

  it('should parse valid JSON number', () => {
    const result = safeJsonParse('42');
    expect(result).toBe(42);
  });

  it('should parse valid JSON null', () => {
    const result = safeJsonParse('null');
    expect(result).toBe(null);
  });

  it('should parse valid JSON boolean', () => {
    expect(safeJsonParse('true')).toBe(true);
    expect(safeJsonParse('false')).toBe(false);
  });

  it('should return undefined for invalid JSON', () => {
    expect(safeJsonParse('{invalid}')).toBeUndefined();
  });

  it('should return undefined for truncated JSON', () => {
    expect(safeJsonParse('{"key": "val')).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(safeJsonParse('')).toBeUndefined();
  });

  it('should return undefined for undefined input', () => {
    expect(safeJsonParse(undefined)).toBeUndefined();
  });

  it('should return undefined for whitespace-only string', () => {
    expect(safeJsonParse('   ')).toBeUndefined();
  });
});

describe('computeContentHash', () => {
  it('should produce a 16-char hex string', () => {
    const hash = computeContentHash('hello world');
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should be deterministic for same content', () => {
    const hash1 = computeContentHash('same content');
    const hash2 = computeContentHash('same content');
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different content', () => {
    const hash1 = computeContentHash('content A');
    const hash2 = computeContentHash('content B');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty string', () => {
    const hash = computeContentHash('');
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should handle long content', () => {
    const longContent = 'x'.repeat(10000);
    const hash = computeContentHash(longContent);
    expect(hash).toHaveLength(16);
  });

  it('should produce different hash for whitespace difference', () => {
    const hash1 = computeContentHash('hello');
    const hash2 = computeContentHash('hello ');
    expect(hash1).not.toBe(hash2);
  });
});

describe('pathToId', () => {
  it('should produce id with hash prefix and filename suffix', () => {
    const id = pathToId('docs/getting-started.md');
    expect(id).toMatch(/^[0-9a-f]{16}__getting_started$/);
  });

  it('should be deterministic for same path', () => {
    const id1 = pathToId('docs/guide.md');
    const id2 = pathToId('docs/guide.md');
    expect(id1).toBe(id2);
  });

  it('should produce different ids for different paths', () => {
    const id1 = pathToId('docs/guide.md');
    const id2 = pathToId('docs/api.md');
    expect(id1).not.toBe(id2);
  });

  it('should replace special characters in filename with underscore', () => {
    const id = pathToId('docs/my-chart-guide.md');
    expect(id).toMatch(/__my_chart_guide$/);
  });

  it('should truncate long filename suffix to 20 chars', () => {
    const longName = 'a-very-long-document-name-that-should-be-truncated.md';
    const id = pathToId(`docs/${longName}`);
    const suffix = id.split('__')[1];
    expect(suffix.length).toBeLessThanOrEqual(20);
  });

  it('should strip file extension from suffix', () => {
    const id = pathToId('docs/readme.md');
    expect(id).not.toContain('.md');
  });

  it('should handle nested paths', () => {
    const id = pathToId('src/docs/guides/intro.md');
    expect(id).toMatch(/^[0-9a-f]{16}__intro$/);
  });

  it('should normalize backslashes to forward slashes', () => {
    const id = pathToId('docs\\guide.md');
    // Should produce same result as forward slash version
    expect(id).toMatch(/^[0-9a-f]{16}__/);
  });

  it('should handle filename with multiple extensions', () => {
    const id = pathToId('data/config.json.bak');
    // Should strip the last extension
    expect(id).toMatch(/__config_json$/);
  });
});

describe('containsCJK', () => {
  it('should detect Chinese characters in string', () => {
    expect(containsCJK('折线图')).toBe(true);
  });

  it('should detect Chinese mixed with English', () => {
    expect(containsCJK('line chart 折线图')).toBe(true);
  });

  it('should return false for pure English', () => {
    expect(containsCJK('hello world')).toBe(false);
  });

  it('should return false for numbers and punctuation', () => {
    expect(containsCJK('123.45!')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(containsCJK('')).toBe(false);
  });

  it('should detect single CJK character', () => {
    expect(containsCJK('图')).toBe(true);
  });
});

describe('loadSampleText', () => {
  it('should return undefined for empty file list', async () => {
    const result = await loadSampleText([]);
    expect(result).toBeUndefined();
  });

  it('should load content from existing files', async () => {
    const files = [
      require('path').join(__dirname, 'fixtures/docs/getting-started.md'),
    ];
    const result = await loadSampleText(files);
    expect(result).toContain('Getting Started');
  });

  it('should join content from multiple sample files', async () => {
    const files = [
      require('path').join(__dirname, 'fixtures/docs/getting-started.md'),
      require('path').join(__dirname, 'fixtures/docs/api.json'),
    ];
    const result = await loadSampleText(files, 2);
    expect(result).toContain('Getting Started');
    expect(result).toContain('API Reference');
  });

  it('should return undefined when all files fail to load', async () => {
    const files = ['/nonexistent/path/file1.txt', '/nonexistent/path/file2.txt'];
    const result = await loadSampleText(files);
    expect(result).toBeUndefined();
  });

  it('should return partial content when some files fail', async () => {
    const files = [
      require('path').join(__dirname, 'fixtures/docs/getting-started.md'),
      '/nonexistent/path/missing.txt',
    ];
    const result = await loadSampleText(files, 2);
    expect(result).toContain('Getting Started');
  });
});
