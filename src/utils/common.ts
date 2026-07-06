import * as crypto from 'crypto';
import type { DocumentRegistry } from '../registry';

// ---------------------------------------------------------------------------
// JSON / meta helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse a meta JSON string. Returns undefined on invalid JSON.
 */
export function safeParseMeta(metaStr: string | undefined): Record<string, unknown> | undefined {
  if (!metaStr) return undefined;
  try {
    return JSON.parse(metaStr);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Library name resolution
// ---------------------------------------------------------------------------

/**
 * Resolve library names from the query option.
 *
 * - '*' queries all loaded libraries.
 * - Array of names queries multiple specific libraries.
 * - Comma-separated string is supported for backward compatibility.
 * - Single string is the normal case.
 */
export function resolveLibraries(
  librarySpec: string | string[],
  registry: DocumentRegistry,
): string[] {
  if (Array.isArray(librarySpec)) {
    return librarySpec.filter(Boolean);
  }

  if (librarySpec === '*') {
    return registry.getLibraryNames();
  }

  if (librarySpec.includes(',')) {
    return librarySpec.split(',').map((s) => s.trim()).filter(Boolean);
  }

  return [librarySpec];
}

// ---------------------------------------------------------------------------
// Content hashing
// ---------------------------------------------------------------------------

/**
 * Compute a short content hash for change detection.
 *
 * Uses SHA-256 truncated to 16 hex chars (64-bit) — compact enough
 * for registry storage, collision-resistant enough for dedup.
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/**
 * Select a representative sample of files from a list for tokenizer detection.
 *
 * Picks files spread across the list (first, middle, last, and evenly-spaced)
 * to avoid bias when the file order doesn't reflect content distribution.
 * Returns at most `maxCount` file paths.
 */
export function selectSampleFiles(files: string[], maxCount: number): string[] {
  if (files.length <= maxCount) return files;

  const result: string[] = [];
  result.push(files[0]);
  const step = Math.floor((files.length - 1) / (maxCount - 1));
  for (let i = step; i < files.length - 1; i += step) {
    if (result.length < maxCount) {
      result.push(files[i]);
    }
  }
  if (result[result.length - 1] !== files[files.length - 1] && result.length < maxCount) {
    result.push(files[files.length - 1]);
  }
  return result;
}
