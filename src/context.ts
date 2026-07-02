import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import { ContextOptions, QueryOptions, QueryResult } from './types';
import { TransformerVectorizer } from './vectorizer/transformer';
import { ZVecStore } from './storage/zvec-store';
import { Loader, MarkdownLoader, JsonLoader, TextLoader } from './loaders';

export class Context {
  private readonly vectorsDir: string;
  private readonly model: string;
  private readonly vectorizer: TransformerVectorizer;
  private readonly stores: Map<string, ZVecStore> = new Map();
  private readonly loaders: Loader[];

  private constructor(options: ContextOptions) {
    this.vectorsDir = options.vectorsDir;
    this.model = options.model || 'sentence-transformers/all-MiniLM-L6-v2';
    this.vectorizer = new TransformerVectorizer(this.model);
    this.loaders = [
      new MarkdownLoader(),
      new JsonLoader(),
      new TextLoader(),
    ];
  }

  static async create(options: ContextOptions): Promise<Context> {
    const ctx = new Context(options);
    await ctx.vectorizer.initialize();

    // Ensure vectors directory exists
    if (!fs.existsSync(options.vectorsDir)) {
      fs.mkdirSync(options.vectorsDir, { recursive: true });
    }

    return ctx;
  }

  private getLoader(filePath: string): Loader | undefined {
    return this.loaders.find((loader) => loader.canHandle(filePath));
  }

  private getStoreFilePath(library: string): string {
    return path.join(this.vectorsDir, `${library}.zvec`);
  }

  private async getOrCreateStore(library: string): Promise<ZVecStore> {
    if (this.stores.has(library)) {
      return this.stores.get(library)!;
    }

    const filePath = this.getStoreFilePath(library);
    const store = await ZVecStore.create(filePath);

    this.stores.set(library, store);
    return store;
  }

  async load(library: string, pattern: string | string[]): Promise<void> {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    const files = await glob(patterns, { absolute: true });
    const store = await this.getOrCreateStore(library);

    for (const filePath of files) {
      const loader = this.getLoader(filePath);
      if (!loader) continue;

      const doc = await loader.load(filePath);
      const vector = await this.vectorizer.embed(doc.content);
      store.add(doc.id, vector, doc.content, doc.meta);
    }

    // Save to disk
    store.save();
  }

  async query(text: string, options: QueryOptions): Promise<QueryResult[]> {
    const store = await this.getOrCreateStore(options.library);
    const vector = await this.vectorizer.embed(text);
    const searchResults = store.search(vector, options.topK || 5);

    return searchResults.map((result) => {
      const doc = store.getDoc(result.id)!;
      return {
        id: result.id,
        content: doc.content,
        score: result.score,
        meta: doc.meta,
      };
    });
  }
}