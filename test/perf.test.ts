import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Context } from '../src/index';
import { Embedder } from '../src/embedder';

const TEST_DIR = path.join(__dirname, '.test-tmp');
const NUM_FILES = 100;

describe('Context performance', () => {
  const perfTestDir = TEST_DIR + '-perf-test';

  afterAll(() => {
    if (fs.existsSync(perfTestDir)) {
      fs.rmSync(perfTestDir, { recursive: true, force: true });
    }
  });

  it('should load 100 random documents within acceptable time', async () => {
    // Create test fixtures directory
    const perfFixturesDir = path.join(__dirname, '.perf-test-fixtures');
    if (fs.existsSync(perfFixturesDir)) {
      fs.rmSync(perfFixturesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(perfFixturesDir, { recursive: true });

    try {
      // Generate 100 random markdown files with 5x longer content
      for (let i = 0; i < NUM_FILES; i++) {
        const content = `# Document ${i} - Performance Testing Content

This is random content number ${i}. This is a comprehensive performance test document
designed to simulate real-world usage patterns with substantial amounts of text content.
The document contains multiple paragraphs with various topics to ensure the embedding
and search operations are properly tested under realistic load conditions.

## Section 1: Introduction

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt
ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation
ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt
mollit anim id est laborum.

The quick brown fox jumps over the lazy dog. This is a classic pangram that contains
every letter of the English alphabet at least once. It is often used for testing
typewriters and computer keyboards. In the context of our performance testing, this
sample text serves as filler content to increase the document size and complexity.

## Section 2: Performance Considerations

Testing performance of loading ${i} documents into context requires careful consideration
of various factors. These include the computational overhead of embedding generation,
the I/O performance of reading files from disk, and the efficiency of vector storage
operations. Each of these components contributes to the overall execution time and
must be optimized for production use cases.

The keyword density for search optimization should be carefully calibrated. Too many
keywords can lead to overfitting and poor generalization, while too few can result
in suboptimal retrieval performance. Finding the right balance is crucial for building
effective semantic search systems.

## Section 3: Technical Details

Modern embedding models like BERT, Sentence Transformers, and other transformer-based
architectures provide high-quality semantic representations of text. These models
convert input text into dense vector representations that capture semantic meaning.
The dimensionality of these vectors typically ranges from 128 to 1024 dimensions,
depending on the specific model architecture and training objectives.

When performing similarity search, we typically use cosine similarity or Euclidean
distance to measure the semantic closeness between query and document vectors.
The search operation can be accelerated using various techniques including:
- Approximate Nearest Neighbor (ANN) algorithms
- Hierarchical Navigable Small World (HNSW) graphs
- Inverted File Index (IVF) with product quantization
- Locality-Sensitive Hashing (LSH)

## Section 4: Use Cases

Semantic search has numerous applications across different domains. In enterprise
settings, it enables employees to quickly find relevant documents, technical
specifications, and knowledge base articles. In e-commerce, it powers product
recommendations and visual search capabilities. In healthcare, it helps researchers
find relevant studies and clinical trial information.

The context system provides a flexible framework for building domain-specific search
applications. By supporting custom loaders, embedders, and rerankers, it can be
adapted to various content types and search requirements. The modular architecture
allows developers to swap out components as needed without major refactoring.

## Section 5: Optimization Strategies

Several optimization strategies can improve the performance of semantic search systems:

1. **Caching**: Pre-computed embeddings can be cached to avoid redundant computation.
2. **Batching**: Processing multiple documents in a batch improves throughput.
3. **Parallelization**: Using multiple CPU cores or GPU acceleration speeds up processing.
4. **Incremental Updates**: Only reprocessing changed documents reduces overhead.
5. **Compression**: Quantizing vectors reduces memory usage and improves cache efficiency.

## Section 6: Random Data Section

More random text here with keywords: performance, test, load, document, context.
Keyword density for search optimization ${Math.random().toString(36).substring(7)}.
Additional padding content to increase file size for more realistic testing scenarios.
The variety of content helps ensure the embedding model handles diverse text properly.
Each document should contain enough variation to simulate complex real-world data.

## Section 7: Additional Content

Here is some more filler content to further increase the document length and ensure
our performance tests are comprehensive. We want to make sure that the system
can handle not just small documents but also larger ones that contain significant
amounts of text. This is important for production systems that process diverse content.

The embedding process converts this text into numerical representations that capture
semantic meaning. Modern transformer models excel at this task because they have
been pre-trained on massive amounts of text data and can understand contextual
relationships between words and phrases. This deep understanding enables nuanced
semantic matching that goes beyond simple keyword search.

## Section 8: Conclusion

In conclusion, performance testing is a critical aspect of building robust search
systems. By simulating realistic workloads and measuring actual performance metrics,
we can identify bottlenecks and optimize accordingly. The test document serves
as a valuable tool for validating the system's ability to handle large-scale
content processing efficiently and effectively.

This concludes our comprehensive test document. The content has been expanded
to approximately five times the original length to provide a more realistic
benchmark for performance evaluation. The additional sections include various
types of content that simulate different document structures and complexities.

## Section 9: Final Notes

Additional paragraph to further increase document length. Understanding the
performance characteristics of your search system is essential for production
deployment. Consider monitoring key metrics like latency, throughput, and resource
utilization to ensure optimal user experience.

## Section 10: Extra Content

Even more content here. The random string for testing is: ${Math.random().toString(36).substring(7)}.
This helps add some variability to the content while keeping the document structure
consistent across all test files. Performance testing is an ongoing process that
should be integrated into the development workflow.
`;
        fs.writeFileSync(path.join(perfFixturesDir, `doc-${i}.md`), content);
      }

      const ctx = await Context.create({
        vectorsDir: perfTestDir,
      });

      // Measure load time
      const startTime = Date.now();
      await ctx.load('perf', path.join(perfFixturesDir, '*.md'));
      const endTime = Date.now();

      const loadTimeMs = endTime - startTime;
      console.log(`\nPerformance: Loaded ${NUM_FILES} documents in ${loadTimeMs}ms`);

      // Verify documents were loaded
      const results = await ctx.query('test', { library: 'perf', topK: 50 });
      expect(results.length).toBeGreaterThan(0);

      // Performance assertion: should load 100 docs in under 60 seconds
      // This is a reasonable expectation for local embeddings with longer content
      expect(loadTimeMs).toBeLessThan(60000);

      // Log detailed timing
      console.log(`Average time per document: ${(loadTimeMs / NUM_FILES).toFixed(2)}ms`);

      await ctx.close();
    } finally {
      // Cleanup fixtures
      if (fs.existsSync(perfFixturesDir)) {
        fs.rmSync(perfFixturesDir, { recursive: true, force: true });
      }
    }
  });
});

// ── Query Latency Benchmark ───────────────────────────────────────────────────

const BENCH_QUERIES = [
  'semantic search with vector embeddings',
  'how to optimize database queries',
  'machine learning model training techniques',
  'REST API authentication best practices',
  'CSS layout with flexbox and grid',
  'TypeScript generic types and interfaces',
  'git branching and merging workflow',
  'docker container deployment',
  'Python data analysis with pandas',
  'neural network backpropagation',
  'React hooks state management',
  'SQL join operations explained',
  'GraphQL schema and resolvers',
  'performance testing strategies',
  'error handling in async code',
  'unit testing with mocking',
  'CI/CD pipeline automation',
  'cloud storage and caching patterns',
  'WebSocket real-time communication',
  'code review best practices',
];

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function fmtMs(ms: number): string {
  return `${ms.toFixed(1)}ms`;
}

describe('Query Latency Benchmark', () => {
  const benchDir = path.join(__dirname, '.test-tmp-query-bench');
  const fixturesDir = path.join(benchDir, 'fixtures');

  afterAll(() => {
    if (fs.existsSync(benchDir)) {
      fs.rmSync(benchDir, { recursive: true, force: true });
    }
  });

  it('should report end-to-end query latency with phase breakdown', async () => {
    // ── 1. Create 20 varied documents ────────────────────────────────────────
    fs.mkdirSync(fixturesDir, { recursive: true });
    const topics = [
      ['vector-search', 'Vector search uses embeddings to find semantically similar documents. Approximate nearest neighbour algorithms like HNSW provide sub-linear lookup time by building a navigable graph over the vector space.'],
      ['database-opt', 'Database query optimisation involves choosing efficient join orderings, adding indexes on high-cardinality columns, and avoiding full-table scans. EXPLAIN ANALYSE reveals actual row counts and execution times.'],
      ['ml-training', 'Training a machine learning model requires a labelled dataset, a loss function, and an optimiser such as Adam or SGD. Early stopping prevents overfitting by halting when validation loss stops decreasing.'],
      ['rest-api', 'REST API design centres on stateless resources. Use HTTP verbs correctly: GET to read, POST to create, PUT/PATCH to update, DELETE to remove. Return standard status codes and consistent JSON envelopes.'],
      ['css-layout', 'CSS Flexbox arranges items along a single axis; Grid handles two-dimensional layouts. Use gap for spacing, align-items for cross-axis alignment, and justify-content for main-axis distribution.'],
      ['typescript', 'TypeScript generics let you write type-safe reusable code. Constrain type parameters with extends, use conditional types for branching, and mapped types to transform existing interfaces.'],
      ['git-workflow', 'Git branching strategies like trunk-based development keep integration friction low. Rebase to maintain a linear history, squash noisy commits, and use signed tags for releases.'],
      ['docker', 'Docker images are built from layered Dockerfiles. Multi-stage builds reduce final image size. Compose orchestrates multi-container applications; Kubernetes handles production scheduling.'],
      ['pandas', 'Pandas DataFrames offer vectorised operations over tabular data. Use groupby for aggregations, merge for joins, and query/eval for fast boolean filtering without Python loops.'],
      ['neural-net', 'Neural networks learn representations through gradient descent. Backpropagation computes gradients layer by layer via the chain rule. Batch normalisation and dropout regularise deep networks.'],
      ['react', 'React functional components use hooks for state and side effects. useState holds local state; useEffect triggers after renders; useCallback memoises handlers to avoid unnecessary re-renders.'],
      ['sql-joins', 'SQL INNER JOIN returns only matched rows. LEFT JOIN preserves all left-table rows. CROSS JOIN produces a Cartesian product. Properly indexed foreign keys make join execution fast.'],
      ['graphql', 'GraphQL schemas define types, queries, mutations, and subscriptions. Resolvers fetch data per field. DataLoader batches and caches resolver calls to prevent the N+1 problem.'],
      ['perf-test', 'Performance testing includes load tests (sustained traffic), stress tests (beyond capacity), and spike tests (sudden bursts). Track p50/p90/p99 latency and error rates as primary signals.'],
      ['async-errors', 'Handle async errors with try/catch around await expressions. Unhandled promise rejections crash Node.js processes. Use process.on(unhandledRejection) as a safety net alongside structured error boundaries.'],
      ['unit-testing', 'Unit tests verify individual functions in isolation using mocks for external dependencies. Aim for fast, deterministic tests. Test behaviour, not implementation details, to survive refactors.'],
      ['cicd', 'CI/CD pipelines automate build, test, and deploy steps on every commit. Cache dependencies between runs, parallelise test shards, and gate merges on passing checks and coverage thresholds.'],
      ['caching', 'Cache aside reads from cache first and falls back to the database on a miss. Write-through updates cache and storage together. Set TTLs proportional to data staleness tolerance.'],
      ['websocket', 'WebSockets provide full-duplex communication over a single TCP connection. The server pushes events without polling. Use heartbeat pings to detect stale connections and reconnect automatically.'],
      ['code-review', 'Effective code reviews focus on correctness, security, and maintainability. Keep pull requests small (< 400 lines). Automate style checks so reviewers focus on logic, not formatting.'],
    ];
    for (const [name, body] of topics) {
      fs.writeFileSync(path.join(fixturesDir, `${name}.md`), `# ${name}\n\n${body}\n`, 'utf-8');
    }

    // ── 2. Create context and load docs ──────────────────────────────────────
    const ctx = await Context.create({ vectorsDir: path.join(benchDir, 'store') });
    await ctx.load('bench', path.join(fixturesDir, '*.md'));

    // ── 3. Warm up (first query always slower due to JIT / cache cold-start) ─
    await ctx.query('warmup query', { library: 'bench', topK: 3, rerank: false });

    // ── 4. Measure: embed-only time ──────────────────────────────────────────
    const embedder = new Embedder();
    const embedTimes: number[] = [];
    for (const q of BENCH_QUERIES) {
      const t0 = performance.now();
      await embedder.embed(q);
      embedTimes.push(performance.now() - t0);
    }
    embedTimes.sort((a, b) => a - b);

    // ── 5. Measure: vector-only query (embed + ANN search) ───────────────────
    const vectorTimes: number[] = [];
    for (const q of BENCH_QUERIES) {
      const t0 = performance.now();
      await ctx.query(q, { library: 'bench', topK: 5, mode: 'vector', rerank: false });
      vectorTimes.push(performance.now() - t0);
    }
    vectorTimes.sort((a, b) => a - b);

    // ── 6. Measure: hybrid query (embed + ANN + FTS + RRF) ───────────────────
    const hybridTimes: number[] = [];
    for (const q of BENCH_QUERIES) {
      const t0 = performance.now();
      await ctx.query(q, { library: 'bench', topK: 5, mode: 'hybrid', rerank: false });
      hybridTimes.push(performance.now() - t0);
    }
    hybridTimes.sort((a, b) => a - b);

    // ── 7. Measure: hybrid + rerank ───────────────────────────────────────────
    const rerankTimes: number[] = [];
    for (const q of BENCH_QUERIES) {
      const t0 = performance.now();
      await ctx.query(q, { library: 'bench', topK: 5, mode: 'hybrid' });
      rerankTimes.push(performance.now() - t0);
    }
    rerankTimes.sort((a, b) => a - b);

    await ctx.close();

    // ── 8. Derive search-only time (hybrid total minus embed) ─────────────────
    const searchOnlyMean = mean(hybridTimes) - mean(embedTimes);

    // ── 9. Print results ──────────────────────────────────────────────────────
    const N = BENCH_QUERIES.length;
    console.log(`\n╔${'═'.repeat(66)}╗`);
    console.log(`║${'  Query Latency Benchmark  (n=' + N + ' queries, 20 docs)'.padEnd(66)}║`);
    console.log(`╠${'═'.repeat(14)}╦${'═'.repeat(12)}╦${'═'.repeat(12)}╦${'═'.repeat(12)}╦${'═'.repeat(12)}╣`);
    console.log(`║ ${'Stage'.padEnd(13)}║ ${'mean'.padEnd(11)}║ ${'p50'.padEnd(11)}║ ${'p90'.padEnd(11)}║ ${'p99'.padEnd(11)}║`);
    console.log(`╠${'═'.repeat(14)}╬${'═'.repeat(12)}╬${'═'.repeat(12)}╬${'═'.repeat(12)}╬${'═'.repeat(12)}╣`);

    const rows: [string, number[]][] = [
      ['embed only', embedTimes],
      ['vector query', vectorTimes],
      ['hybrid query', hybridTimes],
      ['hybrid+rerank', rerankTimes],
    ];
    for (const [label, times] of rows) {
      console.log(
        `║ ${label.padEnd(13)}║ ${fmtMs(mean(times)).padEnd(11)}║ ${fmtMs(percentile(times, 50)).padEnd(11)}║ ${fmtMs(percentile(times, 90)).padEnd(11)}║ ${fmtMs(percentile(times, 99)).padEnd(11)}║`,
      );
    }

    console.log(`╠${'═'.repeat(14)}╩${'═'.repeat(12)}╩${'═'.repeat(12)}╩${'═'.repeat(12)}╩${'═'.repeat(12)}╣`);
    console.log(`║ ${'search overhead (hybrid mean − embed mean): ' + fmtMs(searchOnlyMean) + '  QPS: ' + (1000 / mean(hybridTimes)).toFixed(1)}`.padEnd(67) + '║');
    console.log(`╚${'═'.repeat(66)}╝`);

    // ── 10. Assertions ────────────────────────────────────────────────────────
    // Embed p99 < 1 s (model is loaded; subsequent calls are inference-only)
    expect(percentile(embedTimes, 99)).toBeLessThan(1000);
    // Vector query p99 < 1.5 s
    expect(percentile(vectorTimes, 99)).toBeLessThan(1500);
    // Hybrid query p99 < 2 s
    expect(percentile(hybridTimes, 99)).toBeLessThan(2000);
  }, 120_000 /* 2 min — embeds 20 queries × 4 passes */);
});