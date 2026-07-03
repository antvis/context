/**
 * Language detection and tokenizer selection utilities.
 *
 * Used by StoreManager to auto-configure FTS tokenization based on
 * the character distribution of loaded documents.
 */

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

/** Language category for FTS tokenizer selection. */
export type LanguageHint = 'cjk' | 'latin' | 'mixed';

/**
 * Check whether a character is CJK (Chinese / Japanese / Korean).
 */
export function isCJK(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext-A
    (cp >= 0x3040 && cp <= 0x30ff) || // Hiragana + Katakana
    (cp >= 0xac00 && cp <= 0xd7af)    // Hangul
  );
}

/**
 * Split text into alternating CJK / non-CJK segments.
 */
export function splitMixed(text: string): string[] {
  const result: string[] = [];
  let buf = '';
  let bufIsCJK: boolean | null = null;

  for (const ch of text) {
    const cjk = isCJK(ch);
    if (bufIsCJK === null) {
      bufIsCJK = cjk;
    } else if (cjk !== bufIsCJK) {
      result.push(buf);
      buf = '';
      bufIsCJK = cjk;
    }
    buf += ch;
  }
  if (buf) result.push(buf);
  return result;
}

/**
 * Detect the dominant language category of a text sample.
 *
 * Used by StoreManager to pick the right FTS tokenizer:
 *   - 'cjk'   → jieba (Chinese word segmentation)
 *   - 'latin'  → standard (English stemmer + stop words)
 *   - 'mixed'  → jieba (the more general choice for mixed scripts)
 *
 * Heuristic: if > 15% of characters are CJK, classify as CJK-dominant.
 */
export function detectLanguage(text: string): LanguageHint {
  if (!text) return 'latin';

  let cjkCount = 0;
  let alphaCount = 0;

  for (const ch of text) {
    if (isCJK(ch)) {
      cjkCount++;
    } else if (/[a-zA-Z]/.test(ch)) {
      alphaCount++;
    }
  }

  const total = cjkCount + alphaCount || 1;
  const cjkRatio = cjkCount / total;

  if (cjkRatio > 0.15) {
    return alphaCount > 0 ? 'mixed' : 'cjk';
  }
  return 'latin';
}

/**
 * Pick the best FTS tokenizer name for a given language hint.
 *
 * This is the function StoreManager calls to auto-configure tokenization.
 */
export function tokenizerForLanguage(hint: LanguageHint): string {
  switch (hint) {
    case 'cjk':
    case 'mixed':
      return 'jieba';
    case 'latin':
      return 'standard';
  }
}

/**
 * Convenience: detect language from text and return the matching tokenizer.
 */
export function detectTokenizer(text: string): string {
  return tokenizerForLanguage(detectLanguage(text));
}
