import { describe, it, expect } from 'vitest';
import { applyRerank } from '../../src/reranker';
import type { QueryResult } from '../../src/types';

describe('applyRerank', () => {
  it('should return results unchanged when fewer than topK', async () => {
    const results: QueryResult[] = [
      { id: '1', content: 'test', score: 0.5 },
      { id: '2', content: 'test2', score: 0.3 },
    ];
    const topK = 10;

    const rerankOptions = { rerankFactor: 2, minCandidates: 5 };
    const reranked = await applyRerank(rerankOptions, 'test', results, topK);

    expect(reranked).toEqual(results);
  });

  it('should sort results by reranked score when more than topK', async () => {
    const results: QueryResult[] = [
      { id: '1', content: 'tooltip config', score: 0.9 },
      { id: '2', content: 'chart config', score: 0.8 },
      { id: '3', content: 'axis config', score: 0.7 },
      { id: '4', content: 'other content', score: 0.1 },
    ];
    const topK = 2;

    const rerankOptions = { rerankFactor: 2, minCandidates: 5 };
    const reranked = await applyRerank(rerankOptions, 'config', results, topK);

    // Results should be sorted by the new score
    expect(reranked[0].score).toBeGreaterThanOrEqual(reranked[1].score);
  });

  it('should handle empty results', async () => {
    const results: QueryResult[] = [];
    const topK = 10;

    const rerankOptions = { rerankFactor: 2, minCandidates: 5 };
    const reranked = await applyRerank(rerankOptions, 'test', results, topK);

    expect(reranked).toEqual([]);
  });

  it('should handle undefined rerankOptions', async () => {
    const results: QueryResult[] = [
      { id: '1', content: 'test', score: 0.5 },
    ];
    const topK = 10;

    const reranked = await applyRerank(undefined, 'test', results, topK);

    expect(reranked).toEqual(results);
  });
});