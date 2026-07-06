/**
 * Reranker — second-stage precision scoring for search results.
 *
 * The pipeline:
 *   1. Coarse search (vector / hybrid) → topK × rerankFactor candidates
 *   2. Reranker scores each candidate against the query
 *   3. Final sort by reranked score → topK results
 *
 * This two-stage approach combines fast vector pre-filtering with a more
 * expensive but more precise scoring model on the shortlist.
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

/** Reranker interface — custom rerankers can implement this. */
export interface Reranker {
  rerank(query: string, candidates: RerankCandidate[]): Promise<RerankResult[]>;
}

/** Configuration for reranking. */
export interface RerankOptions {
  /**
   * How many extra candidates to pull from the coarse search stage.
   * e.g. with topK=5 and rerankFactor=3, 15 candidates are reranked.
   * Default: 3
   */
  rerankFactor?: number;
  /**
   * Minimum number of candidates to rerank (floor).
   * Default: 10
   */
  minCandidates?: number;

  // -----------------------------------------------------------------------
  // KeywordReranker scoring weights — tune for your domain
  // -----------------------------------------------------------------------

  /** Weight for exact phrase match. Default: 3.0 */
  phraseWeight?: number;
  /** Bonus per additional phrase occurrence beyond the first. Default: 0.5 */
  phraseRepeatBonus?: number;
  /** Weight for whole-word term match. Default: 1.0 */
  termWeight?: number;
  /** Bonus per additional term occurrence beyond the first. Default: 0.2 */
  termRepeatBonus?: number;
  /** Weight for substring (partial) term match. Default: 0.3 */
  substringWeight?: number;
  /** Bonus when a query term appears in the heading path. Default: 2.0 */
  headingTermBonus?: number;
  /** Bonus when the full query phrase appears in the heading path. Default: 2.5 */
  headingPhraseBonus?: number;
  /** Fraction of the original coarse score carried into the reranked score. Default: 0.1 */
  originalScoreCarry?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_RERANK_FACTOR = 3;
const DEFAULT_MIN_CANDIDATES = 10;

/** Default scoring weights for KeywordReranker. */
const DEFAULT_WEIGHTS = {
  phraseWeight: 3.0,
  phraseRepeatBonus: 0.5,
  termWeight: 1.0,
  termRepeatBonus: 0.2,
  substringWeight: 0.3,
  headingTermBonus: 2.0,
  headingPhraseBonus: 2.5,
  originalScoreCarry: 0.1,
} as const;

// ---------------------------------------------------------------------------
// KeywordReranker — lexical overlap scoring
// ---------------------------------------------------------------------------

/**
 * Reranker that scores candidates by keyword / phrase overlap with the query.
 *
 * This provides a complementary signal to vector similarity: the coarse
 * embedding stage captures semantic closeness, while this reranker boosts
 * candidates that contain the exact query terms (or their substrings).
 *
 * All scoring weights are configurable via constructor options. See
 * `RerankOptions` for available tuning parameters.
 *
 * Scores are normalised to [0, 1] via min-max scaling.
 */
export class KeywordReranker implements Reranker {
  private readonly weights: typeof DEFAULT_WEIGHTS;

  constructor(options?: RerankOptions) {
    this.weights = {
      phraseWeight: options?.phraseWeight ?? DEFAULT_WEIGHTS.phraseWeight,
      phraseRepeatBonus: options?.phraseRepeatBonus ?? DEFAULT_WEIGHTS.phraseRepeatBonus,
      termWeight: options?.termWeight ?? DEFAULT_WEIGHTS.termWeight,
      termRepeatBonus: options?.termRepeatBonus ?? DEFAULT_WEIGHTS.termRepeatBonus,
      substringWeight: options?.substringWeight ?? DEFAULT_WEIGHTS.substringWeight,
      headingTermBonus: options?.headingTermBonus ?? DEFAULT_WEIGHTS.headingTermBonus,
      headingPhraseBonus: options?.headingPhraseBonus ?? DEFAULT_WEIGHTS.headingPhraseBonus,
      originalScoreCarry: options?.originalScoreCarry ?? DEFAULT_WEIGHTS.originalScoreCarry,
    };
  }

