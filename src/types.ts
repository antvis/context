/**
 * Document structure
 */
export interface Document {
  /** Document unique identifier (default: file path) */
  id: string;
  /** Document content */
  content: string;
  /** Markdown front-matter metadata */
  meta?: Record<string, unknown>;
}

/**
 * Context initialization options
 */
export interface ContextOptions {
  /** Directory to store vector files */
  vectorsDir: string;
  /** Transformers model name */
  model?: string;
}

/**
 * Query options
 */
export interface QueryOptions {
  /** Library name (required) */
  library: string;
  /** Number of results to return */
  topK?: number;
}

/**
 * Query result
 */
export interface QueryResult {
  /** Document ID */
  id: string;
  /** Document content */
  content: string;
  /** Similarity score */
  score: number;
  /** Document metadata */
  meta?: Record<string, unknown>;
}