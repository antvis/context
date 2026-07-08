import { describe, it, expect } from 'vitest';
import { rerank } from '../../src/reranker/reranker';
import type { RerankCandidate } from '../../src/reranker/types';

describe('rerank', () => {
  it('should return empty array for empty candidates', async () => {
    const results = await rerank('test', []);
    expect(results).toEqual([]);
  });

  it('should boost candidates with exact phrase match', async () => {
    const candidates: RerankCandidate[] = [
      { id: '1', content: 'tooltip configuration settings', score: 0.5 },
      { id: '2', content: 'chart axis configuration', score: 0.5 },
      { id: '3', content: 'random unrelated content', score: 0.5 },
    ];

    const results = await rerank('tooltip configuration', candidates);
    const sorted = [...results].sort((a, b) => b.score - a.score);
    expect(sorted[0].id).toBe('1');
  });

  it('should boost candidates with term-level matches', async () => {
    const candidates: RerankCandidate[] = [
      { id: '1', content: 'the tooltip provides hover information', score: 0.3 },
      { id: '2', content: 'a simple chart example', score: 0.8 },
      { id: '3', content: 'chart axis labels configuration', score: 0.2 },
    ];

    const results = await rerank('tooltip', candidates);
    const sorted = [...results].sort((a, b) => b.score - a.score);
    expect(sorted[0].id).toBe('1');
  });

  it('should boost candidates with substring matches', async () => {
    const candidates: RerankCandidate[] = [
      { id: '1', content: 'some chart API', score: 0.5 },
      { id: '2', content: 'line API', score: 0.5 },
    ];

    const results = await rerank('chart', candidates);
    const sorted = [...results].sort((a, b) => b.score - a.score);
    expect(sorted[0].id).toBe('1');
  });

  it('should respect custom weights', async () => {
    const candidates: RerankCandidate[] = [
      { id: '1', content: 'tooltip', score: 0.5 },
      { id: '2', content: 'chart', score: 0.5 },
    ];

    const results = await rerank('tooltip', candidates, { phraseWeight: 10, termWeight: 0 });
    const sorted = [...results].sort((a, b) => b.score - a.score);
    expect(sorted[0].id).toBe('1');
  });

  it('should handle heading path bonus', async () => {
    const candidates: RerankCandidate[] = [
      { id: '1', content: 'some content', score: 0.5, headingPath: 'Chart > Tooltip' },
      { id: '2', content: 'tooltip content', score: 0.5, headingPath: 'Other Section' },
    ];

    const results = await rerank('tooltip', candidates);
    const sorted = [...results].sort((a, b) => b.score - a.score);
    expect(sorted[0].id).toBe('1');
  });

  it('should normalize scores to [0, 1]', async () => {
    const candidates: RerankCandidate[] = [
      { id: '1', content: 'test content', score: 0.1 },
      { id: '2', content: 'another test content', score: 0.9 },
    ];

    const results = await rerank('test', candidates);
    const scores = results.map((r) => r.score);
    expect(Math.min(...scores)).toBe(0);
    expect(Math.max(...scores)).toBe(1);
  });

  it('should handle Chinese queries', async () => {
    const candidates: RerankCandidate[] = [
      { id: '1', content: '折线图配置', score: 0.5 },
      { id: '2', content: '柱状图配置', score: 0.5 },
      { id: '3', content: '其他内容', score: 0.5 },
    ];

    const results = await rerank('折线图', candidates);
    const sorted = [...results].sort((a, b) => b.score - a.score);
    expect(sorted[0].id).toBe('1');
  });
});