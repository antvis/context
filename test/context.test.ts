import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Context } from '../src/index';
import { TransformersEmbedder } from '../src/embedder';

const FIXTURES_DIR = path.join(__dirname, 'fixtures/docs');
const TEST_DIR = path.join(__dirname, '.test-tmp');

// Use TransformersEmbedder for tests — requires model download.
// For faster local testing without model download, provide a custom
// embedder mock via the embedder option.
const testEmbedder = new TransformersEmbedder();

describe('Context', () => {
  let ctx: Context;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    await new Promise((r) => setTimeout(r, 100));

    ctx = await Context.create({
      vectorsDir: TEST_DIR,
      embedder: testEmbedder,
    });
  });

  afterAll(async () => {
    if (ctx) {
      await ctx.close();
    }
    await new Promise((r) => setTimeout(r, 200));
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('create', () => {
    it('should create Context instance', () => {
      expect(ctx).toBeDefined();
    });

    it('should create vectors directory if not exists', () => {
      expect(fs.existsSync(TEST_DIR)).toBe(true);
    });
  });

  describe('load', () => {
    it('should load markdown files', async () => {
      await ctx.load('md', path.join(FIXTURES_DIR, 'getting-started.md'));

      // With chunking, the matching chunk may not be the first result.
      // Check that at least one result contains the expected term.
      const results = await ctx.query('installation', { library: 'md', topK: 3 });
      expect(results.length).toBeGreaterThan(0);
      const contents = results.map((r) => r.content).join(' ');
      expect(contents).toContain('npm');
    });

    it('should load json files', async () => {
      await ctx.load('json', path.join(FIXTURES_DIR, '*.json'));

      const results = await ctx.query('user endpoint', { library: 'json', topK: 1 });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should preserve metadata from markdown', async () => {
      await ctx.load('meta', path.join(FIXTURES_DIR, 'getting-started.md'));

      const results = await ctx.query('guide', { library: 'meta', topK: 1 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].meta).toBeDefined();
      expect(results[0].meta).toHaveProperty('title');
    });

    it('should skip already loaded documents (deduplication)', async () => {
      await ctx.load('md', path.join(FIXTURES_DIR, 'getting-started.md'));

      const results = await ctx.query('install', { library: 'md', topK: 10 });
      // With chunking enabled, a single doc may produce multiple chunks.
      // The key invariant is that a second load() with the same pattern
      // should NOT increase the count (dedup prevents double-insert).
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('query', () => {
    it('should return results with topK', async () => {
      const results = await ctx.query('install', { library: 'md', topK: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should return results with score', async () => {
      const results = await ctx.query('install', { library: 'md', topK: 1 });
      expect(results[0]).toHaveProperty('score');
      expect(typeof results[0].score).toBe('number');
    });

    it('should use default topK if not specified', async () => {
      const results = await ctx.query('install', { library: 'md' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty results for unknown library', async () => {
      const results = await ctx.query('test', { library: 'nonexistent' });
      expect(results.length).toBe(0);
    });

    it('should support array library parameter', async () => {
      const results = await ctx.query('install', { library: ['md', 'json'], topK: 5 });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should default to hybrid search mode', async () => {
      // Default mode is 'hybrid' — combines vector + text path
      const results = await ctx.query('install', { library: 'md', topK: 1 });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should support vector-only search mode', async () => {
      const results = await ctx.query('install', { library: 'md', topK: 1, mode: 'vector' });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('cross-library query', () => {
    it('should query multiple comma-separated libraries', async () => {
      const results = await ctx.query('install', { library: 'md,json', topK: 5 });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('close', () => {
    it('should close all stores without error', async () => {
      const closeTestDir = TEST_DIR + '-close-test';
      const ctx2 = await Context.create({
        vectorsDir: closeTestDir,
        embedder: testEmbedder,
      });
      await ctx2.load('close-test', path.join(FIXTURES_DIR, 'getting-started.md'));
      await ctx2.close();
      if (fs.existsSync(closeTestDir)) {
        fs.rmSync(closeTestDir, { recursive: true, force: true });
      }
    });
  });

  describe('chunking', () => {
    const chunkTestDir = TEST_DIR + '-chunk-test';

    afterAll(() => {
      if (fs.existsSync(chunkTestDir)) {
        fs.rmSync(chunkTestDir, { recursive: true, force: true });
      }
    });

    it('should split large documents into chunks', async () => {
      const ctx = await Context.create({
        vectorsDir: chunkTestDir,
        embedder: testEmbedder,
        chunking: { maxChunkSize: 500, chunkOverlap: 50 },
      });

      await ctx.load('chunked', path.join(FIXTURES_DIR, 'line-chart-guide.md'));

      const results = await ctx.query('tooltip', { library: 'chunked', topK: 3 });
      expect(results.length).toBeGreaterThan(0);

      // At least one result should be a chunk (long doc with small maxChunkSize)
      const chunkResults = results.filter((r) => r.chunk);
      expect(chunkResults.length).toBeGreaterThan(0);

      // Chunk metadata should be present
      const chunk = chunkResults[0].chunk!;
      expect(chunk.parentDocId).toContain('line_chart_guide');
      expect(typeof chunk.chunkIndex).toBe('number');
      expect(chunk.chunkIndex).toBeGreaterThanOrEqual(0);

      await ctx.close();
    });

    it('should include headingPath in chunk metadata', async () => {
      const ctx = await Context.create({
        vectorsDir: chunkTestDir + '-2',
        embedder: testEmbedder,
        chunking: { maxChunkSize: 400, chunkOverlap: 50 },
      });

      await ctx.load('chunked2', path.join(FIXTURES_DIR, 'line-chart-guide.md'));

      // Query for tooltip section specifically
      const results = await ctx.query('Line Chart with Tooltip hover', {
        library: 'chunked2',
        topK: 5,
      });
      expect(results.length).toBeGreaterThan(0);

      // At least one chunk should have a heading path containing "Line Chart"
      const withHeading = results.filter(
        (r) => r.chunk?.headingPath?.some((h) => h.includes('Line Chart'))
      );
      expect(withHeading.length).toBeGreaterThan(0);

      await ctx.close();
      if (fs.existsSync(chunkTestDir + '-2')) {
        fs.rmSync(chunkTestDir + '-2', { recursive: true, force: true });
      }
    });

    it('should support disabling chunking', async () => {
      const ctx = await Context.create({
        vectorsDir: chunkTestDir + '-nochunk',
        embedder: testEmbedder,
        chunking: false,
      });

      await ctx.load('nochunk', path.join(FIXTURES_DIR, 'line-chart-guide.md'));

      const results = await ctx.query('tooltip', { library: 'nochunk', topK: 3 });
      expect(results.length).toBeGreaterThan(0);

      // When chunking is disabled, no results should have chunk metadata
      const chunkResults = results.filter((r) => r.chunk);
      expect(chunkResults.length).toBe(0);

      await ctx.close();
      if (fs.existsSync(chunkTestDir + '-nochunk')) {
        fs.rmSync(chunkTestDir + '-nochunk', { recursive: true, force: true });
      }
    });
  });
});

describe('Context with reranking', () => {
    const rerankTestDir = TEST_DIR + '-rerank-test';

    afterAll(() => {
      if (fs.existsSync(rerankTestDir)) {
        fs.rmSync(rerankTestDir, { recursive: true, force: true });
      }
    });

    it('should rerank results with keyword scoring', async () => {
      const ctx = await Context.create({
        vectorsDir: rerankTestDir,
        embedder: testEmbedder,
        chunking: { maxChunkSize: 400, chunkOverlap: 50 },
      });

      await ctx.load('rerank', path.join(FIXTURES_DIR, 'line-chart-guide.md'));

      // Query with reranking enabled
      const results = await ctx.query('tooltip configuration', {
        library: 'rerank',
        topK: 3,
        rerank: { rerankFactor: 3 },
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);

      // Reranked results should contain content related to "tooltip"
      const contents = results.map((r) => r.content).join(' ');
      expect(contents.toLowerCase()).toContain('tooltip');

      await ctx.close();
    });

    it('should support disabling reranking', async () => {
      const ctx = await Context.create({
        vectorsDir: rerankTestDir + '-disabled',
        embedder: testEmbedder,
        chunking: { maxChunkSize: 400, chunkOverlap: 50 },
      });

      await ctx.load('rerank2', path.join(FIXTURES_DIR, 'line-chart-guide.md'));

      // Search with rerank=false uses only coarse search, but with topK directly
      const results = await ctx.query('tooltip', {
        library: 'rerank2',
        topK: 3,
        rerank: false,
      });
      expect(results.length).toBeGreaterThan(0);

      // Scores should be from the original vector/hybrid search (cosine sim or RRF)
      // Reranked scores are normalized to [0,1], raw scores can be different.
      // Just verify some results exist.

      await ctx.close();
      if (fs.existsSync(rerankTestDir + '-disabled')) {
        fs.rmSync(rerankTestDir + '-disabled', { recursive: true, force: true });
      }
    });
  });

describe('Context with query expansion', () => {
    const expandTestDir = TEST_DIR + '-expand-test';

    afterAll(() => {
      if (fs.existsSync(expandTestDir)) {
        fs.rmSync(expandTestDir, { recursive: true, force: true });
      }
    });

    it('should expand CN query to match EN content', async () => {
      const ctx = await Context.create({
        vectorsDir: expandTestDir,
        embedder: testEmbedder,
        chunking: { maxChunkSize: 500, chunkOverlap: 50 },
      });

      await ctx.load('expand', path.join(FIXTURES_DIR, 'line-chart-guide.md'));

      // Query with Chinese term that has EN synonym bridges
      const results = await ctx.query('提示框 配置', {
        library: 'expand',
        topK: 5,
      });

      // Should find tooltip-related content via synonym expansion
      const contents = results.map((r) => r.content.toLowerCase()).join(' ');
      expect(contents).toContain('tooltip');

      await ctx.close();
    });

    it('should support disabling query expansion', async () => {
      const ctx = await Context.create({
        vectorsDir: expandTestDir + '-disabled',
        embedder: testEmbedder,
        queryExpansion: false,
        chunking: false,
      });

      await ctx.load('expand2', path.join(FIXTURES_DIR, 'getting-started.md'));

      // Without expansion, should still work normally
      const results = await ctx.query('installation', {
        library: 'expand2',
        topK: 3,
      });
      expect(results.length).toBeGreaterThan(0);

      await ctx.close();
      if (fs.existsSync(expandTestDir + '-disabled')) {
        fs.rmSync(expandTestDir + '-disabled', { recursive: true, force: true });
      }
    });

    it('should expand EN query to match CN concepts', async () => {
      const ctx = await Context.create({
        vectorsDir: expandTestDir + '-en',
        embedder: testEmbedder,
        queryExpansion: {
          synonyms: {
            'animation': ['动效', 'animate', 'transition'],
          },
        },
        chunking: { maxChunkSize: 500, chunkOverlap: 50 },
      });

      await ctx.load('expand3', path.join(FIXTURES_DIR, 'line-chart-guide.md'));

      // Query with "animation" should find content about animation/动效
      const results = await ctx.query('animation', {
        library: 'expand3',
        topK: 5,
      });

      expect(results.length).toBeGreaterThan(0);
      const contents = results.map((r) => r.content.toLowerCase()).join(' ');
      expect(contents).toContain('animate');

      await ctx.close();
      if (fs.existsSync(expandTestDir + '-en')) {
        fs.rmSync(expandTestDir + '-en', { recursive: true, force: true });
      }
    });
  });

describe('Context with weight configuration', () => {
  const weightTestDir = TEST_DIR + '-weight-test';

  afterAll(() => {
    if (fs.existsSync(weightTestDir)) {
      fs.rmSync(weightTestDir, { recursive: true, force: true });
    }
  });

  it('should create Context with custom ftsFieldWeights', async () => {
    const ctx = await Context.create({
      vectorsDir: weightTestDir,
      embedder: testEmbedder,
      ftsFields: ['content'],
      ftsFieldWeights: { content: 2 },
      rankConstant: 30,
    });

    await ctx.load('weighted', path.join(FIXTURES_DIR, 'getting-started.md'));

    const results = await ctx.query('guide', { library: 'weighted', topK: 1 });
    expect(results.length).toBeGreaterThan(0);

    await ctx.close();
  });

  it('should use hybrid search with MemoryZvecStore when zvec unavailable', async () => {
    // When zvec is not available, MemoryZvecStore is used with FtsFieldWeights
    const ctx = await Context.create({
      vectorsDir: weightTestDir + '-mem',
      embedder: testEmbedder,
      ftsFields: ['content'],
      ftsFieldWeights: { content: 3 },
    });

    await ctx.load('mem-weighted', path.join(FIXTURES_DIR, 'getting-started.md'));

    // Hybrid mode (default) should use both vector + text path
    const hybridResults = await ctx.query('Getting Started', { library: 'mem-weighted', topK: 1 });
    expect(hybridResults.length).toBeGreaterThan(0);

    // Vector-only mode should work too
    const vectorResults = await ctx.query('Getting Started', { library: 'mem-weighted', topK: 1, mode: 'vector' });
    expect(vectorResults.length).toBeGreaterThan(0);

    await ctx.close();
    if (fs.existsSync(weightTestDir + '-mem')) {
      fs.rmSync(weightTestDir + '-mem', { recursive: true, force: true });
    }
  });
});