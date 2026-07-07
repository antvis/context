/**
 * zvec-store — zvec storage module: types, implementation, and factories.
 *
 * Combines the former split files into a single module:
 *   types.ts          → public types & interfaces
 *   actual-store.ts   → ActualZvecStore, factories, schema builder
 */

// ---------------------------------------------------------------------------
// Public types (re-exported from types.ts)
// ---------------------------------------------------------------------------

export type {
  ZvecDoc,
  ZvecQueryResult,
  ZvecSearchParams,
  ZvecHybridParams,
  ZvecFieldSchema,
  ZvecStoreConfig,
  ActualZvecStoreOptions,
} from './types';

// ---------------------------------------------------------------------------
// Internal types — zvec SDK & collection interfaces
// ---------------------------------------------------------------------------

import type {
  ZvecDoc,
  ZvecQueryResult,
  ZvecSearchParams,
  ZvecHybridParams,
  ZvecStoreConfig,
  ActualZvecStoreOptions,
  ZvecFieldSchema,
} from './types';

let _zvecModule: unknown = undefined;
let _zvecLoadFailed = false;

/** Zvec SDK type — minimal interface we rely on. */
interface ZvecSDK {
  ZVecCollectionSchema: new (config: unknown) => unknown;
  ZVecDataType: Record<string, unknown>;
  ZVecIndexType: Record<string, unknown>;
  ZVecMetricType: Record<string, unknown>;
  ZVecCreateAndOpen(path: string, schema: unknown): ZvecCollection;
  ZVecOpen(path: string, options?: Record<string, unknown>): ZvecCollection;
}

/** Zvec collection type — minimal interface we rely on. */
interface ZvecCollection {
  insertSync(records: unknown[]): void;
  upsertSync(records: unknown[]): void;
  fetchSync(params: { ids: string | string[]; outputFields?: string[]; includeVector?: boolean }): Record<string, ZvecQueryRaw>;
  querySync(params: unknown): ZvecQueryRaw[];
  multiQuerySync(params: unknown): ZvecQueryRaw[];
  closeSync(): void;
}

interface ZvecQueryRaw {
  id: string;
  score: number;
  fields?: Record<string, string | number>;
}

function loadZvecSync(): ZvecSDK | undefined {
  if (_zvecModule) return _zvecModule as ZvecSDK;
  if (_zvecLoadFailed) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _zvecModule = require('@zvec/zvec');
  } catch {
    _zvecLoadFailed = true;
    return undefined;
  }
  return _zvecModule as ZvecSDK;
}

function requireZvecSync(): ZvecSDK {
  const z = loadZvecSync();
  if (!z) {
    throw new Error(
      '@zvec/zvec is not installed. Install it with:\n' +
        '  pnpm add @zvec/zvec'
    );
  }
  return z;
}

// ---------------------------------------------------------------------------
// Schema builder
// ---------------------------------------------------------------------------

/**
 * Build a ZVecCollectionSchema from a generic ZvecStoreConfig.
 * Internal helper for store creation.
 */
function buildZvecSchema(z: ZvecSDK, config: ZvecStoreConfig): unknown {
  const { ZVecCollectionSchema, ZVecDataType, ZVecIndexType, ZVecMetricType } = z;

  const vectorSchema = {
    name: config.vectorField,
    dataType: ZVecDataType.VECTOR_FP32,
    dimension: config.vectorDims,
    indexParams: {
      indexType: ZVecIndexType.HNSW,
      metricType: ZVecMetricType.COSINE,
      m: 32,
      efConstruction: 200
    }
  };

  const fieldTypeMap: Record<string, unknown> = {
    STRING: ZVecDataType.STRING,
    INT64: ZVecDataType.INT64,
    FLOAT: ZVecDataType.FLOAT,
    VECTOR_FP32: ZVecDataType.VECTOR_FP32,
  };

  const indexTypeMap: Record<string, unknown> = {
    FTS: ZVecIndexType.FTS,
    INVERT: ZVecIndexType.INVERT,
    HNSW: ZVecIndexType.HNSW,
  };

  const fieldSchemas = config.fields.map((f: ZvecFieldSchema) => {
    const schema: Record<string, unknown> = {
      name: f.name,
      dataType: fieldTypeMap[f.dataType],
    };

    if (f.indexType && f.indexType !== 'NONE' && indexTypeMap[f.indexType]) {
      schema.indexParams = {
        indexType: indexTypeMap[f.indexType],
        ...(f.indexOptions ?? {}),
      };
    }

    return schema;
  });

  return new ZVecCollectionSchema({
    name: config.collectionName,
    vectors: vectorSchema,
    fields: fieldSchemas,
  });
}

// ---------------------------------------------------------------------------
// ActualZvecStore implementation
// ---------------------------------------------------------------------------

const DEFAULT_OPEN_OPTIONS: ActualZvecStoreOptions = {
  vectorField: 'embedding',
  ftsFields: [],
  rankConstant: 60,
};

/**
 * ZvecStore backed by the native @zvec/zvec library.
 *
 * Provides true hybrid search: zvec's FTS path accepts raw text (no embedding),
 * the vector path uses pre-computed embeddings, and `multiQuerySync` with RRF
 * fuses both in the engine.
 */
export class ActualZvecStore {
  private _collection: ZvecCollection;
  private _closed = false;
  private _vectorField: string;
  private _ftsFields: string[];
  private _rankConstant: number;

  constructor(collection: ZvecCollection, options: ActualZvecStoreOptions) {
    this._collection = collection;
    this._vectorField = options.vectorField;
    this._ftsFields = options.ftsFields;
    this._rankConstant = options.rankConstant ?? 60;
  }

