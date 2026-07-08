import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { MarkdownLoader } from '../src/loaders/markdown';
import { JsonLoader } from '../src/loaders/json';
import { TextLoader } from '../src/loaders/text';
import { getLoader } from '../src/loaders';

const FIXTURES_DIR = path.join(__dirname, 'fixtures/docs');

describe('Loaders', () => {
  describe('MarkdownLoader', () => {
    const loader = new MarkdownLoader();

    it('should load markdown file with front-matter', async () => {
      const filePath = path.join(FIXTURES_DIR, 'getting-started.md');
      const doc = await loader.load(filePath);

      expect(doc.content).toContain('Getting Started');
      expect(doc.content).toContain('npm install');
      expect(doc.meta).toEqual({
        title: 'Getting Started',
        category: 'guide',
      });
    });

    it('should load markdown file without front-matter', async () => {
      const filePath = path.join(FIXTURES_DIR, 'plain.md');
      const doc = await loader.load(filePath);

      expect(doc.content).toContain('Plain Markdown');
      expect(doc.content).toContain('without any front-matter');
      // gray-matter returns {} for files without front-matter
      expect(doc.meta).toEqual({});
    });

    it('should trim content whitespace', async () => {
      const filePath = path.join(FIXTURES_DIR, 'plain.md');
      const doc = await loader.load(filePath);

      expect(doc.content).not.toMatch(/^\s/);
      expect(doc.content).not.toMatch(/\s$/);
    });

    it('should handle .md and .markdown extensions', () => {
      expect(loader.canHandle('file.md')).toBe(true);
      expect(loader.canHandle('file.markdown')).toBe(true);
    });

    it('should reject non-markdown extensions', () => {
      expect(loader.canHandle('file.json')).toBe(false);
      expect(loader.canHandle('file.txt')).toBe(false);
      expect(loader.canHandle('file.css')).toBe(false);
    });
  });

  describe('JsonLoader', () => {
    const loader = new JsonLoader();

    it('should load json file', async () => {
      const filePath = path.join(FIXTURES_DIR, 'api.json');
      const doc = await loader.load(filePath);

      expect(doc.content).toContain('API Reference');
      expect(doc.content).toContain('/users');
    });

    it('should load pure string JSON', async () => {
      const filePath = path.join(FIXTURES_DIR, 'string.json');
      const doc = await loader.load(filePath);

      expect(doc.content).toBe('hello');
    });

    it('should load empty object JSON', async () => {
      const filePath = path.join(FIXTURES_DIR, 'empty-object.json');
      const doc = await loader.load(filePath);

      expect(doc.content).toContain('{}');
    });

    it('should load nested JSON with pretty formatting', async () => {
      const filePath = path.join(FIXTURES_DIR, 'nested.json');
      const doc = await loader.load(filePath);

      expect(doc.content).toContain('Nested');
      expect(doc.content).toContain('items');
    });

    it('should handle .json extension', () => {
      expect(loader.canHandle('file.json')).toBe(true);
    });

    it('should reject non-JSON extensions', () => {
      expect(loader.canHandle('file.md')).toBe(false);
      expect(loader.canHandle('file.txt')).toBe(false);
    });
  });

  describe('TextLoader', () => {
    const loader = new TextLoader();

    it('should load text file', async () => {
      const filePath = path.join(FIXTURES_DIR, 'notes.txt');
      const doc = await loader.load(filePath);

      expect(doc.content).toContain('notes');
    });

    it('should trim content from text file', async () => {
      const filePath = path.join(FIXTURES_DIR, 'notes.txt');
      const doc = await loader.load(filePath);

      expect(doc.content).not.toMatch(/^\s/);
    });

    it('should handle .txt extension', () => {
      expect(loader.canHandle('file.txt')).toBe(true);
    });

    it('should reject non-text extensions', () => {
      expect(loader.canHandle('file.md')).toBe(false);
      expect(loader.canHandle('file.json')).toBe(false);
      expect(loader.canHandle('file.csv')).toBe(false);
    });
  });

  describe('getLoader', () => {
    it('should return MarkdownLoader for .md files', () => {
      const loader = getLoader('docs/guide.md');
      expect(loader).toBeDefined();
      expect(loader!.canHandle('guide.md')).toBe(true);
    });

    it('should return JsonLoader for .json files', () => {
      const loader = getLoader('data/config.json');
      expect(loader).toBeDefined();
      expect(loader!.canHandle('config.json')).toBe(true);
    });

    it('should return TextLoader for .txt files', () => {
      const loader = getLoader('readme.txt');
      expect(loader).toBeDefined();
      expect(loader!.canHandle('readme.txt')).toBe(true);
    });

    it('should return MarkdownLoader for .markdown extension', () => {
      const loader = getLoader('docs/readme.markdown');
      expect(loader).toBeDefined();
    });

    it('should return undefined for unsupported extensions', () => {
      expect(getLoader('style.css')).toBeUndefined();
      expect(getLoader('script.js')).toBeUndefined();
      expect(getLoader('data.csv')).toBeUndefined();
      expect(getLoader('image.png')).toBeUndefined();
    });

    it('should return undefined for files with no extension', () => {
      expect(getLoader('Makefile')).toBeUndefined();
      expect(getLoader('Dockerfile')).toBeUndefined();
    });
  });
});
