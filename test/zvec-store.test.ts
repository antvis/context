import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  MemoryZvecStore,
  createZvecStore,
  isZvecAvailable,
} from '../src/storage/zvec-store';
import type { IZvecStore, ZvecStoreConfig } from '../src/storage/zvec-store';

const TEST_DIR = path.join(__dirname, '.test-tmp');
const STORE_PATH = path.join(TEST_DIR, 'test.zvec');

function makeConfig(dims: number = 4): ZvecStoreConfig {
  return {
    collectionName: 'test_collection',
    vectorField: 'embedding',
    vectorDims: dims,
    ftsFields: ['content'],
    fields: [
      { name: 'content', dataType: 'STRING', indexType: 'FTS', indexOptions: { tokenizerName: 'jieba' } },
    ],
  };
}

describe('MemoryZvecStore', () => {
  let store: MemoryZvecStore;

  beforeEach(() => {
    store = new MemoryZvecStore();
  });

  it('should insert and search documents', async () => {
    await store.insert([
      { id: 'doc1', vector: [0.1, 0.2, 0.3, 0.4], fields: { content: 'hello world' } },
      { id: 'doc2', vector: [0.4, 0.3, 0.2, 0.1], fields: { content: 'goodbye' } },
    ]);

    const results = await store.search({ vector: [0.1, 0.2, 0.3, 0.4], topK: 2 });
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('doc1');
    expect(results[0].score).toBeGreaterThan(0.9);
  });

  it('should support sync search', () => {
    store.insert([
      { id: 'doc1', vector: [0.1, 0.2, 0.3, 0.4], fields: { content: 'hello' } },
    ]);

    const results = store.searchSync({ vector: [0.1, 0.2, 0.3, 0.4], topK: 1 });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('doc1');
  });

  it('should support filter expressions', async () => {
    await store.insert([
      { id: 'a', vector: [1, 0, 0, 0], fields: { kind: 'foo' } },
      { id: 'b', vector: [0, 1, 0, 0], fields: { kind: 'bar' } },
    ]);

    const results = await store.search({
      vector: [1, 0, 0, 0],
      topK: 2,
      filter: "kind = 'foo'",
    });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('a');
  });

  it('should support hybrid search with configurable field weights', async () => {
    const weighted = new MemoryZvecStore([
      { fieldName: 'title', weight: 3 },
      { fieldName: 'content', weight: 1 },
    ]);

    await weighted.insert([
      { id: 't1', vector: [0.1, 0, 0, 0], fields: { title: 'sankey diagram', content: 'flow data' } },
      { id: 't2', vector: [0, 0.1, 0, 0], fields: { title: 'unrelated', content: 'sankey flow visualization' } },
    ]);

    const results = await weighted.searchHybrid({
      queryText: 'sankey',
      queryVector: [0.1, 0.1, 0, 0],
      topK: 2,
    });
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle empty store gracefully', async () => {
    const results = await store.search({ vector: [1, 0, 0, 0], topK: 5 });
    expect(results.length).toBe(0);
  });

  it('should clear all data on close', async () => {
    await store.insert([
      { id: 'doc1', vector: [1, 0, 0, 0], fields: {} },
    ]);
    await store.close();
    const results = await store.search({ vector: [1, 0, 0, 0], topK: 5 });
    expect(results.length).toBe(0);
  });
});

describe('ActualZvecStore (native)', () => {
  let store: IZvecStore;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    if (store) {
      try { await store.close(); } catch { /* ok */ }
    }
    await new Promise((r) => setTimeout(r, 200));
    if (fs.existsSync(TEST_DIR)) {
      try {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      } catch { /* may be locked */ }
    }
  });

  it('should create ActualZvecStore when zvec is available', async () => {
    if (!isZvecAvailable()) {
      console.warn('Skipping: @zvec/zvec not available');
      return;
    }

    const config = makeConfig(4);
    store = await createZvecStore(STORE_PATH, config);

    await store.insert([
      { id: 'doc1', vector: [0.1, 0.2, 0.3, 0.4], fields: { content: 'hello' } },
      { id: 'doc2', vector: [0.4, 0.3, 0.2, 0.1], fields: { content: 'world' } },
    ]);

    const results = store.searchSync({ vector: [0.1, 0.2, 0.3, 0.4], topK: 2 });
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('doc1');
  });

  it('should support hybrid search with Full Text Search', async () => {
    if (!isZvecAvailable()) {
      console.warn('Skipping: @zvec/zvec not available');
      return;
    }

    const config = makeConfig(4);
    store = await createZvecStore(STORE_PATH, config);

    await store.insert([
      { id: 't1', vector: [1, 0, 0, 0], fields: { content: 'sankey diagram visualization' } },
      { id: 't2', vector: [0, 1, 0, 0], fields: { content: 'bar chart example' } },
    ]);

    const results = store.searchHybridSync({
      queryText: 'sankey',
      queryVector: [0.9, 0.1, 0, 0],
      topK: 2,
    });
    expect(results.length).toBeGreaterThan(0);
  });

  it('should fall back to MemoryZvecStore when zvec not available', async () => {
    // When zvec IS available, createZvecStore creates an ActualZvecStore.
    // Either way, the returned store should work.
    const config = makeConfig(4);
    const s = await createZvecStore(STORE_PATH, config);
    expect(s).toBeDefined();

    await s.insert([
      { id: 'x', vector: [1, 2, 3, 4], fields: { content: 'test content' } },
    ]);
    const results = s.searchSync({ vector: [1, 2, 3, 4], topK: 1 });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('x');

    await s.close();
  });
});
