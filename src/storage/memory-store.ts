/**
 * MemoryZvecStore — pure JS fallback (cosine similarity + linear scan + text).
 */

import type {
  ZvecDoc,
  ZvecQueryResult,
  ZvecSearchParams,
  ZvecHybridParams,
  IZvecStore,
  FtsFieldWeight,
} from './types';
import { cosineSimilarity, evalMemoryFilter } from './utils';

const DEFAULT_FTS_WEIGHTS: FtsFieldWeight[] = [
  { fieldName: 'content', weight: 1.0 }
];

const DEFAULT_RANK_CONSTANT = 60;

export class MemoryZvecStore implements IZvecStore {
  private docs: ZvecDoc[] = [];
  private _ftsWeights: FtsFieldWeight[];
  private _rankConstant: number;

  constructor(ftsFieldWeights?: FtsFieldWeight[], rankConstant?: number) {
    this._ftsWeights = ftsFieldWeights && ftsFieldWeights.length > 0
      ? ftsFieldWeights
      : DEFAULT_FTS_WEIGHTS;
    this._rankConstant = rankConstant ?? DEFAULT_RANK_CONSTANT;
  }

  async insert(docs: ZvecDoc[]): Promise<void> {
    this.docs.push(...docs);
  }

  async search(params: ZvecSearchParams): Promise<ZvecQueryResult[]> {
    return doSyncSearch(this.docs, params);
  }

  async searchHybrid(params: ZvecHybridParams): Promise<ZvecQueryResult[]> {
    return doSyncHybridSearch(this.docs, params, this._ftsWeights, this._rankConstant);
  }

  searchSync(params: ZvecSearchParams): ZvecQueryResult[] {
    return doSyncSearch(this.docs, params);
  }

  searchHybridSync(params: ZvecHybridParams): ZvecQueryResult[] {
    return doSyncHybridSearch(this.docs, params, this._ftsWeights, this._rankConstant);
  }

  async close(): Promise<void> {
    this.docs = [];
  }
}

