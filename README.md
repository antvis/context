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
- 🧩 **Document Chunking**: Split documents into semantic chunks (heading-aware for Markdown, fixed-size for plain text) for finer-grained retrieval
- 🔁 **Two-stage Reranking**: KeywordReranker boosts candidates with exact query term matches after coarse vector/hybrid search
- 🌐 **Query Expansion**: SynonymExpander uses user-provided synonym maps to bridge CN↔EN terminology gaps
- 📊 **Progress Callback**: `onProgress` hook for monitoring load phases (load → chunk → embed → insert)
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

// Query a single library (default: hybrid search = vector + FTS text)
const results = await ctx.query('How to configure a line chart', { library: 'g2', topK: 5 });
// => [{ content: '...', score: 0.92, scoreMode: 'hybrid', id: 'g2-docs/line.md', chunk: {...} }, ...]

// Query with two-stage reranking (pulls extra candidates, then re-scores)
const rerankedResults = await ctx.query('sankey diagram', { library: 'g2', topK: 5, rerank: { rerankFactor: 3 } });

// Query multiple libraries (array form)
const crossResults = await ctx.query('chart configuration', { library: ['g2', 'f2'], topK: 5 });

// Query all loaded libraries
const allResults = await ctx.query('visualization', { library: '*', topK: 10 });

// Pure vector search (skip FTS text path)
const vectorResults = await ctx.query('chart', { library: 'g2', topK: 5, mode: 'vector' });

// Filter results by field value
const filteredResults = await ctx.query('tooltip', { library: 'g2', topK: 5, filter: "parentDocId = 'abc123__getting_started'" });

// Expand a chunk result — retrieve neighboring chunks for context
const expanded = await ctx.expandChunk('g2', 'abc123__getting_started', { before: 1, after: 1 });

// Close when done (releases resources)
await ctx.close();
```


## API

### `Context.create(options)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `vectorsDir` | `string` | — | **Required**. Directory to store vector files |
| `basePath` | `string` | `process.cwd()` | Base path for resolving document IDs. Set for cross-machine consistent IDs. |
| `model` | `string` | auto | Transformers model name for embedding. Skipped when custom `embedder` is provided. |
| `loaders` | `Loader[]` | built-in | Custom loaders (default: MarkdownLoader, JsonLoader, TextLoader) |
| `embedder` | `Embedder` | auto-resolved | Custom embedder. Skips auto-resolution when provided. |
| `onProgress` | `(phase, detail) => void` | — | Progress callback for `load()` phases: `'load'` → `'chunk'` → `'embed'` → `'insert'`. |
| `chunking` | `ChunkingOptions | false` | `{ strategy: 'auto', maxChunkSize: 1024, chunkOverlap: 128 }` | Document chunking config. `false` disables chunking. |
| `queryExpansion` | `QueryExpansionOptions | false` | `false` (no-op) | Query expansion with user-provided synonym map. `false` disables. Without `synonyms`, expansion is a no-op. |
| `ftsFields` | `string[]` | `['content']` | Fields to index for Full Text Search in hybrid mode |
| `ftsFieldWeights` | `Record<string, number>` | `{ content: 1 }` | Per-field boost weights for FTS text path. Higher = more influence. |
| `tokenizer` | `'jieba' | 'standard' | 'auto'` | `'auto'` | FTS tokenizer. `jieba` for CN, `standard` for EN, `auto` picks safe default. |
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

#### Chunking Configuration Example

```typescript
const ctx = await Context.create({
  vectorsDir: './vectors',
  // Heading-aware chunking for Markdown, fixed-size for plain text
  chunking: { strategy: 'auto', maxChunkSize: 1024, chunkOverlap: 128 },
});

// Disable chunking — embed whole documents instead
const ctxWhole = await Context.create({
  vectorsDir: './vectors',
  chunking: false,
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

Load files into a specified library with automatic batch vectorization. Documents are split into semantic chunks (when chunking is enabled), embedded in batches, and inserted into the vector store. A content-hash change detection mechanism re-embeds files whose content has changed since the last load.

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
// Phases: 'load' → 'chunk' → 'embed' → 'insert'
```

### `ctx.query(text, options)`

