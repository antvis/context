import type { RerankCandidate, RerankResult, RerankOptions } from './types';
import { tokenizeQuery, countOccurrences, countTermMatches, isWordBoundary } from './helpers';

const DEFAULTS = {
  phraseWeight: 3.0,
  phraseRepeatBonus: 0.5,
  termWeight: 1.0,
  termRepeatBonus: 0.2,
  substringWeight: 0.3,
  headingTermBonus: 2.0,
  headingPhraseBonus: 2.5,
  originalScoreCarry: 0.1,
} as const;

/**
 * Rerank candidates by keyword / phrase overlap with the query.
 * Scores are normalised to [0, 1] via min-max scaling.
 */
export async function rerank(
  query: string,
  candidates: RerankCandidate[],
  options?: RerankOptions,
): Promise<RerankResult[]> {
  if (candidates.length === 0) return [];

  const w = {
    phraseWeight: options?.phraseWeight ?? DEFAULTS.phraseWeight,
    phraseRepeatBonus: options?.phraseRepeatBonus ?? DEFAULTS.phraseRepeatBonus,
    termWeight: options?.termWeight ?? DEFAULTS.termWeight,
    termRepeatBonus: options?.termRepeatBonus ?? DEFAULTS.termRepeatBonus,
    substringWeight: options?.substringWeight ?? DEFAULTS.substringWeight,
    headingTermBonus: options?.headingTermBonus ?? DEFAULTS.headingTermBonus,
    headingPhraseBonus: options?.headingPhraseBonus ?? DEFAULTS.headingPhraseBonus,
    originalScoreCarry: options?.originalScoreCarry ?? DEFAULTS.originalScoreCarry,
  };

  const lowerQuery = query.toLowerCase();
  const queryTerms = tokenizeQuery(lowerQuery);
  const queryPhrase = lowerQuery.trim();

  const scored = candidates.map((c) => {
    const content = c.content.toLowerCase();
    let score = 0;

    // 1. Exact phrase match
    if (content.includes(queryPhrase)) {
      score += w.phraseWeight + (countOccurrences(content, queryPhrase) - 1) * w.phraseRepeatBonus;
    }

    // 2. Per-term matching
    for (const term of queryTerms) {
      if (content.includes(term)) {
        score += isWordBoundary(content, term) ? w.termWeight + (countTermMatches(content, term) - 1) * w.termRepeatBonus : w.substringWeight;
      }
    }

    // 3. Heading path bonus
    if (c.headingPath) {
      const heading = c.headingPath.toLowerCase();
      for (const term of queryTerms) {
        if (heading.includes(term)) score += w.headingTermBonus;
      }
      if (queryPhrase.length > 2 && heading.includes(queryPhrase)) {
        score += w.headingPhraseBonus;
      }
    }

    // 4. Carry over original score
    score += c.score * w.originalScoreCarry;

    return { id: c.id, score };
  });

  // Min-max normalise to [0, 1]
  const scores = scored.map((s) => s.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  return scored.map((s) => ({ id: s.id, score: (s.score - min) / range }));
}