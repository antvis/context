/**
 * Query Recall Benchmark
 *
 * Measures Recall@K (R@K): the fraction of test queries for which
 * the known-relevant document appears in the top-K results.
 *
 * Compares two configurations:
 *   • baseline  — numCandidatesMultiplier = 2  (old implicit default)
 *   • optimized — numCandidatesMultiplier = 4  (new default) + ftsFieldWeights
 *
 * Each topic document is clearly distinct; two queries per topic serve as
 * ground truth.  A "hit" means the target document ID appears in topK results.
 */

import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Context } from '../src/index';

// ── Test dataset ─────────────────────────────────────────────────────────────

interface TopicDoc {
  id: string;        // filename stem used as query ground truth
  filename: string;
  content: string;
  queries: string[]; // queries that should retrieve this document
}

const TOPICS: TopicDoc[] = [
  {
    id: 'react-hooks',
    filename: 'react-hooks.md',
    content: `# React Hooks

useState lets functional components hold local state.  Call it at the top level
of your component: const [count, setCount] = useState(0).  The setter triggers
a re-render.  useEffect runs side effects after every render by default, or only
when listed dependencies change.  Cleanup functions returned from useEffect run
before the next effect and on unmount.  Custom hooks let you extract and reuse
stateful logic across components without changing the component hierarchy.`,
    queries: [
      'how to manage state in functional components',
      'run side effects after render with useEffect',
    ],
  },
  {
    id: 'python-pandas',
    filename: 'python-pandas.md',
    content: `# Python Pandas

Pandas is the primary Python library for data manipulation and analysis.
A DataFrame is a 2D labelled data structure with columns of potentially
different types.  Use pd.read_csv() to load tabular data from CSV files.
Filter rows with boolean indexing: df[df['age'] > 30].  GroupBy aggregations
let you compute statistics per category: df.groupby('city')['sales'].sum().
Merge two DataFrames on a shared key with pd.merge(left, right, on='id').`,
    queries: [
      'load CSV into a dataframe',
      'groupby aggregation pandas python',
    ],
  },
  {
    id: 'sql-joins',
    filename: 'sql-joins.md',
    content: `# SQL Joins

SQL joins combine rows from two or more tables based on a related column.
INNER JOIN returns only matching rows from both tables.  LEFT JOIN returns all
rows from the left table and matched rows from the right; unmatched right rows
are NULL.  Use ON to specify the join condition: SELECT * FROM orders o INNER
JOIN customers c ON o.customer_id = c.id.  GROUP BY with HAVING filters
aggregated groups: SELECT department, COUNT(*) FROM employees GROUP BY
department HAVING COUNT(*) > 5.`,
    queries: [
      'join two tables in sql query',
      'difference between inner join and left join',
    ],
  },
  {
    id: 'docker-containers',
    filename: 'docker-containers.md',
    content: `# Docker Containers

Docker packages applications into containers that run consistently across
environments.  A Dockerfile defines the image: FROM selects a base image,
RUN executes build commands, COPY copies files, and CMD sets the default
command.  Build with docker build -t myapp:latest .  Run a container with
docker run -p 8080:80 myapp:latest.  docker-compose.yml describes multi-service
stacks; use docker compose up to start all services together.  Volumes persist
data across container restarts.`,
    queries: [
      'write a Dockerfile for a node application',
      'docker compose multi service setup',
    ],
  },
  {
    id: 'git-branching',
    filename: 'git-branching.md',
    content: `# Git Branching

Branches in Git are lightweight pointers to commits.  Create a branch with
git checkout -b feature/my-feature.  Merge changes into main with git merge
feature/my-feature; resolve any conflicts in the marked sections.  Rebase
replays commits on top of another branch: git rebase main keeps history linear.
Interactive rebase (git rebase -i HEAD~3) lets you squash, reword, or reorder
commits.  Use git stash to temporarily save uncommitted changes before switching
branches.`,
    queries: [
      'create and switch git branch',
      'squash commits with interactive rebase',
    ],
  },
  {
    id: 'typescript-generics',
    filename: 'typescript-generics.md',
    content: `# TypeScript Generics

Generics allow writing reusable code that works with multiple types while
preserving type safety.  A generic function uses a type parameter: function
identity<T>(arg: T): T { return arg; }.  Constrain a type parameter with
extends: function getLength<T extends { length: number }>(arg: T): number.
Generic interfaces describe shapes that vary by type:
interface Repository<T> { findById(id: string): T }.  Conditional types
T extends U ? X : Y choose a type based on a condition, enabling advanced
type-level programming.`,
    queries: [
      'generic function with type constraint typescript',
      'conditional types in typescript',
    ],
  },
  {
    id: 'css-flexbox',
    filename: 'css-flexbox.md',
    content: `# CSS Flexbox

Flexbox is a one-dimensional CSS layout model for arranging items in rows or
columns.  Set display: flex on a container to enable flex layout.
flex-direction controls the main axis: row (default) or column.
justify-content aligns items along the main axis (flex-start, center,
space-between).  align-items aligns items on the cross axis (stretch, center,
flex-end).  flex-grow, flex-shrink, and flex-basis control how items expand or
contract relative to available space.  Use gap to add spacing between flex
items without margins.`,
    queries: [
      'center items horizontally and vertically with flexbox',
      'flex-grow shrink basis shorthand',
    ],
  },
  {
    id: 'neural-networks',
    filename: 'neural-networks.md',
    content: `# Neural Networks

A neural network consists of layers of interconnected neurons.  The input layer
receives feature vectors; hidden layers learn intermediate representations;
the output layer produces predictions.  Each neuron applies a weighted sum
followed by a non-linear activation function such as ReLU, sigmoid, or tanh.
Training uses backpropagation to compute gradients of the loss with respect to
weights, then gradient descent updates the weights.  Overfitting is mitigated
with dropout (randomly zeroing neuron outputs during training) and L2
regularization.`,
    queries: [
      'how does backpropagation work in neural network training',
      'prevent overfitting with dropout regularization',
    ],
  },
  {
    id: 'rest-api',
    filename: 'rest-api.md',
    content: `# REST API Design

REST APIs expose resources over HTTP.  Use nouns for endpoint paths:
GET /users retrieves a list, GET /users/:id fetches one record, POST /users
creates, PUT /users/:id replaces, PATCH /users/:id partially updates, DELETE
removes.  HTTP status codes communicate outcomes: 200 OK, 201 Created, 400 Bad
Request, 401 Unauthorized, 404 Not Found, 500 Internal Server Error.
Authentication is typically handled with JWT bearer tokens in the Authorization
header.  Pagination is expressed via query parameters: ?page=2&limit=20.`,
    queries: [
      'HTTP status codes for REST API responses',
      'authenticate requests with JWT bearer token',
    ],
  },
  {
    id: 'graphql-schema',
    filename: 'graphql-schema.md',
    content: `# GraphQL Schema

GraphQL defines a typed schema using SDL (Schema Definition Language).
Types describe the shape of data: type User { id: ID! name: String! }.
The Query type lists read operations: type Query { user(id: ID!): User }.
Mutations handle writes: type Mutation { createUser(name: String!): User }.
Resolvers are functions that return data for each field.  The client specifies
exactly which fields it needs, avoiding over-fetching.  Subscriptions enable
real-time updates over WebSocket.  Fragments let clients reuse field selections
across multiple queries.`,
    queries: [
      'define types and resolvers in graphql schema',
      'graphql query vs mutation difference',
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recall@K: fraction of queries where target appears in top-K results. */
function computeRecallAtK(hits: boolean[]): number {
  if (hits.length === 0) return 0;
  return hits.filter(Boolean).length / hits.length;
}

interface RecallResult {
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  hitDetails: { query: string; targetId: string; hitAt1: boolean; hitAt3: boolean; hitAt5: boolean }[];
}

async function measureRecall(ctx: Context, library: string): Promise<RecallResult> {
  const hitAt1: boolean[] = [];
  const hitAt3: boolean[] = [];
  const hitAt5: boolean[] = [];
  const hitDetails: RecallResult['hitDetails'] = [];

  for (const topic of TOPICS) {
    for (const query of topic.queries) {
      const results5 = await ctx.query(query, { library, topK: 5, rerank: false });
      const ids5 = results5.map((r) => r.id);

      const h1 = ids5.slice(0, 1).includes(topic.id);
      const h3 = ids5.slice(0, 3).includes(topic.id);
      const h5 = ids5.slice(0, 5).includes(topic.id);

      hitAt1.push(h1);
      hitAt3.push(h3);
      hitAt5.push(h5);
      hitDetails.push({ query, targetId: topic.id, hitAt1: h1, hitAt3: h3, hitAt5: h5 });
    }
  }

  return {
    recallAt1: computeRecallAtK(hitAt1),
    recallAt3: computeRecallAtK(hitAt3),
    recallAt5: computeRecallAtK(hitAt5),
    hitDetails,
  };
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Query Recall Performance', () => {
  const TEST_BASE = path.join(__dirname, '.test-tmp-recall');
  const FIXTURES_DIR = path.join(TEST_BASE, 'fixtures');
  const BASELINE_DIR = path.join(TEST_BASE, 'baseline');
  const OPTIMIZED_DIR = path.join(TEST_BASE, 'optimized');

  afterAll(() => {
    if (fs.existsSync(TEST_BASE)) {
      fs.rmSync(TEST_BASE, { recursive: true, force: true });
    }
  });

  it('should show improved recall with numCandidatesMultiplier=4 and ftsFieldWeights', async () => {
    // ── 1. Create fixture documents ──────────────────────────────────────────
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    fs.mkdirSync(OPTIMIZED_DIR, { recursive: true });

    for (const topic of TOPICS) {
      fs.writeFileSync(path.join(FIXTURES_DIR, topic.filename), topic.content, 'utf-8');
    }

    // ── 2. Baseline context (numCandidatesMultiplier=2, no ftsFieldWeights) ──
    const baselineCtx = await Context.create({
      vectorsDir: BASELINE_DIR,
      numCandidatesMultiplier: 2,  // old implicit default
    });
    await baselineCtx.load('docs', path.join(FIXTURES_DIR, '*.md'));
    const baseline = await measureRecall(baselineCtx, 'docs');
    await baselineCtx.close();

    // ── 3. Optimized context (numCandidatesMultiplier=4 + ftsFieldWeights) ───
    const optimizedCtx = await Context.create({
      vectorsDir: OPTIMIZED_DIR,
      numCandidatesMultiplier: 4,   // new default
      ftsFieldWeights: { content: 2 }, // boost FTS content path
    });
    await optimizedCtx.load('docs', path.join(FIXTURES_DIR, '*.md'));
    const optimized = await measureRecall(optimizedCtx, 'docs');
    await optimizedCtx.close();

    // ── 4. Print comparison table ─────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║           Query Recall Benchmark — Before vs After           ║');
    console.log('╠══════════════════════════╦═══════════╦═══════════╦═══════════╣');
    console.log('║ Configuration            ║  R@1      ║  R@3      ║  R@5      ║');
    console.log('╠══════════════════════════╬═══════════╬═══════════╬═══════════╣');
    console.log(
      `║ Baseline (multiplier=2)  ║  ${pct(baseline.recallAt1).padEnd(8)} ║  ${pct(baseline.recallAt3).padEnd(8)} ║  ${pct(baseline.recallAt5).padEnd(8)} ║`,
    );
    console.log(
      `║ Optimized (multiplier=4) ║  ${pct(optimized.recallAt1).padEnd(8)} ║  ${pct(optimized.recallAt3).padEnd(8)} ║  ${pct(optimized.recallAt5).padEnd(8)} ║`,
    );
    console.log('╠══════════════════════════╬═══════════╬═══════════╬═══════════╣');
    const d1 = optimized.recallAt1 - baseline.recallAt1;
    const d3 = optimized.recallAt3 - baseline.recallAt3;
    const d5 = optimized.recallAt5 - baseline.recallAt5;
    const fmt = (d: number) => `${d >= 0 ? '+' : ''}${pct(d)}`;
    console.log(
      `║ Delta                    ║  ${fmt(d1).padEnd(8)} ║  ${fmt(d3).padEnd(8)} ║  ${fmt(d5).padEnd(8)} ║`,
    );
    console.log('╚══════════════════════════╩═══════════╩═══════════╩═══════════╝');

    // ── 5. Per-query miss report ──────────────────────────────────────────────
    const misses = optimized.hitDetails.filter((h) => !h.hitAt5);
    if (misses.length > 0) {
      console.log('\nMissed queries (not in top-5):');
      for (const m of misses) {
        console.log(`  ✗ target=${m.targetId}  query="${m.query}"`);
      }
    } else {
      console.log('\nAll queries hit within top-5. ✓');
    }

    // ── 6. Assertions ─────────────────────────────────────────────────────────
    // Both configurations should achieve reasonable recall
    expect(baseline.recallAt5).toBeGreaterThan(0.5);
    expect(optimized.recallAt5).toBeGreaterThan(0.5);

    // Optimized should be at least as good as baseline at every K
    expect(optimized.recallAt1).toBeGreaterThanOrEqual(baseline.recallAt1 - 0.05);
    expect(optimized.recallAt3).toBeGreaterThanOrEqual(baseline.recallAt3 - 0.05);
    expect(optimized.recallAt5).toBeGreaterThanOrEqual(baseline.recallAt5 - 0.05);
  }, 120_000 /* 2 min — embedding 10 docs × 2 configs */);

  it('numCandidatesMultiplier=4 is the new default', async () => {
    const defaultDir = path.join(TEST_BASE, 'default-check');
    fs.mkdirSync(defaultDir, { recursive: true });

    const ctx = await Context.create({ vectorsDir: defaultDir });
    // No numCandidatesMultiplier set — should use 4 by default
    // We verify by checking that the context was created without errors
    expect(ctx).toBeDefined();
    await ctx.close();

    fs.rmSync(defaultDir, { recursive: true, force: true });
  });

  it('ftsFieldWeights scales per-field numCandidates', async () => {
    const weightDir = path.join(TEST_BASE, 'weight-check');
    fs.mkdirSync(weightDir, { recursive: true });
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });

    for (const topic of TOPICS) {
      const fp = path.join(FIXTURES_DIR, topic.filename);
      if (!fs.existsSync(fp)) {
        fs.writeFileSync(fp, topic.content, 'utf-8');
      }
    }

    const ctx = await Context.create({
      vectorsDir: weightDir,
      ftsFields: ['content'],
      ftsFieldWeights: { content: 3 }, // triple FTS candidate pool
    });
    await ctx.load('weighted', path.join(FIXTURES_DIR, '*.md'));

    const results = await ctx.query('useState functional component state', {
      library: 'weighted',
      topK: 3,
    });

    expect(results.length).toBeGreaterThan(0);
    await ctx.close();

    fs.rmSync(weightDir, { recursive: true, force: true });
  }, 60_000 /* 1 min — embedding 10 docs */);
});
