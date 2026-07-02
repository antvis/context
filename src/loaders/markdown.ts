import * as fs from 'fs/promises';
import * as path from 'path';
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

    // 使用文件名作为 ID，避免路径中的特殊字符
    const id = path.basename(filePath);

    return {
      id,
      content: body.trim(),
      meta,
    };
  }
}