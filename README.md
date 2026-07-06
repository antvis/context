# @antv/context

A local context retrieval library that enables semantic search over your documentation. It loads documents (Markdown, JSON, Text), vectorizes them using [Transformers.js](https://huggingface.co/transformers.js), and stores vectors locally in `.zvec` files for fast semantic querying. 

> [!TIP]
> Based on this library, we provide an official context HTTP server similar to context7, used to provide AI code generation context services in MCP, Skill, and CLI, for free!


## Features

- 📄 **Multi-format Support**: Supports Markdown, JSON, Text, and other file formats
- 📚 **Multi-library Support**: Manage documents by library
- ⚡ **Auto-indexing**: Automatic vectorization on load with batch embedding for performance
- 🔍 **Hybrid Retrieval**: Combines vector similarity + FTS text matching via RRF fusion for better recall
- 🔄 **Deduplication**: Automatically skip already-loaded documents; content-hash change detection for re-embedding updated files
- ⚖️ **Weight Configuration**: Per-field FTS boost weights and RRF rank constant tuning
- 🛡️ **Clear Error Messages**: Throws descriptive errors when Transformers model is unavailable, guiding users to fix the issue
- 🔁 **Two-stage Reranking**: KeywordReranker boosts candidates with exact query term matches after coarse vector/hybrid search
- 🔁 **Two-stage Reranking**: KeywordReranker boosts candidates with exact query term matches after coarse vector/hybrid search
- 🌐 **Query Expansion**: SynonymExpander uses user-provided synonym maps to bridge CN↔EN terminology gaps
- 📊 **Progress Callback**: `onProgress` hook for monitoring load phases (load → embed → insert)
- 🏗️ **fromDir() Quick-start**: One-call setup from a project directory with auto-derived defaults


## Quick Start

```bash
npm install @antv/context
```

```typescript
import { Context } from '@antv/context';

// Standard creation — specify vectorsDir
const ctx = await Context.create({ vectorsDir: './vectors' });

// Quick-start from a project directory (auto-derives basePath & vectorsDir)
const ctx2 = await Context.fromDir('/path/to/project');

// Load documents into a specific library with automatic vectorization
await ctx.load('g2', './g2-docs/**/*.md');
await ctx.load('f2', './f2-docs/**/*.json');

// Query a single library (default: hybrid search + reranking)
const results = await ctx.query('How to configure a line chart', { library: 'g2', topK: 5 });
// => [{ content: '...', score: 0.92, scoreMode: 'reranked', id: 'g2-docs/line.md' }, ...]

// Query multiple libraries (array form)
const crossResults = await ctx.query('chart configuration', { library: ['g2', 'f2'], topK: 5 });

// Query all loaded libraries
const allResults = await ctx.query('visualization', { library: '*', topK: 10 });

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
| `library` | `string | string[]` | — | Library name(s). Single: `'g2'`, Multiple: `['g2', 'f2']`, All: `'*'`. Comma-separated `'g2,f2'` also supported. |
| `topK` | `number` | `5` | Number of results to return |

```typescript
// Semantic search — hybrid (vector + FTS) + reranking by default
const results = await ctx.query('sankey diagram', { library: 'g2', topK: 5 });

// Multiple libraries
const results = await ctx.query('chart', { library: ['g2', 'f2'], topK: 5 });

// All libraries
const results = await ctx.query('chart', { library: '*', topK: 5 });
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
| `library` | `string` | Which library this result came from |

### `ctx.untrack(library, id)`

Remove a document from a library's dedup registry. **Important**: zvec does not support single-document deletion, so vector data remains in the store. `untrack()` only removes the dedup entry — the actual vectors remain until you call `rebuild()`.

| Parameter | Type | Description |
|-----------|------|---------|
| `library` | `string` | Library name |
| `id` | `string` | Document ID to untrack from dedup tracking |

```typescript
await ctx.untrack('g2', 'abc123__getting_started');
```

### `ctx.rebuild(library, pattern)`

Rebuild a library's vector store from scratch. Deletes the existing `.zvec` store file, clears the dedup registry, and re-embeds all matching documents. Use this after `untrack()` to actually remove vectors.

| Parameter | Type | Description |
|-----------|------|---------|
| `library` | `string` | Library name to rebuild |
| `pattern` | `string | string[]` | Glob pattern(s) for re-loading documents |

```typescript
// Rebuild after untracking documents
await ctx.untrack('g2', 'abc123__getting_started');
await ctx.rebuild('g2', './g2-docs/**/*.md');
```

### `Context.fromDir(dir, options?)`

Quick-start convenience method — creates a Context from a project directory with auto-derived defaults (`basePath` = dir, `vectorsDir` = dir/.context/vectors).

| Parameter | Type | Description |
|-----------|------|---------|
| `dir` | `string` | Project directory path |
| `options` | `Partial<ContextOptions>` | Optional overrides for auto-derived defaults |

```typescript
const ctx = await Context.fromDir('/path/to/project');
// With custom overrides
const ctx = await Context.fromDir('/path/to/project', { ftsFieldWeights: { content: 2 } });
```

### `ctx.remove(library, id)` — **Deprecated**

> Use `untrack()` instead. This alias only removes the dedup tracking entry — vector data remains in the store.
> To physically remove data, call `untrack()` then `rebuild()`.

```typescript
// Deprecated — use untrack() + rebuild() instead
await ctx.remove('g2', 'abc123__getting_started');
```

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

### Module Structure

- **Public API**: `Context`, `QueryOptions`, `QueryResult`, `Document`, `Loader`, `MarkdownLoader`, `JsonLoader`, `TextLoader`, `pathToId`
- **Reranking**: `KeywordReranker`, `createReranker`, `Reranker`, `RerankCandidate`, `RerankResult`, `RerankOptions`
- **Query Expansion**: `SynonymExpander`, `NoopExpander`, `QueryExpander`, `QueryExpansionOptions`
- **Advanced API**: `Embedder`, `TransformersEmbedder`, `EmbedderManager`, `IZvecStore`, `MemoryZvecStore`, `ActualZvecStore`, `DocumentRegistry`, `Store`


## License

MIT