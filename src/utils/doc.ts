import * as path from 'path';
import { computeContentHash } from './hash';

/**
 * Convert a file path to a safe, collision-resistant ID for zvec.
 */
export function pathToId(filePath: string): string {
  const normalized = path.normalize(filePath).replace(/\\/g, '/').replace(/^\/+/, '');
  const hash = computeContentHash(normalized);
  const basename = normalized.split('/').pop() ?? '';
  const suffix = basename
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 20);
  return `${hash}__${suffix}`;
}