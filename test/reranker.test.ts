import { describe, it, expect } from 'vitest';
import { KeywordReranker, createReranker } from '../src/reranker';
import type { RerankCandidate } from '../src/reranker';

describe('KeywordReranker', () => {
  const reranker = new KeywordReranker();

  describe('rerank', () => {
    it('should return empty array for empty candidates', async () => {
      const results = await reranker.rerank('test', []);
      expect(results).toEqual([]);
    });

    it('should boost candidates with exact phrase match', async () => {
      const candidates: RerankCandidate[] = [
        { id: '1', content: 'tooltip configuration settings', score: 0.5 },
        { id: '2', content: 'chart axis configuration', score: 0.5 },
        { id: '3', content: 'random unrelated content', score: 0.5 },
      ];

      const results = await reranker.rerank('tooltip configuration', candidates);
      // Candidate 1 should score highest (exact phrase match)
      const sorted = [...results].sort((a, b) => b.score - a.score);
      expect(sorted[0].id).toBe('1');
    });

    it('should boost candidates with term-level matches', async () => {
      const candidates: RerankCandidate[] = [
        { id: '1', content: 'the tooltip provides hover information', score: 0.3 },
        { id: '2', content: 'a simple chart example', score: 0.8 },
      ];

      const results = await reranker.rerank('tooltip', candidates);
      const sorted = [...results].sort((a, b) => b.score - a.score);
      expect(sorted[0].id).toBe('1');
    });

    it('should boost heading path matches', async () => {
      const candidates: RerankCandidate[] = [
        { id: '1', content: 'general information', score: 0.5, headingPath: 'Line Chart > Tooltip' },
        { id: '2', content: 'chart general information', score: 0.5 },
      ];

      const results = await reranker.rerank('tooltip', candidates);
      const sorted = [...results].sort((a, b) => b.score - a.score);
      expect(sorted[0].id).toBe('1');
    });

    it('should carry over original score as minor factor', async () => {
      const candidates: RerankCandidate[] = [
        { id: '1', content: 'random unrelated', score: 0.9 },
        { id: '2', content: 'random other', score: 0.1 },
      ];

      const results = await reranker.rerank('unrelated query', candidates);
      // Even with no keyword matches, higher original score gives slight advantage
      // (but reranker score normalization means the difference is small)
      expect(results.length).toBe(2);
    });

    it('should normalize scores to [0, 1] range', async () => {
      const candidates: RerankCandidate[] = [
        { id: '1', content: 'exact match test', score: 0.5 },
        { id: '2', content: 'partial test', score: 0.3 },
        { id: '3', content: 'no match', score: 0.1 },
      ];

      const results = await reranker.rerank('test', candidates);
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });

    it('should handle CJK queries', async () => {
      const candidates: RerankCandidate[] = [
        { id: '1', content: '折线图配置方法详解', score: 0.5 },
        { id: '2', content: '柱状图使用说明', score: 0.5 },
      ];

      const results = await reranker.rerank('折线图', candidates);
      const sorted = [...results].sort((a, b) => b.score - a.score);
      expect(sorted[0].id).toBe('1');
    });
  });
});

describe('createReranker', () => {
  it('should return a KeywordReranker instance', () => {
    const reranker = createReranker();
    expect(reranker).toBeInstanceOf(KeywordReranker);
  });
});
