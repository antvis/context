import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { MarkdownLoader } from '../src/loaders/markdown';
import { JsonLoader } from '../src/loaders/json';
import { TextLoader } from '../src/loaders/text';

const FIXTURES_DIR = path.join(__dirname, 'fixtures/docs');

describe('Loaders', () => {
  describe('MarkdownLoader', () => {
    it('should load markdown file with front-matter', async () => {
      const loader = new MarkdownLoader();
      const filePath = path.join(FIXTURES_DIR, 'getting-started.md');
      const doc = await loader.load(filePath);

      // Loader returns the file path as a temporary ID — the canonical
      // hash-based ID is assigned by Context.load() for cross-machine consistency.
      expect(doc.id).toBe(filePath);
      expect(doc.content).toContain('Getting Started');
      expect(doc.content).toContain('npm install');
      expect(doc.meta).toEqual({
        title: 'Getting Started',
        category: 'guide',
      });
    });

    it('should handle .markdown extension', () => {
      const loader = new MarkdownLoader();
      expect(loader.canHandle('file.md')).toBe(true);
      expect(loader.canHandle('file.markdown')).toBe(true);
      expect(loader.canHandle('file.txt')).toBe(false);
    });
  });

  describe('JsonLoader', () => {
    it('should load json file', async () => {
      const loader = new JsonLoader();
      const filePath = path.join(FIXTURES_DIR, 'api.json');
      const doc = await loader.load(filePath);

      expect(doc.id).toBe(filePath);
      expect(doc.content).toContain('API Reference');
      expect(doc.content).toContain('/users');
    });

    it('should handle .json extension', () => {
      const loader = new JsonLoader();
      expect(loader.canHandle('file.json')).toBe(true);
      expect(loader.canHandle('file.txt')).toBe(false);
    });
  });

  describe('TextLoader', () => {
    it('should load text file', async () => {
      const loader = new TextLoader();
      const filePath = path.join(FIXTURES_DIR, 'notes.txt');
      const doc = await loader.load(filePath);

      expect(doc.id).toBe(filePath);
      expect(doc.content).toContain('notes');
    });

    it('should handle .txt extension', () => {
      const loader = new TextLoader();
      expect(loader.canHandle('file.txt')).toBe(true);
      expect(loader.canHandle('file.md')).toBe(false);
    });
  });
});