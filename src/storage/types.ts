/**
 * ZvecStore internal types.
 */

export interface ZvecDoc {
  id: string;
  vector: number[];
  fields: Record<string, string | number>;
}

export interface ZvecQueryResult {
  id: string;
  score: number;
  fields: Record<string, string | number>;
}

export interface ZvecSearchParams {
  vector: number[];
  topK: number;
  filter?: string;
}

export interface ZvecHybridParams {
  queryText: string;
  queryVector: number[];
  topK: number;
  filter?: string;
}

/** Field schema entry for building a zvec collection. */
export interface ZvecFieldSchema {
  name: string;
  dataType: 'STRING' | 'INT64' | 'FLOAT' | 'VECTOR_FP32';
  indexType?: 'FTS' | 'INVERT' | 'HNSW' | 'NONE';
  indexOptions?: Record<string, unknown>;
}

/** Configuration for creating a zvec collection. */
export interface ZvecStoreConfig {
  collectionName: string;
  vectorField: string;
  vectorDims: number;
  /** Scalar fields whose FTS indexes will be queried in hybrid search. */
  ftsFields: string[];
  /** Full field schema (vector + scalar). */
  fields: ZvecFieldSchema[];
}

export interface ActualZvecStoreOptions {
  /** Name of the vector field in the collection (default: 'embedding'). */
  vectorField: string;
  /** Names of scalar fields with FTS indexes, used in hybrid search. */
  ftsFields: string[];
  /**
   * RRF rank constant for hybrid search fusion (default: 60).
   *
   * Controls how much influence rare (low-rank) results have.
   * - Lower value (e.g. 10) → top ranks dominate, more "winner-takes-all"
   * - Higher value (e.g. 100) → ranks are more evenly weighted
   */
  rankConstant?: number;
}