  async rerank(query: string, candidates: RerankCandidate[]): Promise<RerankResult[]> {
    if (candidates.length === 0) return [];

    const queryLower = query.toLowerCase();
    const queryTerms = tokenizeQuery(queryLower);
    const queryPhrase = queryLower.trim();
    const w = this.weights;

    const scored = candidates.map((c) => {
      const contentLower = c.content.toLowerCase();
      let score = 0;

      // 1. Exact phrase match — strongest signal
      if (contentLower.includes(queryPhrase)) {
        score += w.phraseWeight;
        // Bonus for each additional occurrence
        const phraseCount = countOccurrences(contentLower, queryPhrase);
        score += (phraseCount - 1) * w.phraseRepeatBonus;
      }

      // 2. Per-term matching
      for (const term of queryTerms) {
        if (contentLower.includes(term)) {
          // Whole word match
          if (isWordBoundary(contentLower, term)) {
            score += w.termWeight;
            const termCount = countTermMatches(contentLower, term);
            score += (termCount - 1) * w.termRepeatBonus;
          } else {
            // Substring match (e.g. "tool" matches "tooltip")
            score += w.substringWeight;
          }
        }
      }

      // 3. Heading path bonus — terms in section headings are more relevant
      if (c.headingPath) {
        const headingLower = c.headingPath.toLowerCase();
        for (const term of queryTerms) {
          if (headingLower.includes(term)) {
            score += w.headingTermBonus;
          }
        }
        if (queryPhrase.length > 2 && headingLower.includes(queryPhrase)) {
          score += w.headingPhraseBonus;
        }
      }

      // 4. Carry over a fraction of the original vector score
      score += c.score * w.originalScoreCarry;

      return { id: c.id, score };
    });

    // Min-max normalise to [0, 1]
    const scores = scored.map((s) => s.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;

    return scored.map((s) => ({
      id: s.id,
      score: (s.score - min) / range,
    }));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split a query into meaningful tokens. */
function tokenizeQuery(query: string): string[] {
  // Split on whitespace and CJK-friendly boundaries
  const raw = query
    .split(/[\s,，。.!！？?、：:；;]+/)
    .filter(Boolean);

  // For mixed CN/EN queries, also extract CJK bigrams as tokens
  const tokens: string[] = [];
  for (const r of raw) {
    tokens.push(r);
    // For CJK segments, add bigrams as additional tokens
    if (/[一-鿿]{3,}/.test(r)) {
      for (let i = 0; i + 2 <= r.length; i++) {
        tokens.push(r.slice(i, i + 2));
      }
    }
  }
  return [...new Set(tokens)];
}

/** Count non-overlapping occurrences of a substring. */
function countOccurrences(text: string, sub: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(sub, pos)) !== -1) {
    count++;
    pos += sub.length;
  }
  return count;
}

/** Count whole-word matches of a term. */
function countTermMatches(text: string, term: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(term, pos)) !== -1) {
    if (isWordBoundary(text, term, pos)) {
      count++;
    }
    pos += term.length;
  }
  return count;
}

/** Check if a substring occurrence is at a word boundary. */
function isWordBoundary(
  text: string,
  term: string,
  pos?: number,
): boolean {
  const idx = pos ?? text.indexOf(term);
  if (idx === -1) return false;
  const before = idx === 0 || /[\s\n.,;:!?，。！？、：；"'(（【《\-_]/.test(text[idx - 1]);
  const afterIdx = idx + term.length;
  const after = afterIdx >= text.length || /[\s\n.,;:!?，。！？、：；"')）】》\-_]/.test(text[afterIdx]);
  return before && after;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a reranker with optional weight configuration.
 *
 * Currently returns KeywordReranker. In the future this may auto-select
 * based on available models (cross-encoder, etc.).
 */
export function createReranker(options?: RerankOptions): Reranker {
  return new KeywordReranker(options);
}
