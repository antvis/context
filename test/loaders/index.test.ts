import { describe, it, expect } from 'vitest';
import { getLoader } from '../../src/loaders';

describe('getLoader', () => {
  it('should return MarkdownLoader for .md files', () => {
    const loader = getLoader('test.md');
    expect(loader).toBeDefined();
    expect(loader?.canHandle('test.md')).toBe(true);
  });

  it('should return MarkdownLoader for .markdown files', () => {
    const loader = getLoader('test.markdown');
    expect(loader).toBeDefined();
  });

  it('should return JsonLoader for .json files', () => {
    const loader = getLoader('test.json');
    expect(loader).toBeDefined();
    expect(loader?.canHandle('test.json')).toBe(true);
  });

  it('should return TextLoader for .txt files', () => {
    const loader = getLoader('test.txt');
    expect(loader).toBeDefined();
    expect(loader?.canHandle('test.txt')).toBe(true);
  });

  it('should return undefined for unsupported file types', () => {
    expect(getLoader('test.csv')).toBeUndefined();
    expect(getLoader('test.xml')).toBeUndefined();
    expect(getLoader('test.unknown')).toBeUndefined();
  });

  it('should return correct loader for various paths', () => {
    expect(getLoader('/path/to/file.json')).toBeDefined();
    expect(getLoader('/path/to/file.md')).toBeDefined();
    expect(getLoader('./relative/path.txt')).toBeDefined();
  });
});