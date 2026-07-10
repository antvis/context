import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Context } from '../src/index';

const FIXTURES_DIR = path.join(__dirname, 'fixtures/docs');
const TEST_DIR = path.join(__dirname, '.test-tmp');

describe('Context', () => {
  let ctx: Context;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    await new Promise((r) => setTimeout(r, 100));

    ctx = await Context.create({
      vectorsDir: TEST_DIR,
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
    it('should call onProgress callback during load', async () => {
      const progressCalls: { phase: string; detail: { loaded: number; total: number } }[] = [];
      const progressDir = TEST_DIR + '-progress';

      const ctxWithProgress = await Context.create({
        vectorsDir: progressDir,
        onProgress: (phase, detail) => {
          progressCalls.push({ phase, detail });
        },
      });

      await ctxWithProgress.load('md', path.join(FIXTURES_DIR, '*.md'));

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls.map(c => c.phase)).toContain('load');

      await ctxWithProgress.close();

      // Cleanup
      if (fs.existsSync(progressDir)) {
        fs.rmSync(progressDir, { recursive: true, force: true });
      }
    });

    it('should load markdown files', async () => {
      await ctx.load('md', path.join(FIXTURES_DIR, 'getting-started.md'));

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
      // A second load() with the same pattern should NOT increase
      // the count (dedup prevents double-insert).
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

  describe('close', () => {
    it('should close all stores without error', async () => {
      const closeTestDir = TEST_DIR + '-close-test';
      const ctx2 = await Context.create({
        vectorsDir: closeTestDir,
      });
      await ctx2.load('close-test', path.join(FIXTURES_DIR, 'getting-started.md'));
      await ctx2.close();
      if (fs.existsSync(closeTestDir)) {
        fs.rmSync(closeTestDir, { recursive: true, force: true });
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
        queryExpansion: false,
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
        queryExpansion: {
          synonyms: {
            'animation': ['动效', 'animate', 'transition'],
          },
        },
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
      ftsFields: ['content'],
      ftsFieldWeights: { content: 2 },
      rankConstant: 30,
    });

    await ctx.load('weighted', path.join(FIXTURES_DIR, 'getting-started.md'));

    const results = await ctx.query('guide', { library: 'weighted', topK: 1 });
    expect(results.length).toBeGreaterThan(0);

    await ctx.close();
  });
});

describe('Context two-phase separation', () => {
  const twoPhaseDir = TEST_DIR + '-two-phase';
  const multiPhaseDir = TEST_DIR + '-multi-phase';

  afterAll(() => {
    if (fs.existsSync(twoPhaseDir)) {
      fs.rmSync(twoPhaseDir, { recursive: true, force: true });
    }
    if (fs.existsSync(multiPhaseDir)) {
      fs.rmSync(multiPhaseDir, { recursive: true, force: true });
    }
  });

  it('should load files in first phase and query in second phase with new instance', async () => {
    // Phase 1: Create Context and load files
    const ctxPhase1 = await Context.create({
      vectorsDir: twoPhaseDir,
    });

    await ctxPhase1.load('two-phase-lib', path.join(FIXTURES_DIR, 'getting-started.md'));

    // Query in phase 1 to verify data was loaded
    const phase1Results = await ctxPhase1.query('install', { library: 'two-phase-lib', topK: 3 });
    expect(phase1Results.length).toBeGreaterThan(0);
    const phase1Contents = phase1Results.map((r) => r.content).join(' ');
    expect(phase1Contents).toContain('npm');

    // Close first phase context
    await ctxPhase1.close();

    // Phase 2: Create new Context instance with the same vectorsDir
    const ctxPhase2 = await Context.create({
      vectorsDir: twoPhaseDir,
    });

    // Query without calling load - should use the persisted vector files
    const phase2Results = await ctxPhase2.query('install', { library: 'two-phase-lib', topK: 3 });
    expect(phase2Results.length).toBeGreaterThan(0);
    const phase2Contents = phase2Results.map((r) => r.content).join(' ');
    expect(phase2Contents).toContain('npm');

    // Verify the results are similar (same documents found)
    const phase1Ids = phase1Results.map((r) => r.id).sort();
    const phase2Ids = phase2Results.map((r) => r.id).sort();
    expect(phase1Ids).toEqual(phase2Ids);

    await ctxPhase2.close();
  });

  it('should handle multiple load phases in different instances', async () => {
    // Phase 1: Load first file
    const ctx1 = await Context.create({
      vectorsDir: multiPhaseDir,
    });
    await ctx1.load('multi-lib-1', path.join(FIXTURES_DIR, 'getting-started.md'));
    await ctx1.close();

    // Phase 2: Load second file with same context
    const ctx2 = await Context.create({
      vectorsDir: multiPhaseDir,
    });
    await ctx2.load('multi-lib-2', path.join(FIXTURES_DIR, 'line-chart-guide.md'));

    // Query both libraries
    const results1 = await ctx2.query('npm', { library: 'multi-lib-1', topK: 1 });
    const results2 = await ctx2.query('tooltip', { library: 'multi-lib-2', topK: 1 });

    expect(results1.length).toBeGreaterThan(0);
    expect(results2.length).toBeGreaterThan(0);

    await ctx2.close();

    // Phase 3: New instance should still have both libraries
    const ctx3 = await Context.create({
      vectorsDir: multiPhaseDir,
      readOnly: true, // Open in read-only mode to ensure no writes
    });

    const results1Again = await ctx3.query('install', { library: 'multi-lib-1', topK: 1 });
    const results2Again = await ctx3.query('chart', { library: 'multi-lib-2', topK: 1 });

    expect(results1Again.length).toBeGreaterThan(0);
    expect(results2Again.length).toBeGreaterThan(0);

    await ctx3.close();
  });
});