import type { RerankCandidate, RerankOptions } from './types';
import type { QueryResult } from '../types';
import { rerank } from './reranker';

export type { RerankOptions };

/**
 * Apply reranking to query results.
 */
export async function applyRerank(
  rerankOptions: RerankOptions | undefined,
  query: string,
  results: QueryResult[],
  topK: number,
): Promise<QueryResult[]> {
  if (results.length <= topK) return results;

  const candidates: RerankCandidate[] = results.map((r) => ({
    id: r.id,
    content: r.content,
    score: r.score,
  }));

  const reranked = await rerank(query, candidates, rerankOptions);

  const scoreMap = new Map(reranked.map((r) => [r.id, r.score]));
  for (const result of results) {
    const newScore = scoreMap.get(result.id);
    if (newScore !== undefined) {
      result.score = newScore;
    }
  }

  return results;
}