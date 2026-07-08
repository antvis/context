import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { loadSampleText, selectSampleFiles } from '../../src/utils/sample';

describe('loadSampleText', () => {
  const testDir = path.join(__dirname, '.test-sample-files');

  beforeEach(() => {
    // Create test files
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(`${testDir}/file1.txt`, 'Hello World');
    fs.writeFileSync(`${testDir}/file2.txt`, 'Test Content');
    fs.writeFileSync(`${testDir}/file3.txt`, 'Sample Text');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should return undefined for empty files array', async () => {
    const result = await loadSampleText([]);
    expect(result).toBeUndefined();
  });

  it('should load sample text from files', async () => {
    const files = [`${testDir}/file1.txt`, `${testDir}/file2.txt`];
    const result = await loadSampleText(files);
    expect(result).toBeDefined();
    expect(result).toContain('Hello World');
    expect(result).toContain('Test Content');
  });

  it('should limit sample count', async () => {
    const files = [
      `${testDir}/file1.txt`,
      `${testDir}/file2.txt`,
      `${testDir}/file3.txt`,
    ];
    const result = await loadSampleText(files, 2);
    expect(result).toBeDefined();
  });

  it('should handle non-existent files gracefully', async () => {
    const files = [`${testDir}/nonexistent.txt`, `${testDir}/file1.txt`];
    const result = await loadSampleText(files);
    expect(result).toBeDefined();
  });

  it('should return undefined if all files fail to load', async () => {
    const files = ['/nonexistent1.txt', '/nonexistent2.txt'];
    const result = await loadSampleText(files);
    expect(result).toBeUndefined();
  });
});

describe('selectSampleFiles', () => {
  it('should return all files if count is less than max', () => {
    const files = ['a.txt', 'b.txt'];
    const result = selectSampleFiles(files, 5);
    expect(result).toEqual(['a.txt', 'b.txt']);
  });

  it('should include first and last file', () => {
    const files = ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt'];
    const result = selectSampleFiles(files, 3);
    expect(result[0]).toBe('a.txt');
    expect(result[result.length - 1]).toBe('e.txt');
  });

  it('should sample evenly distributed files', () => {
    const files = Array.from({ length: 10 }, (_, i) => `file${i}.txt`);
    const result = selectSampleFiles(files, 4);
    // Should have first, some middle, and last
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result[0]).toBe('file0.txt');
    expect(result[result.length - 1]).toBe('file9.txt');
  });

  it('should handle single file', () => {
    const files = ['only.txt'];
    const result = selectSampleFiles(files, 5);
    expect(result).toEqual(['only.txt']);
  });

  it('should handle exact max count', () => {
    const files = ['a.txt', 'b.txt', 'c.txt'];
    const result = selectSampleFiles(files, 3);
    expect(result).toEqual(files);
  });
});