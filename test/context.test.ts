import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Context } from '../src/index';

const FIXTURES_DIR = path.join(__dirname, 'fixtures/docs');
const TEST_DIR = path.join(__dirname, '.test-tmp');

describe('Context', () => {
  let ctx: Context;

  beforeAll(async () => {
    // 清理目录
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    await new Promise((r) => setTimeout(r, 100));

    // 创建全局 Context 实例
    ctx = await Context.create({ vectorsDir: TEST_DIR });
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 500));
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
      await ctx.load('md', path.join(FIXTURES_DIR, '*.md'));

      const results = await ctx.query('installation', { library: 'md', topK: 1 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('npm');
    });

    it('should load json files', async () => {
      await ctx.load('json', path.join(FIXTURES_DIR, '*.json'));

      const results = await ctx.query('user endpoint', { library: 'json', topK: 1 });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should preserve metadata from markdown', async () => {
      await ctx.load('meta', path.join(FIXTURES_DIR, '*.md'));

      const results = await ctx.query('guide', { library: 'meta', topK: 1 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].meta).toBeDefined();
      expect(results[0].meta).toHaveProperty('title');
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
  });
});