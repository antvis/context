import * as crypto from 'crypto';
import * as path from 'path';

/**
 * Convert a file path to a safe, collision-resistant ID for zvec.
 *
 * zvec doc IDs have a 64-character limit and only allow alphanumeric + underscore.
 * Strategy: hash the full path to guarantee uniqueness and fit within the limit,
 * while appending a short readable suffix for debugging.
 *
 * Cross-platform consistency: paths are normalized to forward slashes before
 * hashing, so the same relative path produces the same ID on Windows, macOS,
 * and Linux.
 *
 * Example: "/long/path/getting-started.md" → "f3a1b2c4__getting_started"
 */
export function pathToId(filePath: string): string {
  // Normalize separators to forward slash for cross-platform consistency.
  // Also collapse redundant segments (e.g. "a/../b" → "b") via path.normalize.
  const normalized = path.normalize(filePath).replace(/\\/g, '/').replace(/^\/+/, '');

  // Generate a compact hash of the full path (16 hex chars = 64-bit)
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);

  // Derive a short readable suffix from the filename (without extension)
  const basename = normalized.split('/').pop() ?? '';
  const suffix = basename
    .replace(/\.[a-zA-Z0-9]+$/, '')   // remove extension
    .replace(/[^a-zA-Z0-9]/g, '_')     // sanitize
    .slice(0, 20);                      // truncate to keep total under 64

  return `${hash}__${suffix}`;
}
