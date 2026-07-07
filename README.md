# @antv/context

A local context retrieval library that enables semantic search over your documentation. It loads documents (Markdown, JSON, Text), vectorizes them using [Transformers.js](https://huggingface.co/transformers.js), and stores vectors locally in `.zvec` files for fast semantic querying. 

> [!TIP]
> Based on this library, we provide an official context HTTP server similar to context7, used to provide AI code generation context services in MCP, Skill, and CLI, for free!


## Features

- 📄 **Multi-format Support**: Markdown, JSON, Text 文档自动加载与向量化
- 🔍 **Hybrid Retrieval**: 向量语义 + FTS 全文检索双路召回，RRF 融合排序
- 🔁 **Two-stage Reranking**: KeywordReranker 精排，关键词命中优先
- 🌐 **Query Expansion**: 用户自定义同义词表，CN↔EN 跨语言召回增强


## Quick Start

```bash
npm install @antv/context
```

```typescript
import { Context } from '@antv/context';

// Standard creation — specify vectorsDir
const ctx = await Context.create({ vectorsDir: './vectors' });

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
| `vectorsDir` | `string` | — | **Required**. Directory to store vector files |
| `basePath` | `string` | `process.cwd()` | Base path for resolving document IDs. Set for cross-machine consistent IDs. |
| `onProgress` | `(phase, detail) => void` | — | Progress callback for `load()` phases: `'load'` → `'embed'` → `'insert'`. |
| `queryExpansion` | `QueryExpansionOptions | false` | `false` (no-op) | Query expansion with user-provided synonym map. `false` disables. Without `synonyms`, expansion is a no-op. |
| `ftsFields` | `string[]` | `['content']` | Fields to index for Full Text Search in hybrid mode |
| `ftsFieldWeights` | `Record<string, number>` | `{ content: 1 }` | Per-field boost weights for FTS text path. Higher = more influence. |
| `rankConstant` | `number` | `60` | RRF rank constant for hybrid search fusion. Lower = "winner-takes-all", higher = more even. |

#### Weight Configuration Example

```typescript
const ctx = await Context.create({
  vectorsDir: './vectors',
  // Boost title matches 3x over content matches
  ftsFieldWeights: { content: 1, title: 3 },
  // More "winner-takes-all" ranking
  rankConstant: 20,
});
```

#### Query Expansion Configuration Example

```typescript
const ctx = await Context.create({
  vectorsDir: './vectors',
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
  vectorsDir: './vectors',
  queryExpansion: false,
});
```

### `ctx.load(library, pattern)`

Load files into a specified library with automatic batch vectorization. Documents are embedded in batches and inserted into the vector store. A content-hash change detection mechanism re-embeds files whose content has changed since the last load.

Document IDs are derived from file paths relative to `basePath` for cross-machine consistency.

| Parameter | Type | Description |
|-----------|------|-------------|
| `library` | `string` | Library name for organizing documents |
| `pattern` | `string | string[]` | Glob pattern(s) matching files to load |

```typescript
await ctx.load('g2', './docs/**/*.md');
await ctx.load('g2', ['./docs/**/*.md', './docs/**/*.json']);
```

Load phases emit progress via the `onProgress` callback:

```typescript
const ctx = await Context.create({
  vectorsDir: './vectors',
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
| `scoreMode` | `'vector' | 'hybrid' | 'reranked'` | How the score was computed |
| `meta` | `Record<string, unknown>` | Front-matter metadata (if present) |
| `sourceFilePath` | `string` | Original file path relative to `basePath` |


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
                      v                                   v
            +-----------------+                   +-----------------+
            |   FileLoader    |                   | QueryExpander   |
            +--------+--------+                   | (SynonymExpander)|
                     |                            +--------+--------+
            +--------v--------+                            |
            |  EmbedBatch     |                            v
            +--------+--------+                   +--------v--------+
                     |                            |    Embedder     |
            +--------v--------+                   +--------+--------+
            |      .zvec      |                            |
            +-----------------+                   +--------v--------+
                                                  |   Vectorize     |
                                                  +--------+--------+
                                                           |
                                                  +--------+-----------+
                                                           |
                                               +-----------v-----------+
                                               |                       |
                                       +-------v-------+       +-------v-------+
                                       | FTS Text Path  |       |  Vector Path  |
                                       |(ftsFieldWeights|       |               |
                                       +-------+-------+       +-------+-------+
                                               |                       |
                                               +-----------+-----------+
                                                           |
                                               +-----------v-----------+
                                               |    RRF Fusion          |
                                               |   (rankConstant)       |
                                               +-----------+-----------+
                                                           |
                                               +-----------v-----------+
                                               |   KeywordReranker      |
                                               |  (optional, 2nd stage) |
                                               +-----------+-----------+
                                               |
                                         Query Result

+------------------------------------------------------------------------+
```

## License

MIT