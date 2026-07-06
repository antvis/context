import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
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
});
