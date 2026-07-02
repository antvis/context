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
      const doc = await loader.load(path.join(FIXTURES_DIR, 'getting-started.md'));

      expect(doc.id).toContain('getting-started.md');
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
      const doc = await loader.load(path.join(FIXTURES_DIR, 'api.json'));

      expect(doc.id).toContain('api.json');
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
      const doc = await loader.load(path.join(FIXTURES_DIR, 'notes.txt'));

      expect(doc.id).toContain('notes.txt');
      expect(doc.content).toContain('notes');
    });

    it('should handle .txt extension', () => {
      const loader = new TextLoader();
      expect(loader.canHandle('file.txt')).toBe(true);
      expect(loader.canHandle('file.md')).toBe(false);
    });
  });
});