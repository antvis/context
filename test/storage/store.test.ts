import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Store } from '../../src/storage/store';
import { Embedder } from '../../src/embedder/embedder';

describe('Store', () => {
  const testDir = path.join(__dirname, '.test-vectors-temp');
  let store: Store;
  let embedder: Embedder;

  beforeEach(() => {
    embedder = new Embedder();
    // Clean up any existing test files first
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    store = new Store(testDir, embedder);
  });

  afterEach(() => {
    store.close();
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should be instantiable', () => {
    expect(store).toBeInstanceOf(Store);
  });

  describe('acquireZvec', () => {
    it('should acquire zvec for a library', () => {
      const zvec = store.acquireZvec('test-lib', 'jieba');
      expect(zvec).toBeDefined();
    });

    it('should return same zvec for same library', () => {
      const zvec1 = store.acquireZvec('test-lib', 'jieba');
      const zvec2 = store.acquireZvec('test-lib', 'jieba');
      expect(zvec1).toBe(zvec2);
    });

    it('should not create missing zvec in read-only mode', () => {
      const readOnlyStore = new Store(testDir, embedder, { readOnly: true });
      try {
        expect(() => readOnlyStore.acquireZvec('missing-lib', 'jieba')).toThrow(/read-only mode/);
        expect(fs.existsSync(path.join(testDir, 'missing-lib.zvec'))).toBe(false);
      } finally {
        readOnlyStore.close();
      }
    });
  });

  describe('addDoc', () => {
    it('should add documents with required fields', () => {
      const docs = [
        {
          id: 'doc1',
          vector: new Array(embedder.dimensions).fill(0.1),
          fields: { content: 'test content', meta: '{}', path: '/test/doc1', contentHash: 'abc123' },
        },
      ];
      expect(() => store.addDoc('test-lib', docs)).not.toThrow();
    });

    it('should not throw for empty docs array', () => {
      expect(() => store.addDoc('test-lib', [])).not.toThrow();
    });

    it('should reject writes in read-only mode', () => {
      const readOnlyStore = new Store(testDir, embedder, { readOnly: true });
      expect(() => readOnlyStore.addDoc('test-lib', [])).toThrow(/read-only mode/);
      readOnlyStore.close();
    });
  });

  describe('fetchDocs', () => {
    it('should return empty object for empty ids', () => {
      const result = store.fetchDocs('test-lib', []);
      expect(result).toEqual({});
    });

    it('should fetch documents by ids', () => {
      const docId = 'doc1';
      const docs = [
        {
          id: docId,
          vector: new Array(embedder.dimensions).fill(0.1),
          fields: { content: 'test content', meta: '{}', path: '/test/doc1', contentHash: 'abc123' },
        },
      ];
      store.addDoc('test-lib', docs);

      const result = store.fetchDocs('test-lib', [docId], ['content']);
      expect(result).toHaveProperty(docId);
    });
  });

  describe('queryDoc', () => {
    it('should return empty array for vector mode with no data', () => {
      const result = store.queryDoc('test-lib', {
        mode: 'vector',
        queryVector: new Array(embedder.dimensions).fill(0.1),
        topK: 10,
      });
      expect(result).toEqual([]);
    });

    it('should return empty array for hybrid mode with no data', () => {
      const result = store.queryDoc('test-lib', {
        mode: 'hybrid',
        queryText: 'test',
        queryVector: new Array(embedder.dimensions).fill(0.1),
        topK: 10,
      });
      expect(result).toEqual([]);
    });
  });

  describe('close', () => {
    it('should close without error', () => {
      expect(() => store.close()).not.toThrow();
    });
  });
});
