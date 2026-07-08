import { describe, it, expect } from 'vitest';
import { pathToId } from '../../src/utils/doc';

describe('pathToId', () => {
  it('should generate consistent IDs for same path', () => {
    const id1 = pathToId('/some/path/file.ts');
    const id2 = pathToId('/some/path/file.ts');
    expect(id1).toBe(id2);
  });

  it('should generate different IDs for different files', () => {
    const id1 = pathToId('/path/to/file1.ts');
    const id2 = pathToId('/path/to/file2.ts');
    expect(id1).not.toBe(id2);
  });

  it('should include hash in ID', () => {
    const id = pathToId('/some/path/important.ts');
    expect(id).toMatch(/^[0-9a-f]{16}__/);
  });

  it('should handle Windows-style paths', () => {
    const id = pathToId('C:\\Users\\test\\file.ts');
    expect(id).toBeDefined();
    expect(id).toContain('__');
  });

  it('should normalize paths consistently', () => {
    const id1 = pathToId('/a/b/../c/file.ts');
    const id2 = pathToId('/a/c/file.ts');
    expect(id1).toBe(id2);
  });

  it('should handle paths with special characters in filename', () => {
    const id = pathToId('/path/to/file-name_123.ts');
    expect(id).toBeDefined();
  });

  it('should replace special characters in suffix', () => {
    const id = pathToId('/path/to/file.test.ts');
    // .ts should be removed, special chars replaced with _
    expect(id).toContain('file_test');
  });
});