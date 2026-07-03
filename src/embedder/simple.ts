/**
 * SimpleEmbedder — lightweight pseudo-embedding, no external dependencies.
 *
 * Uses weighted CJK n-grams and English word hashing with log-scale
 * count compression and L2 normalization. Not a semantic embedder —
 * it's a tuned bag-of-tokens fingerprint used as a graceful-degradation
 * fallback when TransformersEmbedder cannot load its model.
 *
 * **This embedder is used internally as a graceful-degradation fallback.**
 * It is not part of the public API and may change without notice.
 *
 * @internal — fallback only; prefer TransformersEmbedder for
 *   production-quality retrieval.
 */

import { Embedder } from './types';
import { isCJK, splitMixed } from './language';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIMPLE_DIMS = 512;

const CJK_UNIGRAM_WEIGHT = 0.15;
const CJK_BIGRAM_WEIGHT  = 1.0;
const CJK_TRIGRAM_WEIGHT = 2.0;

const EN_WORD_WEIGHT        = 1.5;
const EN_SINGLE_CHAR_WEIGHT = 0.1;

const STOP_WORDS = new Set([
  '的','了','在','是','我','有','和','就','不',
  'the','a','an','is','are','was','were','be','been','being',
  'to','of','in','for','on','with','at','by','from','as',
  'i','me','my','we','our','he','him','his','she','her','it','its',
  'and','but','or','if','this','that','these','those',
  'not','no','nor','only',
  'chart','using','use',
  '图表','数据','配置','展示','需要','支持','进行','通过',
  '绘制','实现','基于','根据','使用','方式','效果','功能',
  '用于','可以','一个','表示','如下','参考',
]);

const CJK_UNIGRAM_STOP = new Set([
  '的','了','在','是','和','就','不','也','都','很','到','要','会','着',
  '能','可','以','对','与','或','而','且','但','则','因','所','被','把',
  '从','由','向','往','用','为','让','使','给','将','比','更','最','只',
  '这','那','其','各','某','每','任','何','另','别','全','整','些','几',
  '上','下','中','内','外','前','后','左','右','大','小','多','少','高',
  '一','二','三','两','个','次','种','项','批','组','类','型',
]);

// ---------------------------------------------------------------------------
// Internal helpers — weighted tokenization
// ---------------------------------------------------------------------------

interface WeightedToken {
  token: string;
  weight: number;
}

function tokenizeWeighted(
  text: string,
  synonymMap: Map<string, string[]> | null
): WeightedToken[] {
  const tokens: WeightedToken[] = [];
  const seen = new Set<string>();
  const lower = text.toLowerCase();
  const segments = splitMixed(lower);

  for (const seg of segments) {
    if (isCJK(seg)) {
      for (let i = 0; i + 3 <= seg.length; i++) {
        const t = seg.slice(i, i + 3);
        if (!seen.has(t)) { seen.add(t); tokens.push({ token: t, weight: CJK_TRIGRAM_WEIGHT }); }
      }
      for (let i = 0; i + 2 <= seg.length; i++) {
        const t = seg.slice(i, i + 2);
        if (!seen.has(t)) { seen.add(t); tokens.push({ token: t, weight: CJK_BIGRAM_WEIGHT }); }
      }
      for (const ch of seg) {
        if (seen.has(ch) || CJK_UNIGRAM_STOP.has(ch)) continue;
        seen.add(ch);
        tokens.push({ token: ch, weight: CJK_UNIGRAM_WEIGHT });
      }

      if (synonymMap) {
        for (const [term, synonyms] of synonymMap) {
          if (seg.includes(term)) {
            for (const syn of synonyms) {
              if (seen.has(syn)) continue;
              seen.add(syn);
              tokens.push({ token: syn, weight: 1.0 });
            }
          }
        }
      }
    } else {
      for (const w of seg.split(/\s+/)) {
        const trimmed = w.trim();
        if (!trimmed || STOP_WORDS.has(trimmed) || seen.has(trimmed)) continue;
        seen.add(trimmed);
        const weight = trimmed.length === 1
          ? EN_SINGLE_CHAR_WEIGHT
          : EN_WORD_WEIGHT;
        tokens.push({ token: trimmed, weight });

        if (synonymMap) {
          const syns = synonymMap.get(trimmed);
          if (syns) {
            for (const syn of syns) {
              if (seen.has(syn)) continue;
              seen.add(syn);
              tokens.push({ token: syn, weight: 1.0 });
            }
          }
        }
      }
    }
  }

  return tokens;
}

/** FNV-1a 32-bit hash with optional seed for multi-hash. */
function hashToken(token: string, seed = 0): number {
  let hash = (2166136261 + seed) >>> 0;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// SimpleEmbedder
// ---------------------------------------------------------------------------

export class SimpleEmbedder implements Embedder {
  readonly dimensions = SIMPLE_DIMS;
  private _synonymMap: Map<string, string[]> | null;

  constructor(synonymMap?: Map<string, string[]>) {
    this._synonymMap = synonymMap ?? null;
  }

  async embed(text: string): Promise<number[]> {
    return this.embedSync(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedSync(t));
  }

  /** Synchronous embedding – no async overhead, usable in sync code paths. */
  embedSync(text: string): number[] {
    const vec = new Array<number>(SIMPLE_DIMS).fill(0);
    const tokens = tokenizeWeighted(text, this._synonymMap);

    for (const { token, weight } of tokens) {
      // 3 hash functions per token for collision resistance
      for (let h = 0; h < 3; h++) {
        vec[hashToken(token, h) % SIMPLE_DIMS] += weight;
      }
    }

    // Log-scale compression: prevents dimension saturation from
    // high-frequency terms (a term appearing 50x contributes log(51) ≈ 3.93
    // instead of 50, giving rare terms proportionally more influence).
    for (let i = 0; i < SIMPLE_DIMS; i++) {
      if (vec[i] > 0) vec[i] = Math.log(1 + vec[i]);
    }

    // L2-normalise
    let norm = 0;
    for (let i = 0; i < SIMPLE_DIMS; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < SIMPLE_DIMS; i++) {
      vec[i] /= norm;
    }
    return vec;
  }
}
