import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Embedder } from '../src/embedder/embedder';

/**
 * Embedder tests — uses a mock pipeline to avoid downloading HuggingFace models.
 */
describe('Embedder', () => {
  let embedder: Embedder;

  beforeAll(() => {
    embedder = new Embedder();
  });

  describe('properties', () => {
    it('should have default dimensions of 512', () => {
      expect(embedder.dimensions).toBe(512);
    });
  });

  describe('embed with mock pipeline', () => {
    // Mock the static pipeline so we don't need to download models
    const mockPipeline = vi.fn(async (texts: string[], options: Record<string, unknown>) => {
      const dim = 512;
      const vectors = texts.map(() => Array(dim).fill(0.1));
      return {
        tolist: () => vectors,
      };
    });

    beforeAll(() => {
      // Inject mock pipeline into the static field
      Embedder.pipeline = mockPipeline as any;
    });

    it('should embed a single text string', async () => {
      const vector = await embedder.embed('hello world');
      expect(vector).toBeDefined();
      expect(vector.length).toBe(512);
    });

    it('should embed a batch of texts', async () => {
      const vectors = await embedder.embedBatch(['hello', 'world']);
      expect(vectors.length).toBe(2);
      expect(vectors[0].length).toBe(512);
      expect(vectors[1].length).toBe(512);
    });

    it('should call pipeline with provided texts', async () => {
      mockPipeline.mockClear();
      await embedder.embedBatch(['test1', 'test2']);
      expect(mockPipeline).toHaveBeenCalledWith(['test1', 'test2'], {
        pooling: 'mean',
        normalize: true,
      });
    });

    it('should return first element for single embed', async () => {
      mockPipeline.mockClear();
      const vector = await embedder.embed('single');
      // embed internally calls embedBatch and takes [0]
      expect(mockPipeline).toHaveBeenCalledWith(['single'], {
        pooling: 'mean',
        normalize: true,
      });
      expect(vector.length).toBe(512);
    });

    it('should handle empty batch', async () => {
      mockPipeline.mockClear();
      const vectors = await embedder.embedBatch([]);
      expect(vectors).toEqual([]);
      expect(mockPipeline).toHaveBeenCalledWith([], {
        pooling: 'mean',
        normalize: true,
      });
    });
  });
});
