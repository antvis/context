import * as fs from 'fs';
import * as path from 'path';
import {
  createZvecStore,
  openZvecStoreSync,
  isZvecAvailable,
} from './storage/zvec-store';
import type { IZvecStore, ZvecStoreConfig, FtsFieldWeight, ActualZvecStoreOptions } from './storage/zvec-store';
import { MemoryZvecStore } from './storage/memory-store';
import type { Embedder } from './embedder';
import { detectTokenizer } from './embedder';
import type { ContextOptions } from './types';

// ---------------------------------------------------------------------------
// Default schema constants
// ---------------------------------------------------------------------------

const DEFAULT_VECTOR_FIELD = 'embedding';
const DEFAULT_FTS_FIELDS = ['content'];
const DEFAULT_RANK_CONSTANT = 60;

function resolveFtsFields(options?: ContextOptions): string[] {
  return options?.ftsFields ?? DEFAULT_FTS_FIELDS;
}

function resolveFtsWeights(options?: ContextOptions): FtsFieldWeight[] {
  const ftsFields = resolveFtsFields(options);
  const weightMap = options?.ftsFieldWeights;

  if (weightMap) {
    return ftsFields.map((fieldName) => ({
      fieldName,
      weight: weightMap[fieldName] ?? 1.0,
    }));
  }

  // Default: all FTS fields have weight 1.0
  return ftsFields.map((fieldName) => ({ fieldName, weight: 1.0 }));
}

function resolveTokenizer(options?: ContextOptions, sampleText?: string): string {
  const tokenizer = options?.tokenizer ?? 'auto';
  if (tokenizer === 'auto') {
    // When a document sample is available, auto-detect the best tokenizer
    // based on character distribution (CJK → jieba, Latin → standard).
    // Falls back to 'jieba' as the safe default for mixed-language content
    // when no sample has been loaded yet.
    if (sampleText && sampleText.trim().length > 0) {
      return detectTokenizer(sampleText);
    }
    return 'jieba';
  }
  return tokenizer;
}

function contextStoreConfig(dims: number, options?: ContextOptions, sampleText?: string): ZvecStoreConfig {
  const ftsFields = resolveFtsFields(options);
  const tokenizerName = resolveTokenizer(options, sampleText);

  return {
    collectionName: 'context_docs',
    vectorField: DEFAULT_VECTOR_FIELD,
    vectorDims: dims,
    ftsFields,
    fields: [
      {
        name: 'content',
        dataType: 'STRING',
        indexType: ftsFields.includes('content') ? 'FTS' : 'NONE',
        indexOptions: { tokenizerName },
      },
      { name: 'meta', dataType: 'STRING' },
      { name: 'sourceFilePath', dataType: 'STRING' },
    ],
  };
}

function storeOpenOptions(options?: ContextOptions): ActualZvecStoreOptions {
  return {
    vectorField: DEFAULT_VECTOR_FIELD,
    ftsFields: resolveFtsFields(options),
    rankConstant: options?.rankConstant ?? DEFAULT_RANK_CONSTANT,
  };
}

// ---------------------------------------------------------------------------
// StoreManager — manages zvec store lifecycle per library
// ---------------------------------------------------------------------------

/**
 * StoreManager handles creation, caching, and lazy-loading of IZvecStore
 * instances. Each library gets its own `.zvec` file on disk.
 */
export class StoreManager {
  private readonly vectorsDir: string;
  private readonly embedder: Embedder;
  private readonly ftsWeights: FtsFieldWeight[];
  private readonly rankConstant: number;
  private readonly contextOptions?: ContextOptions;
  private readonly stores: Map<string, IZvecStore> = new Map();
  /** In-flight creation promises — prevents duplicate stores from concurrent calls. */
  private readonly pending: Map<string, Promise<IZvecStore>> = new Map();

  constructor(vectorsDir: string, embedder: Embedder, options?: ContextOptions) {
    this.vectorsDir = vectorsDir;
    this.embedder = embedder;
    this.ftsWeights = resolveFtsWeights(options);
    this.rankConstant = options?.rankConstant ?? DEFAULT_RANK_CONSTANT;
    this.contextOptions = options;
  }

  /** Get the FTS field weights for MemoryZvecStore fallback. */
  getFtsWeights(): FtsFieldWeight[] {
    return this.ftsWeights;
  }