Two-stage retrieval: coarse search (vector / hybrid) → optional reranking → final topK results.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `library` | `string | string[]` | — | Library name(s). Single: `'g2'`, Multiple: `['g2', 'f2']`, All: `'*'`. Comma-separated `'g2,f2'` also supported. |
| `topK` | `number` | `5` | Number of results to return |
| `mode` | `'hybrid' | 'vector'` | `'hybrid'` | Search mode. `'hybrid'` = vector + FTS text (better recall), `'vector'` = pure semantic search |
| `rerank` | `RerankOptions | false` | `false` | Reranking configuration. Pass an object `{ rerankFactor, minCandidates }` to enable, or `false` to skip |
| `filter` | `string` | — | Filter expression for zvec exact-match filtering, e.g. `"parentDocId = 'abc123'"` |

```typescript
// Hybrid search (default) — best recall for exact term matching
const results = await ctx.query('sankey diagram', { library: 'g2', topK: 5 });

// Hybrid search with reranking enabled — two-stage retrieval for precision
const results = await ctx.query('line chart config', {
  library: 'g2', topK: 5, rerank: { rerankFactor: 3, minCandidates: 10 }
});

// Pure vector search — when FTS is not needed
const results = await ctx.query('chart', { library: 'g2', topK: 5, mode: 'vector' });

// Filter by parent document — retrieve all chunks of a specific doc
const chunks = await ctx.query('tooltip', { library: 'g2', filter: "parentDocId = 'abc123'" });

// Multiple libraries
const results = await ctx.query('chart', { library: ['g2', 'f2'], topK: 5 });

// All libraries
const results = await ctx.query('chart', { library: '*', topK: 5 });
```

#### Query Result Fields

Each result includes:

| Field | Type | Description |
|------|------|-------------|
| `id` | `string` | Document / chunk ID |
| `content` | `string` | Document content |
| `score` | `number` | Similarity score (0–1) |
| `scoreMode` | `'vector' | 'hybrid' | 'reranked'` | How the score was computed |
| `meta` | `Record<string, unknown>` | Front-matter metadata (if present) |
| `chunk` | `ChunkMeta` | Chunk metadata (if chunking is enabled) |
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

### `ctx.expandChunk(library, parentDocId, options?)`

Expand a chunk result — retrieve neighboring chunks from the same parent document for context. Useful when a query returns a chunked fragment and you need surrounding context.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `library` | `string` | — | Library the chunk belongs to |
| `parentDocId` | `string` | — | Parent document ID (from `chunk.parentDocId`) |
| `before` | `number` | `1` | Number of preceding chunks |
| `after` | `number` | `1` | Number of following chunks |

```typescript
const expanded = await ctx.expandChunk('g2', 'abc123__getting_started', { before: 2, after: 2 });
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
const ctx = await Context.fromDir('/path/to/project', { model: 'custom-model' });
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
            |  Chunker        |                            v
            | (Markdown/Fixed)+--------+           +--------v--------+
            +--------+--------+        |           |    Embedder     |
                     |                  |           +--------+--------+
            +--------v--------+         |                    |
            |  EmbedBatch     |         |           +--------v--------+
            +--------+--------+         |           |   Vectorize     |
                     |                  |           +--------+--------+
            +--------v--------+         |                    |
            |      .zvec      |         +--------+-----------+
            +-----------------+                  |
                                               v
                                   +-----------+-----------+
                                   |                       |
                           +-------v-------+       +-------v-------+
                           | FTS Text Path  |       |  Vector Path  |
                           |(ftsFieldWeights|       |               |
                           |   tokenizer)   |       |               |
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
- **Chunking**: `MarkdownChunker`, `FixedSizeChunker`, `createChunker`, `ChunkingOptions`, `Chunk`, `Chunker`
- **Reranking**: `KeywordReranker`, `createReranker`, `Reranker`, `RerankCandidate`, `RerankResult`, `RerankOptions`
- **Query Expansion**: `SynonymExpander`, `NoopExpander`, `QueryExpander`, `QueryExpansionOptions`
- **Advanced API**: `Embedder`, `TransformersEmbedder`, `EmbedderManager`, `IZvecStore`, `MemoryZvecStore`, `ActualZvecStore`, `DocumentRegistry`, `StoreManager`


## License

MIT