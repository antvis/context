# @antv/context

[![Build](https://github.com/antvis/context/actions/workflows/build.yml/badge.svg)](https://github.com/antvis/context/actions/workflows/build.yml)
[![npm version](https://img.shields.io/npm/v/@antv/context)](https://www.npmjs.com/package/@antv/context)
[![npm downloads](https://img.shields.io/npm/dm/@antv/context)](https://www.npmjs.com/package/@antv/context)
[![License](https://img.shields.io/npm/l/@antv/context)](./LICENSE)

A local context retrieval library that enables semantic search over your documentation. It loads documents (Markdown, JSON, Text), vectorizes them using [Transformers.js](https://huggingface.co/transformers.js), and stores vectors locally in `.zvec` files for fast semantic querying. 

> [!TIP]
> Based on this library, we provide an official context HTTP server similar to context7, used to provide AI code generation context services in MCP, Skill, and CLI, for free!


## Features

- **Multi-format Loading**: Automatic parsing and vectorization of Markdown, JSON, and plain text files
- **Hybrid Search**: Combines semantic vectors with full-text search using RRF fusion for better recall
- **Two-stage Ranking**: Coarse vector search followed by keyword-based reranking for precision
- **Query Expansion**: Extends queries with user-defined synonym maps for cross-language and domain-specific matching


## Quick Start

```bash
npm install @antv/context
```

> [!TIP]
> If you encounter model download timeout when first creating a Context, set the environment variable:
> ```bash
> HF_ENDPOINT=https://hf-mirror.com node your-script.js
> ```

```typescript
import { Context } from '@antv/context';

// Create context (vectorsDir is optional, defaults to .context/vectors)
const ctx = await Context.create();

// Load documents into a specific library with automatic vectorization
await ctx.load('g2', './g2-docs/**/*.md');
await ctx.load('f2', './f2-docs/**/*.json');

// Query a library (default: hybrid search + reranking)
const results = await ctx.query('How to configure a line chart', { library: 'g2', topK: 5 });
// => [{ content: '...', score: 0.92, scoreMode: 'reranked', id: 'g2-docs/line.md' }, ...]

// Close when done (releases resources)
await ctx.close();
```


## API

### `Context.create(options)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `vectorsDir` | `string` | `.context/vectors` | Directory to store vector files |
| `readOnly` | `boolean` | `false` | Open existing `.zvec` files only. In read-only mode, missing libraries are not created and `load()`/writes throw. |
| `basePath` | `string` | `process.cwd()` | Base path for resolving document IDs. Set for cross-machine consistent IDs. |
| `onProgress` | `(phase, detail) => void` | — | Progress callback for `load()` phases: `'load'` → `'embed'` → `'insert'`. |
| queryExpansion | QueryExpansionOptions | false | false  | Query expansion with user-provided synonym map. false disables. Without synonyms, expansion is a no-op. |
| `ftsFields` | `string[]` | `['content']` | Fields to index for Full Text Search in hybrid mode |
| `ftsFieldWeights` | `Record<string, number>` | `{ content: 1 }` | Per-field boost weights for FTS text path. Higher = more influence. |
| `rankConstant` | `number` | `60` | RRF rank constant for hybrid search fusion. Lower = "winner-takes-all", higher = more even. |

#### Weight Configuration Example

```typescript
const ctx = await Context.create({
  vectorsDir: '.context/vectors',
  // Boost title matches 3x over content matches
  ftsFieldWeights: { content: 1, title: 3 },
  // More "winner-takes-all" ranking
  rankConstant: 20,
});
```

#### Query Expansion Configuration Example

```typescript
const ctx = await Context.create({
  vectorsDir: '.context/vectors',
  // Define your own CN↔EN synonym bridges (no built-in defaults)
  queryExpansion: {
    synonyms: {
      '折线图': ['line chart', '折线'],
      '雷达图': ['radar chart', '蜘蛛图'],
      'tooltip': ['提示框', 'hover', '悬浮'],
    },
  },
});

// Disable query expansion entirely
const ctxNoExpand = await Context.create({
  vectorsDir: '.context/vectors',
  queryExpansion: false,
});
```

#### Read-only zvec Example

Use `readOnly: true` when `.zvec` files are prepared elsewhere and the current
process should only query them:

```typescript
const ctx = await Context.create({
  vectorsDir: '.context/vectors',
  readOnly: true,
});

const results = await ctx.query('How to configure a line chart', { library: 'g2' });
```

In read-only mode, `Context` opens existing `${library}.zvec` files with
`ZVecOpen`. It does not create missing stores, and `load()` will throw because
it would mutate the zvec file.

### `ctx.load(library, pattern)`

Load files into a specified library with automatic batch vectorization. Documents are embedded in batches and inserted into the vector store. A content-hash change detection mechanism re-embeds files whose content has changed since the last load.

Document IDs are derived from file paths relative to `basePath` for cross-machine consistency.

| Parameter | Type | Description |
|-----------|------|-------------|
| `library` | `string` | Library name for organizing documents |
| `pattern` | `string \| string[]` | Glob pattern(s) matching files to load |

```typescript
await ctx.load('g2', './docs/**/*.md');
await ctx.load('g2', ['./docs/**/*.md', './docs/**/*.json']);
```

Load phases emit progress via the `onProgress` callback:

```typescript
const ctx = await Context.create({
  vectorsDir: '.context/vectors',
  onProgress: (phase, detail) => {
    console.log(`${phase}: ${detail.loaded}/${detail.total}`);
  },
});
// Phases: 'load' → 'embed' → 'insert'
```

### `ctx.query(text, options)`

Two-stage retrieval: coarse search (vector / hybrid) → reranking → final topK results.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `library` | `string` | — | Library name to query. |
| `topK` | `number` | `5` | Number of results to return |

```typescript
// Semantic search — hybrid (vector + FTS) + reranking by default
const results = await ctx.query('sankey diagram', { library: 'g2', topK: 5 });
```

#### Query Result Fields

Each result includes:

| Field | Type | Description |
|------|------|-------------|
| `id` | `string` | Document ID |
| `content` | `string` | Document content |
| `score` | `number` | Similarity score (0–1) |
| `meta` | `Record<string, unknown>` | Front-matter metadata (if present) |
| `path` | `string` | Original file path relative to `basePath` |


### `ctx.close()`

Close all stores and release resources. Call this when you are done using the Context instance.

```typescript
await ctx.close();
```


## Architecture

```
+------------------------------------------------------------------------+
|                              @antv/context                             |
+------------------------------------------------------------------------+

  LOAD PHASE                                        QUERY PHASE
  ----------                                        ----------

  +----------+   +----------+   +----------+         +----------+
  | markdown |   |   json   |   |   text   |         |  Query   |
  +----+-----+   +----+-----+   +----+-----+         +----+-----+
       |              |              |                    |
       +--------------+--------------+                    |
                      |                                   |
            +---------v-------+                   +-------v----------+
            |   FileLoader    |                   | QueryExpander    |
            +--------+--------+                   | (SynonymExpander)|
                     |                            +--------+---------+
            +--------v--------+                            |
            |  EmbedBatch     |                            |
            +--------+--------+                   +--------v--------+
                     |                            |    Embedder     |
            +--------v--------+                   +--------+--------+
            |      .zvec      |                            |
            +-----------------+                   +--------v--------+
                                                  |   Vectorize     |
                                                  +--------+--------+
                                                           |
                                               +-----------v-----------+
                                               |                       |
                                       +-------v--------+       +-------v-------+
                                       | FTS Text Path  |       |  Vector Path  |
                                       |                |       |               |
                                       +-------+--------+       +-------+-------+
                                               |                       |
                                               +-----------+-----------+
                                                           |
                                               +-----------v-----------+
                                               |    RRF Fusion         |
                                               |   (rankConstant)      |
                                               +-----------+-----------+
                                                           |
                                               +-----------v------------+
                                               |   KeywordReranker      |
                                               |  (optional, 2nd stage) |
                                               +-----------+------------+
                                               |
                                               v
                                         Query Result

+------------------------------------------------------------------------+
```

## License

MIT
