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
