import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Store } from '../src/storage';
import { buildZvecSchema } from '../src/storage/schema';
import type { ZvecDoc, StoreQueryParams } from '../src/storage/types';
import { Embedder } from '../src/embedder';

const TEST_DIR = path.join(__dirname, '.store-test-tmp');

describe('Store', () => {
  let store: Store;
  let embedder: Embedder;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });

    embedder = new Embedder();
    // Warm up the embedder pipeline so dimensions are available
    await embedder.embed('probe');

    store = new Store(TEST_DIR, embedder);
  });

  afterAll(() => {
    if (store) {
      store.close();
    }
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('acquireZvec', () => {
    it('should create a new zvec collection for a new library', () => {
      const collection = store.acquireZvec('new-lib', 'jieba');
      expect(collection).toBeDefined();
    });

    it('should return same collection for repeated acquire on same library', () => {
      const col1 = store.acquireZvec('repeat-lib', 'jieba');
      const col2 = store.acquireZvec('repeat-lib', 'jieba');
      expect(col1).toBe(col2);
    });
  });

  describe('addDoc and fetchDocs', () => {
    it('should insert documents and fetch them by ID', () => {
      const docs: ZvecDoc[] = [
        {
          id: 'doc-1',
          vector: Array(embedder.dimensions).fill(0.01),
          fields: { content: 'hello world', meta: '', path: 'docs/hello.md', contentHash: 'abc123' },
        },
        {
          id: 'doc-2',
          vector: Array(embedder.dimensions).fill(0.02),
          fields: { content: 'goodbye world', meta: '', path: 'docs/goodbye.md', contentHash: 'def456' },
        },
      ];

      store.acquireZvec('fetch-lib', 'jieba');
      store.addDoc('fetch-lib', docs);

      const fetched = store.fetchDocs('fetch-lib', ['doc-1'], ['contentHash']);
      expect(fetched['doc-1']).toBeDefined();
      expect(fetched['doc-1'].fields.contentHash).toBe('abc123');
    });

    it('should return empty result for empty ID list', () => {
      store.acquireZvec('empty-fetch-lib', 'jieba');
      const result = store.fetchDocs('empty-fetch-lib', []);
      expect(result).toEqual({});
    });

    it('should upsert documents (overwrite existing)', () => {
      const originalDoc: ZvecDoc[] = [
        {
          id: 'upsert-doc',
          vector: Array(embedder.dimensions).fill(0.01),
          fields: { content: 'original content', meta: '', path: 'docs/upsert.md', contentHash: 'orig123' },
        },
      ];

      store.acquireZvec('upsert-lib', 'jieba');
      store.addDoc('upsert-lib', originalDoc);

      const updatedDoc: ZvecDoc[] = [
        {
          id: 'upsert-doc',
          vector: Array(embedder.dimensions).fill(0.05),
          fields: { content: 'updated content', meta: '', path: 'docs/upsert.md', contentHash: 'upd456' },
        },
      ];
      store.addDoc('upsert-lib', updatedDoc);

      const fetched = store.fetchDocs('upsert-lib', ['upsert-doc'], ['contentHash', 'content']);
      expect(fetched['upsert-doc'].fields.contentHash).toBe('upd456');
      expect(fetched['upsert-doc'].fields.content).toBe('updated content');
    });

    it('should not throw on empty docs array', () => {
      store.acquireZvec('empty-add-lib', 'jieba');
      store.addDoc('empty-add-lib', []);
      // Should not throw
    });
  });

  describe('queryDoc', () => {
    it('should return vector search results', async () => {
      const queryVector = await embedder.embed('hello');

      store.acquireZvec('vector-lib', 'jieba');
      const docs: ZvecDoc[] = [
        {
          id: 'vec-doc-1',
          vector: await embedder.embed('hello world'),
          fields: { content: 'hello world text', meta: '', path: 'docs/hello.md', contentHash: 'v1' },
        },
        {
          id: 'vec-doc-2',
          vector: await embedder.embed('goodbye moon'),
          fields: { content: 'goodbye moon text', meta: '', path: 'docs/goodbye.md', contentHash: 'v2' },
        },
      ];
      store.addDoc('vector-lib', docs);

      const params: StoreQueryParams = {
        mode: 'vector',
        queryVector,
        topK: 2,
      };

      const results = store.queryDoc('vector-lib', params);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(2);
      // "hello" query should score "hello world" higher
      const helloResult = results.find((r) => r.id === 'vec-doc-1');
      expect(helloResult).toBeDefined();
    });

    it('should return hybrid search results', async () => {
      const queryVector = await embedder.embed('configuration');

      store.acquireZvec('hybrid-lib', 'jieba');
      const docs: ZvecDoc[] = [
        {
          id: 'hyb-doc-1',
          vector: await embedder.embed('chart configuration'),
          fields: { content: 'chart configuration settings', meta: '', path: 'docs/config.md', contentHash: 'h1' },
        },
      ];
      store.addDoc('hybrid-lib', docs);

      const params: StoreQueryParams = {
        mode: 'hybrid',
        queryText: 'configuration',
        queryVector,
        topK: 1,
      };

      const results = store.queryDoc('hybrid-lib', params);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty results for nonexistent library', () => {
      // acquireZvec for a library with no docs
      store.acquireZvec('empty-query-lib', 'jieba');
      const params: StoreQueryParams = {
        mode: 'vector',
        queryVector: Array(embedder.dimensions).fill(0),
        topK: 5,
      };

      const results = store.queryDoc('empty-query-lib', params);
      expect(results).toEqual([]);
    });
  });

  describe('close', () => {
    it('should close all collections and clear the map', () => {
      const closeTestDir = path.join(TEST_DIR, 'close-test');
      if (fs.existsSync(closeTestDir)) {
        fs.rmSync(closeTestDir, { recursive: true, force: true });
      }
      fs.mkdirSync(closeTestDir, { recursive: true });

      const closeStore = new Store(closeTestDir, embedder);
      closeStore.acquireZvec('close-lib', 'jieba');
      closeStore.close();

      if (fs.existsSync(closeTestDir)) {
        fs.rmSync(closeTestDir, { recursive: true, force: true });
      }
    });
  });
});

describe('buildZvecSchema', () => {
  it('should build schema with default dimensions', () => {
    const schema = buildZvecSchema(512);
    expect(schema).toBeDefined();
  });

  it('should build schema with jieba tokenizer', () => {
    const schema = buildZvecSchema(512, 'jieba');
    expect(schema).toBeDefined();
  });

  it('should build schema with standard tokenizer', () => {
    const schema = buildZvecSchema(512, 'standard');
    expect(schema).toBeDefined();
  });

  it('should build schema with custom dimensions', () => {
    const schema = buildZvecSchema(256);
    expect(schema).toBeDefined();
  });
});
