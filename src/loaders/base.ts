import { Document } from '../types';

export interface Loader {
  canHandle(filePath: string): boolean;
  load(filePath: string): Promise<Document>;
}