import { describe, it, expect } from 'vitest';
import { SimpleEmbedder } from '../src/embedder/simple';

describe('SimpleEmbedder', () => {
  const embedder = new SimpleEmbedder();

  describe('basic properties', () => {
    it('should have 512 dimensions', () => {
      expect(embedder.dimensions).toBe(512);
    });
  });

  describe('embed', () => {
    it('should return a vector of correct length', async () => {
      const vec = await embedder.embed('hello world');
      expect(vec.length).toBe(512);
    });

    it('should return non-zero vectors for meaningful text', async () => {
      const vec = await embedder.embed('important semantic content');
      const nonzeroCount = vec.filter((v) => v !== 0).length;
      expect(nonzeroCount).toBeGreaterThan(0);
    });

    it('should produce different vectors for different text', async () => {
      const vec1 = await embedder.embed('chart visualization');
      const vec2 = await embedder.embed('database query');
      // Vectors should not be identical
      const identical = vec1.every((v, i) => v === vec2[i]);
      expect(identical).toBe(false);
    });

    it('should handle CJK text', async () => {
      const vec = await embedder.embed('折线图配置');
      expect(vec.length).toBe(512);
      const nonzeroCount = vec.filter((v) => v !== 0).length;
      expect(nonzeroCount).toBeGreaterThan(0);
    });

    it('should handle mixed CN/EN text', async () => {
      const vec = await embedder.embed('line chart 折线图');
      expect(vec.length).toBe(512);
    });

    it('should handle empty text gracefully', async () => {
      const vec = await embedder.embed('');
      expect(vec.length).toBe(512);
    });
  });

  describe('embedBatch', () => {
    it('should return vectors for each input text', async () => {
      const vecs = await embedder.embedBatch(['hello', 'world']);
      expect(vecs.length).toBe(2);
      expect(vecs[0].length).toBe(512);
      expect(vecs[1].length).toBe(512);
    });

    it('should produce same result as individual embed calls', async () => {
      const batchVecs = await embedder.embedBatch(['test one', 'test two']);
      const singleVec1 = await embedder.embed('test one');
      const singleVec2 = await embedder.embed('test two');
      // Results should be identical (SimpleEmbedder is deterministic)
      expect(batchVecs[0]).toEqual(singleVec1);
      expect(batchVecs[1]).toEqual(singleVec2);
    });
  });

  describe('L2 normalization', () => {
    it('should produce L2-normalized vectors', async () => {
      const vec = await embedder.embed('normalized vector test');
      const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
      expect(Math.abs(norm - 1)).toBeLessThan(0.01);
    });
  });

  describe('with synonym map', () => {
    it('should incorporate synonym terms into embedding', async () => {
      const synonyms = new Map<string, string[]>([
        ['tooltip', ['提示框']],
      ]);
      const embedderWithSyn = new SimpleEmbedder(synonyms);

      const vecWithout = await embedder.embed('tooltip');
      const vecWith = await embedderWithSyn.embed('tooltip');

      // With synonyms, the vector should differ (extra terms injected)
      const identical = vecWithout.every((v, i) => v === vecWith[i]);
      expect(identical).toBe(false);
    });
  });
});
