import * as fs from 'fs/promises';
import { Loader } from './base';
import { Document } from '../types';

export class JsonLoader implements Loader {
  canHandle(filePath: string): boolean {
    return filePath.endsWith('.json');
  }

  async load(filePath: string): Promise<Document> {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    return {
      content: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    };
  }
}