  /** Get the RRF rank constant for hybrid search. */
  getRankConstant(): number {
    return this.rankConstant;
  }

  private getStorePath(library: string): string {
    return path.join(this.vectorsDir, `${library}.zvec`);
  }

  /**
   * Get or create a zvec store for a library.
   *
   * Uses a Promise-based lock so that concurrent calls for the same library
   * share a single creation attempt instead of racing to produce duplicate
   * store instances.
   *
   * @param library   Library name.
   * @param sampleText Optional document sample for auto-detecting FTS tokenizer
   *                   when `tokenizer` is `'auto'`.  Only used for new stores.
   */
  async getOrCreate(library: string, sampleText?: string): Promise<IZvecStore> {
    const cached = this.stores.get(library);
    if (cached) return cached;

    const pending = this.pending.get(library);
    if (pending) return pending;

    const promise = this._doGetOrCreate(library, sampleText);
    this.pending.set(library, promise);
    try {
      const store = await promise;
      this.stores.set(library, store);
      return store;
    } finally {
      this.pending.delete(library);
    }
  }

  private async _doGetOrCreate(library: string, sampleText?: string): Promise<IZvecStore> {
    const filePath = this.getStorePath(library);
    const allowFallback = this.contextOptions?.allowMemoryFallback ?? false;

    if (fs.existsSync(filePath)) {
      // Existing store on disk — try to open with zvec
      if (isZvecAvailable()) {
        return openZvecStoreSync(filePath, storeOpenOptions(this.contextOptions));
      }
      // zvec unavailable for existing store
      if (allowFallback) {
        console.warn(
          `[context] @zvec/zvec not available — opening library "${library}" ` +
          `with in-memory MemoryZvecStore. Data will NOT be persisted.`
        );
        return new MemoryZvecStore(this.ftsWeights, this.rankConstant);
      }
      throw new Error(
        `Cannot open existing store "${filePath}": @zvec/zvec is not installed. ` +
        `Install it with: pnpm add @zvec/zvec\n` +
        `Or set allowMemoryFallback: true to use in-memory store (no persistence).`
      );
    }

    // New store — createZvecStore already handles fallback internally
    try {
      return await createZvecStore(
        filePath,
        contextStoreConfig(this.embedder.dimensions, this.contextOptions, sampleText),
        this.ftsWeights,
        this.rankConstant,
      );
    } catch (err) {
      if (allowFallback) {
        console.warn(
          `[context] Store creation failed for library "${library}", ` +
          `falling back to in-memory MemoryZvecStore. ` +
          `Error: ${(err as Error).message?.split('\n')[0]}`
        );
        return new MemoryZvecStore(this.ftsWeights, this.rankConstant);
      }
      throw err;
    }
  }

  /**
   * Get an existing store (already opened or cached).
   * Returns undefined if the store has not been opened yet.
   */
  getCached(library: string): IZvecStore | undefined {
    return this.stores.get(library);
  }

  /**
   * Try to lazily open an existing store on disk.
   * Returns the store if found, undefined otherwise.
   */
  tryOpen(library: string): IZvecStore | undefined {
    if (this.stores.has(library)) {
      return this.stores.get(library)!;
    }

    const filePath = this.getStorePath(library);
    if (fs.existsSync(filePath)) {
      const store = openZvecStoreSync(filePath, storeOpenOptions(this.contextOptions));
      this.stores.set(library, store);
      return store;
    }

    return undefined;
  }

  /**
   * Check whether a store file exists on disk for a library.
   */
  existsOnDisk(library: string): boolean {
    return fs.existsSync(this.getStorePath(library));
  }

  /**
   * Close and remove a store from cache.
   */
  async close(library: string): Promise<void> {
    const store = this.stores.get(library);
    if (store) {
      await store.close();
      this.stores.delete(library);
    }
  }

  /**
   * Delete the store file from disk (after closing it).
   *
   * Used by `Context.rebuild()` to physically remove vector data before
   * re-creating the store with fresh embeddings.
   */
  async deleteStore(library: string): Promise<void> {
    await this.close(library);
    const filePath = this.getStorePath(library);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Close all stores.
   */
  async closeAll(): Promise<void> {
    for (const [, store] of this.stores) {
      await store.close();
    }
    this.stores.clear();
  }
}