function doSyncSearch(
  docs: ZvecDoc[],
  params: ZvecSearchParams
): ZvecQueryResult[] {
  const { vector, topK, filter } = params;
  const scored: ZvecQueryResult[] = [];
  for (const doc of docs) {
    if (filter && !evalMemoryFilter(filter, doc.fields)) continue;
    scored.push({
      id: doc.id,
      score: cosineSimilarity(vector, doc.vector),
      fields: doc.fields
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function doSyncHybridSearch(
  docs: ZvecDoc[],
  params: ZvecHybridParams,
  ftsWeights: FtsFieldWeight[],
  rankConstant: number,
): ZvecQueryResult[] {
  const { queryText, queryVector, topK, filter } = params;
  const rrScores = new Map<string, number>();

  // Filtered docs — apply once
  const candidates = filter
    ? docs.filter((d) => evalMemoryFilter(filter, d.fields))
    : docs;

  // 1. Text path: field-boosted scoring with word-boundary matching + TF weighting.
  //
  //    Scoring rules (per query term per field):
  //      - Exact word-boundary match (EN: surrounded by space/punctuation,
  //        CJK: standalone character group): 1.0 × field_weight
  //      - Substring match (no word boundary): 0.3 × field_weight
  //      - TF multiplier: log(1 + count) so multiple occurrences boost
  //        the score but don't saturate it.
  //      - CJK bigrams from the query also score (0.5 × field_weight per match).
  //
  //    This produces better FTS results than raw substring matching:
  //      "tooltip" won't falsely match "tooltipconfigxx"
  //      "折线" will match "折线图" via bigram scoring
  const terms = queryText.toLowerCase().split(/\s+/).filter(Boolean);
  const cjkBigrams = extractCJKBigrams(queryText.toLowerCase());

  const textRanked = candidates
    .map((doc) => {
      let score = 0;
      for (const fw of ftsWeights) {
        const fieldVal = String(doc.fields[fw.fieldName] || '').toLowerCase();
        for (const term of terms) {
          const count = countTermMatches(fieldVal, term);
          if (count > 0) {
            // Word-boundary match count vs total occurrences
            const boundaryCount = countBoundaryMatches(fieldVal, term);
            const subCount = count - boundaryCount;
            // TF-weighted: log(1 + count) prevents saturation
            const boundaryScore = boundaryCount > 0
              ? Math.log(1 + boundaryCount) * fw.weight
              : 0;
            const subScore = subCount > 0
              ? Math.log(1 + subCount) * 0.3 * fw.weight
              : 0;
            score += boundaryScore + subScore;
          }
        }
        // CJK bigram scoring — bridges partial character matches
        for (const bigram of cjkBigrams) {
          const count = countTermMatches(fieldVal, bigram);
          if (count > 0) {
            score += Math.log(1 + count) * 0.5 * fw.weight;
          }
        }
      }
      return { id: doc.id, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Standard RRF: score = 1 / (rankConstant + rank), rank starts at 1
  for (let i = 0; i < textRanked.length; i++) {
    rrScores.set(textRanked[i].id, 1 / (rankConstant + (i + 1)));
  }

  // 2. Vector path: cosine similarity
  const vecRanked = candidates
    .map((doc) => ({
      id: doc.id,
      score: cosineSimilarity(queryVector, doc.vector),
    }))
    .sort((a, b) => b.score - a.score);

  for (let i = 0; i < vecRanked.length; i++) {
    const existing = rrScores.get(vecRanked[i].id) ?? 0;
    rrScores.set(vecRanked[i].id, existing + 1 / (rankConstant + (i + 1)));
  }

  // 3. Merge by RRF score (no division — scores are already correctly scaled)
  const docMap = new Map(candidates.map((d) => [d.id, d]));
  return [...rrScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, score]) => {
      const doc = docMap.get(id)!;
      return { id, score, fields: doc.fields };
    });
}

// ---------------------------------------------------------------------------
// FTS helper functions — word-boundary matching + CJK bigram extraction
// ---------------------------------------------------------------------------

/**
 * Count total occurrences of a term in text (substring match).
 */
function countTermMatches(text: string, term: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(term, pos)) !== -1) {
    count++;
    pos += term.length;
  }
  return count;
}

/**
 * Count occurrences of a term that land on a word boundary.
 *
 * A word boundary means the character before and after the match is
 * a space, punctuation, or string boundary. CJK characters are treated
 * as individual "words" — a CJK term naturally forms a boundary within
 * a CJK string.
 */
function countBoundaryMatches(text: string, term: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(term, pos)) !== -1) {
    if (isWordBoundary(text, pos, term.length)) {
      count++;
    }
    pos += term.length;
  }
  return count;
}

/**
 * Check if a substring occurrence at the given position is at a word boundary.
 */
function isWordBoundary(text: string, pos: number, len: number): boolean {
  const before = pos === 0 || /[\s\n.,;:!?，。！？、：；"'(（【《\-_]/.test(text[pos - 1]);
  const afterIdx = pos + len;
  const after = afterIdx >= text.length || /[\s\n.,;:!?，。！？、：；"')）】》\-_]/.test(text[afterIdx]);
  return before && after;
}

/**
 * Extract CJK bigrams (2-char sequences) from text for partial matching.
 *
 * For example, "折线图配置" produces bigrams: ["折线", "线图", "图配", "配置"]
 * These bigrams help the FTS path find documents that contain partial
 * character sequences of the query, improving recall for CJK searches.
 */
function extractCJKBigrams(text: string): string[] {
  const bigrams: string[] = [];
  // Extract continuous CJK segments, then generate bigrams within each
  const segments = splitCJKSegments(text);
  for (const seg of segments) {
    for (let i = 0; i + 2 <= seg.length; i++) {
      bigrams.push(seg.slice(i, i + 2));
    }
  }
  return bigrams;
}

/**
 * Split text into continuous CJK character segments.
 * Non-CJK characters break the segment.
 */
function splitCJKSegments(text: string): string[] {
  const segments: string[] = [];
  let current = '';
  for (const ch of text) {
    if (isCJKChar(ch)) {
      current += ch;
    } else {
      if (current.length >= 2) segments.push(current);
      current = '';
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

/**
 * Check if a character is CJK.
 */
function isCJKChar(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0xac00 && cp <= 0xd7af)
  );
}
