/**
 * Reranker — second-stage precision scoring for search results.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A candidate document for reranking. */
export interface RerankCandidate {
  id: string;
  content: string;
  /** Original score from the coarse search stage. */
  score: number;
  /** Heading path as a string (e.g. "Line Chart > Tooltip"). */
  headingPath?: string;
}

/** A reranked result. */
export interface RerankResult {
  id: string;
  /** Final score after reranking (higher is better). */
  score: number;
}

/** Reranker type */
export type Reranker = {
  rerank(query: string, candidates: RerankCandidate[]): Promise<RerankResult[]>;
};

/** Configuration for reranking. */
export interface RerankOptions {
  rerankFactor?: number;
  minCandidates?: number;
  phraseWeight?: number;
  phraseRepeatBonus?: number;
  termWeight?: number;
  termRepeatBonus?: number;
  substringWeight?: number;
  headingTermBonus?: number;
  headingPhraseBonus?: number;
  originalScoreCarry?: number;
}