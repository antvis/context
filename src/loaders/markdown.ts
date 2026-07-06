import * as fs from 'fs/promises';
import matter from 'gray-matter';
import { Loader } from './base';
import { Document } from '../types';

export class MarkdownLoader implements Loader {
  canHandle(filePath: string): boolean {
    return filePath.endsWith('.md') || filePath.endsWith('.markdown');
  }

  async load(filePath: string): Promise<Document> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data: meta, content: body } = matter(content);

    return {
      content: body.trim(),
      meta,
    };
  }
}