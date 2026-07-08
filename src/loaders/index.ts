import { Loader } from './base';
import { MarkdownLoader } from './markdown';
import { JsonLoader } from './json';
import { TextLoader } from './text';

const loaders = [new MarkdownLoader(), new JsonLoader(), new TextLoader()];

export function getLoader(filePath: string): Loader | undefined {
  return loaders.find((l) => l.canHandle(filePath));
}