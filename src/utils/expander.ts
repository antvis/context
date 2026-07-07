/**
 * Query Expander — augments user queries with synonyms and cross-language
 * bridging terms to improve recall across different naming conventions.
 *
 * The expanded query text is used for both embedding and FTS, so a single
 * expanded query can match documents written in either Chinese or English,
 * or documents using different terminology for the same concept.
 *
 * Synonyms are entirely user-provided — no built-in defaults. Pass your
 * own map to `SynonymExpander` to define domain-specific term bridges.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Query expander interface — custom expanders can implement this. */
export interface QueryExpander {
  /**
   * Expand a query string with additional terms.
   *
   * Returns the augmented query text. The original query terms are always
   * preserved; the expander only appends additional terms.
   */
  expand(query: string): string;
}

// ---------------------------------------------------------------------------
// SynonymExpander
// ---------------------------------------------------------------------------

/**
 * Characters that delimit word boundaries in Latin/script-based text.
 * Does NOT include CJK characters — CJK text has no inter-word spacing,
 * so substring matching is the correct strategy for CJK terms.
 */
const WORD_BOUNDARY_RE = /[\s,，。.!！?？;；:：\(\)\[\]{}""''\"\'\-_\/\\|@#$%^&*+=<>~`]/;

/** Unicode range for CJK Unified Ideographs (basic block). */
const CJK_CHAR_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/**
 * Check whether a string contains any CJK character.
 */
function containsCJK(text: string): boolean {
  return CJK_CHAR_RE.test(text);
}

/**
 * Expands query text by injecting synonym terms.
 *
 * For each word/phrase in the query that matches a synonym entry, the
 * corresponding alternative terms are appended to the query. This bridges
 * CN↔EN terminology gaps and handles different naming conventions.
 *
 * Matching strategy:
 *   - CJK terms: substring match (CJK text has no word boundaries)
 *   - Latin terms: strict word-boundary match (avoids partial matches like
 *     "line" matching inside "inline")
 */
export class SynonymExpander implements QueryExpander {
  private readonly synonyms: Record<string, string[]>;

  constructor(synonyms?: Record<string, string[]>) {
    this.synonyms = synonyms ?? {};
  }

  expand(query: string): string {
    const queryLower = query.toLowerCase().trim();
    const additions = new Set<string>();

    for (const [term, syns] of Object.entries(this.synonyms)) {
      const termLower = term.toLowerCase();

      if (this.containsTerm(queryLower, termLower)) {
        for (const syn of syns) {
          if (!this.containsTerm(queryLower, syn.toLowerCase())) {
            additions.add(syn);
          }
        }
      }
    }

    if (additions.size === 0) return query;

    return `${query} ${[...additions].join(' ')}`;
  }

  /**
   * Check if a term appears in the text with appropriate boundary rules.
   *
   * - CJK terms use substring matching (no word boundaries in CJK text).
   * - Latin terms use strict word-boundary detection to avoid false positives.
   */
  private containsTerm(text: string, term: string): boolean {
    if (!text.includes(term)) return false;

    if (containsCJK(term)) {
      return true;
    }

    let searchFrom = 0;
    while (searchFrom <= text.length - term.length) {
      const idx = text.indexOf(term, searchFrom);
      if (idx === -1) return false;

      const prevOk = idx === 0 || WORD_BOUNDARY_RE.test(text[idx - 1]);
      const afterIdx = idx + term.length;
      const afterOk = afterIdx >= text.length || WORD_BOUNDARY_RE.test(text[afterIdx]);

      if (prevOk && afterOk) return true;

      searchFrom = idx + 1;
    }

    return false;
  }
}

// ---------------------------------------------------------------------------
// NoopExpander — pass-through for when expansion is not desired
// ---------------------------------------------------------------------------

export class NoopExpander implements QueryExpander {
  expand(query: string): string {
    return query;
  }
}
