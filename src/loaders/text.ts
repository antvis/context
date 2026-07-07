import * as fs from 'fs/promises';
import { Loader } from './base';
import { Document } from '../types';

export class TextLoader implements Loader {
  canHandle(filePath: string): boolean {
    return filePath.endsWith('.txt');
  }

  async load(filePath: string): Promise<Document> {
    const content = await fs.readFile(filePath, 'utf-8');

    return {
      content: content.trim(),
    };
  }
}