# @antv/context

A local context retrieval library that enables semantic search over your documentation. It loads documents (Markdown, JSON, Text), vectorizes them using [Transformers.js](https://huggingface.co/transformers.js), and stores vectors locally in `.zvec` files for fast semantic querying. 

> [!TIP]
> Base it, We provide an official context HTTP server simlar with context7, used to provide AI code generation context services in MCP, Skill, and CLI, for free!


## Features

- 📄 **Multi-format Support**: Supports Markdown, JSON, Text, and other file formats
- 📚 **Multi-library Support**: Manage documents by library
- ⚡ **Auto-indexing**: Automatic vectorization on load
- 🔍 **Semantic Retrieval**: Retrieve relevant documents based on vector similarity (file-level)


## Quick Start

```bash
npm install @antv/context
```

```typescript
import { Context } from '@antv/context';

const ctx = await Context.create({ vectorsDir: './vectors' });

// Load documents into a specific library with automatic vectorization
await ctx.load('g2', './g2-docs/**/*.md');
await ctx.load('f2', './f2-docs/**/*.json');

// Query
const results = await ctx.query('How to configure a line chart', { library: 'g2', topK: 5 });
// => [{ content: '...', score: 0.92, id: 'g2-docs/line.md' }, ...]
```


## API

### `Context.create(options)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `vectorsDir` | `string` | Directory to store vector files |
| `model` | `string` | Transformers model name, default `sentence-transformers/all-MiniLM-L6-v2` |

### `ctx.load(library, glob)`

Load files into a specified library with automatic vectorization. Document ID defaults to the file path.

```typescript
await ctx.load('g2', './docs/**/*.md');
await ctx.load('g2', ['./docs/**/*.md', './docs/**/*.json']);
```

### `ctx.query(text, options)`

Vector similarity retrieval.

| Parameter | Type | Description |
|-----------|------|-------------|
| `library` | `string` | Required, library to query |
| `topK` | `number` | Number of results to return, default 5 |

```typescript
const results = await ctx.query('How to configure a line chart', { library: 'g2', topK 5 });
// => [{ id: 'g2-docs/line.md', content: '...', score: 0.92 }, ...]
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
            |   FileLoader    |                   |  Transformers   |
            +--------+--------+                   +--------+--------+
                     |                                     |
            +--------v--------+                            |
            |  Transformers   |                            |
            +--------+--------+                            |
                     |                                     |
            +--------v--------+                            |
            |      .zvec      |<---------------Query-------+
            +-----------------+

+------------------------------------------------------------------------+
```


## License

MIT