  /**
   * Create a new zvec collection with a generic schema config.
   */
  static async create(path: string, config: ZvecStoreConfig): Promise<ActualZvecStore> {
    const z = requireZvecSync();
    const schema = buildZvecSchema(z, config);
    const collection = z.ZVecCreateAndOpen(path, schema);
    return new ActualZvecStore(collection, {
      vectorField: config.vectorField,
      ftsFields: config.ftsFields,
    });
  }

  /** Synchronous version of `create`. */
  static createSync(path: string, config: ZvecStoreConfig): ActualZvecStore {
    const z = requireZvecSync();
    const schema = buildZvecSchema(z, config);
    const collection = z.ZVecCreateAndOpen(path, schema);
    return new ActualZvecStore(collection, {
      vectorField: config.vectorField,
      ftsFields: config.ftsFields,
    });
  }

  static async open(
    path: string,
    options?: ActualZvecStoreOptions
  ): Promise<ActualZvecStore> {
    const z = requireZvecSync();
    const collection = z.ZVecOpen(path);
    return new ActualZvecStore(collection, options ?? DEFAULT_OPEN_OPTIONS);
  }

  /** Synchronous version of `open`. Uses read-only to allow concurrent readers. */
  static openSync(
    path: string,
    options?: ActualZvecStoreOptions
  ): ActualZvecStore {
    const z = requireZvecSync();
    const collection = z.ZVecOpen(path, { readOnly: true });
    return new ActualZvecStore(collection, options ?? DEFAULT_OPEN_OPTIONS);
  }

  async insert(docs: ZvecDoc[]): Promise<void> {
    if (this._closed) throw new Error('Store is closed');
    if (docs.length === 0) return;

    const records = docs.map((d) => ({
      id: d.id,
      vectors: { [this._vectorField]: d.vector },
      fields: d.fields
    }));
    // upsertSync handles both new docs and content-changed updates in one call.
    this._collection.upsertSync(records);
  }

  async fetch(ids: string[], outputFields?: string[]): Promise<Record<string, ZvecQueryResult>> {
    if (this._closed) throw new Error('Store is closed');
    if (ids.length === 0) return {};

    const raw = this._collection.fetchSync({
      ids,
      outputFields,
      includeVector: false,
    });

    const result: Record<string, ZvecQueryResult> = {};
    for (const [id, doc] of Object.entries(raw)) {
      result[id] = {
        id,
        score: 0,
        fields: (doc as ZvecQueryRaw).fields ?? {},
      };
    }
    return result;
  }

  async search(params: ZvecSearchParams): Promise<ZvecQueryResult[]> {
    if (this._closed) throw new Error('Store is closed');

    const rawResults = this._collection.querySync(
      this._buildVectorQuery(params)
    );

    return rawResults.map((r: ZvecQueryRaw) => ({
      id: r.id,
      score: r.score,
      fields: r.fields ?? {}
    }));
  }

  async searchHybrid(params: ZvecHybridParams): Promise<ZvecQueryResult[]> {
    if (this._closed) throw new Error('Store is closed');

    const rawResults = this._collection.multiQuerySync(
      this._buildHybridQuery(params)
    );

    return rawResults.map((r: ZvecQueryRaw) => ({
      id: r.id,
      score: r.score,
      fields: r.fields ?? {}
    }));
  }

  /** Build a query params object for vector search, omitting filter when undefined. */
  private _buildVectorQuery(params: ZvecSearchParams): Record<string, unknown> {
    const q: Record<string, unknown> = {
      fieldName: this._vectorField,
      vector: params.vector,
      topk: params.topK,
    };
    if (params.filter) {
      q.filter = params.filter;
    }
    return q;
  }

  /** Build multi-field FTS query paths for hybrid search from configured ftsFields. */
  private _buildFtsQueries(queryText: string, topK: number): Record<string, unknown>[] {
    const z = loadZvecSync();
    const ftsParams = z
      ? { indexType: z.ZVecIndexType.FTS, defaultOperator: 'OR' as const }
      : undefined;

    return this._ftsFields.map((fieldName) => ({
      fieldName,
      fts: { matchString: queryText },
      numCandidates: topK * 2,
      params: ftsParams,
    }));
  }

  /** Build multiQuery params for hybrid search, omitting filter when undefined. */
  private _buildHybridQuery(params: ZvecHybridParams): Record<string, unknown> {
    const q: Record<string, unknown> = {
      queries: [
        {
          fieldName: this._vectorField,
          vector: params.queryVector,
          numCandidates: params.topK * 2
        },
        ...this._buildFtsQueries(params.queryText, params.topK),
      ],
      topk: params.topK,
      rerank: { type: 'rrf', rankConstant: this._rankConstant }
    };
    if (params.filter) {
      q.filter = params.filter;
    }
    return q;
  }

  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    try {
      this._collection.closeSync();
    } catch {
      // best-effort
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience factories
// ---------------------------------------------------------------------------

/**
 * Create a zvec store with the given config.
 */
export async function createZvecStore(
  path: string,
  config: ZvecStoreConfig,
): Promise<ActualZvecStore> {
  return ActualZvecStore.create(path, config);
}

/**
 * Open a zvec store.
 * Requires @zvec/zvec to be installed.
 */
export function openZvecStoreSync(
  path: string,
  options?: ActualZvecStoreOptions
): ActualZvecStore {
  const z = loadZvecSync();
  if (z) {
    return ActualZvecStore.openSync(path, options);
  }
  throw new Error(
    '@zvec/zvec is not installed. Install it with:\n' +
      '  pnpm add @zvec/zvec'
  );
}
