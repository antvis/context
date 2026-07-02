import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ZVecStore } from '../src/storage/zvec-store';

const TEST_DIR = path.join(__dirname, '.test-tmp');
const STORE_PATH = path.join(TEST_DIR, 'test.zvec');

describe('ZVecStore', () => {
  let store: ZVecStore;

  beforeEach(async () => {
    // Clean up before creating store
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    store = await ZVecStore.create(STORE_PATH, 4);
  });

  afterEach(async () => {
    store?.close();
    await new Promise((r) => setTimeout(r, 200));
    if (fs.existsSync(TEST_DIR)) {
      try {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      } catch (e) {
        // Ignore - may be locked
      }
    }
  });

  it('should create and query store', () => {
    store.add('doc1', [0.1, 0.2, 0.3, 0.4], 'content1');
    store.add('doc2', [0.4, 0.3, 0.2, 0.1], 'content2');
    store.save();

    const results = store.search([0.1, 0.2, 0.3, 0.4], 2);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('doc1');
  });

  it('should return meta with content', () => {
    store.add('doc1', [0.1, 0.2, 0.3, 0.4], 'content1', { title: 'Test' });
    store.save();

    const doc = store.getDoc('doc1');
    expect(doc).toBeDefined();
    expect(doc!.content).toBe('content1');
    expect(doc!.meta).toEqual({ title: 'Test' });
  });

  it('should clear all data', () => {
    store.add('doc1', [0.1, 0.2, 0.3, 0.4], 'content1');
    store.add('doc2', [0.4, 0.3, 0.2, 0.1], 'content2');
    store.save();

    store.clear();

    expect(store.getDoc('doc1')).toBeUndefined();
    expect(store.getDoc('doc2')).toBeUndefined();
  });
});