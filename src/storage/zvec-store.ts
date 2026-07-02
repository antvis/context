import {
  ZVecCreateAndOpen,
  ZVecOpen,
  ZVecCollectionSchema,
  ZVecDataType,
  ZVecCollection,
} from '@zvec/zvec';
import * as fs from 'fs';
import * as path from 'path';

interface DocData {
  content: string;
  meta?: Record<string, unknown>;
}

export class ZVecStore {
  private collection: ZVecCollection;
  private dimension: number;
  private filePath!: string;
  private docs: Map<string, DocData> = new Map();

  constructor(collection: ZVecCollection, dimension: number) {
    this.collection = collection;
    this.dimension = dimension;
  }

  static async create(filePath: string, dimension: number = 384): Promise<ZVecStore> {
    const schema = new ZVecCollectionSchema({
      name: 'documents',
      vectors: { name: 'embedding', dataType: ZVecDataType.VECTOR_FP32, dimension },
      fields: [
        { name: 'content', dataType: ZVecDataType.STRING },
      ],
    });

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let collection: ZVecCollection;
    if (fs.existsSync(filePath)) {
      collection = ZVecOpen(filePath);
    } else {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      collection = ZVecCreateAndOpen(filePath, schema);
    }

    const store = new ZVecStore(collection, dimension);
    store.filePath = filePath;
    await store.loadMeta();
    return store;
  }

  private async loadMeta(): Promise<void> {
    const metaPath = this.filePath + '.meta.json';
    if (fs.existsSync(metaPath)) {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      this.docs = new Map(Object.entries(data));
    }
  }

  private saveMeta(): void {
    fs.writeFileSync(this.filePath + '.meta.json', JSON.stringify(Object.fromEntries(this.docs)));
  }

  add(id: string, vector: number[], content: string, meta?: Record<string, unknown>): void {
    this.collection.insertSync([
      { id, vectors: { embedding: vector }, fields: { content } },
    ]);
    this.docs.set(id, { content, meta });
  }

  search(queryVector: number[], topK: number): Array<{ id: string; score: number }> {
    const results = this.collection.querySync({
      fieldName: 'embedding',
      vector: queryVector,
      topk: topK,
    });

    return results.map((r) => ({ id: r.id!, score: r.score }));
  }

  getDoc(id: string): DocData | undefined {
    return this.docs.get(id);
  }

  save(): void {
    this.saveMeta();
  }

  close(): void {
    this.saveMeta();
    this.collection.closeSync();
  }

  clear(): void {
    const ids = Array.from(this.docs.keys());
    if (ids.length > 0) {
      this.collection.deleteSync(ids);
    }
    this.docs.clear();
    this.saveMeta();
  }
}