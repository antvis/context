import * as fs from 'fs';

/**
 * Select a representative sample of files for tokenizer detection.
 */
function selectSampleFiles(files: string[], maxCount: number): string[] {
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

/**
 * Load sample text from a list of files for tokenizer detection.
 * Returns undefined if no valid samples could be loaded.
 */
export async function loadSampleText(files: string[], sampleCount = 5): Promise<string | undefined> {
  if (files.length === 0) return undefined;

  try {
    const sampleFiles = selectSampleFiles(files, sampleCount);
    const samples = await Promise.allSettled(
      sampleFiles.map((f) => fs.promises.readFile(f, 'utf-8')),
    );
    const validSamples = samples
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map((r) => r.value);
    if (validSamples.length > 0) {
      return validSamples.join('\n');
    }
  } catch {
    // Sample failure is non-fatal
  }
  return undefined;
}