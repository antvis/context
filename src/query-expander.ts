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
 *
 * Example (with a custom synonym map):
 *   { "tooltip": ["提示框", "hover"] } → "tooltip config 提示框 hover 配置"
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

/** Characters that delimit term boundaries in mixed CN/EN text. */
const CJK_BOUNDARY_RE = /[\s一-鿿,，。]/;

/**
 * Expands query text by injecting synonym terms.
 *
 * For each word/phrase in the query that matches a synonym entry, the
 * corresponding alternative terms are appended to the query. This bridges
 * CN↔EN terminology gaps and handles different naming conventions.
 *
 * The expander normalises case and preserves CJK characters for exact matching.
 */
export class SynonymExpander implements QueryExpander {
  private readonly synonyms: Record<string, string[]>;

  constructor(synonyms?: Record<string, string[]>) {
    this.synonyms = synonyms ?? {};
  }

  expand(query: string): string {
    const queryLower = query.toLowerCase().trim();
    const additions = new Set<string>();

    // Find matching synonym entries in the query
    for (const [term, syns] of Object.entries(this.synonyms)) {
      const termLower = term.toLowerCase();

      // Exact match (whole term exists in query)
      if (this.containsTerm(queryLower, termLower)) {
        for (const syn of syns) {
          // Don't add synonyms that are already in the query
          if (!this.containsTerm(queryLower, syn.toLowerCase())) {
            additions.add(syn);
          }
        }
      }
    }

    if (additions.size === 0) return query;

    // Append additions — space-separated keeps compatibility with both
    // embedding models and FTS tokenizers.
    return `${query} ${[...additions].join(' ')}`;
  }

  /**
   * Check if a term appears as a word/phrase boundary in the query.
   * Handles both space-separated (EN) and character-joined (CJK) text.
   */
  private containsTerm(text: string, term: string): boolean {
    if (text.includes(term)) {
      const idx = text.indexOf(term);
      const prevOk = idx === 0 || CJK_BOUNDARY_RE.test(text[idx - 1]);
      const afterIdx = idx + term.length;
      const afterOk = afterIdx >= text.length || CJK_BOUNDARY_RE.test(text[afterIdx]);
      return prevOk && afterOk;
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
