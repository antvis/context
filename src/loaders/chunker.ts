/**
 * Document chunker — splits loaded documents into smaller, semantic chunks
 * so that vector embeddings capture fine-grained meaning instead of averaging
 * the entire document.
 *
 * Strategies:
 *   - MarkdownChunker: splits on headings (## / ###), then falls back to fixed-size
 *   - FixedSizeChunker: sliding window with overlap, used for plain text / JSON
 *
 * Each chunk stores its heading path, index, and parent document ID so the
 * query layer can reconstruct context or deduplicate by parent.
 */

import { Document } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A semantic chunk of a document. */
export interface Chunk {
  /** Chunk content — the actual text that will be embedded. */
  content: string;
  /** Zero-based chunk index within the parent document. */
  chunkIndex: number;
  /** Total number of chunks in the parent document. */
  totalChunks: number;
  /** Parent document ID (hash-based, assigned by Context). */
  parentDocId: string;
  /**
   * Heading path from the document root to this chunk.
   * e.g. ["Configuration", "Line Chart", "Basic Usage"]
   */
  headingPath: string[];
}

/** Configuration for document chunking. */
export interface ChunkingOptions {
  /** Maximum characters per chunk (roughly ¼ tokens for mixed CN/EN, ½ for pure EN). */
  maxChunkSize?: number;
  /** Overlap in characters between adjacent chunks (avoids boundary cuts). */
  chunkOverlap?: number;
  /** Strategy used for chunking. */
  strategy?: 'markdown' | 'fixed' | 'auto';
}

/** Chunker interface — custom chunkers can implement this. */
export interface Chunker {
  chunk(doc: Document): Chunk[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_CHUNK_SIZE = 1024; // ~256 tokens for mixed CN/EN
const DEFAULT_CHUNK_OVERLAP = 128;

function chunkingDefaults(options?: ChunkingOptions): Required<Omit<ChunkingOptions, 'strategy'>> {
  return {
    maxChunkSize: options?.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE,
    chunkOverlap: options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP,
  };
}

// ---------------------------------------------------------------------------
// Markdown Chunker — heading-aware splitting
// ---------------------------------------------------------------------------

export class MarkdownChunker implements Chunker {
  private readonly maxChunkSize: number;
  private readonly chunkOverlap: number;

  constructor(options?: ChunkingOptions) {
    const opts = chunkingDefaults(options);
    this.maxChunkSize = opts.maxChunkSize;
    this.chunkOverlap = opts.chunkOverlap;
  }

  chunk(doc: Document): Chunk[] {
    return chunkMarkdown(doc, this.maxChunkSize, this.chunkOverlap);
  }
}

/**
 * Split markdown content into heading-anchored sections, then sub-split
 * sections that exceed maxChunkSize with a fixed-size sliding window.
 */
function chunkMarkdown(
  doc: Document,
  maxChunkSize: number,
  overlap: number,
): Chunk[] {
  const sections = splitByHeadings(doc.content);
  const chunks: Chunk[] = [];

  for (const section of sections) {
    if (section.content.length <= maxChunkSize) {
      if (section.content.trim().length > 0) {
        chunks.push({
          content: section.content.trim(),
          chunkIndex: 0, // filled in after
          totalChunks: 0, // filled in after
          parentDocId: doc.id,
          headingPath: section.headingPath,
        });
      }
      continue;
    }

    // Sub-split oversized sections with overlap
    const subChunks = fixedSizeSplit(section.content, maxChunkSize, overlap);
    for (const sc of subChunks) {
      chunks.push({
        content: sc,
        chunkIndex: 0,
        totalChunks: 0,
        parentDocId: doc.id,
        headingPath: section.headingPath,
      });
    }
  }

  // Fill in chunkIndex and totalChunks
  return chunks.map((c, i) => ({
    ...c,
    chunkIndex: i,
    totalChunks: chunks.length,
  }));
}

interface HeadingSection {
  content: string;
  headingPath: string[];
}

/**
 * Split markdown text into sections delimited by markdown headings (##, ###).
 *
 * Lines before the first heading become a section with an empty heading path.
 */
function splitByHeadings(text: string): HeadingSection[] {
  const sections: HeadingSection[] = [];
  const lines = text.split('\n');
  let currentHeadingPath: string[] = [];
  let currentLines: string[] = [];

  function flushSection(): void {
    const content = currentLines.join('\n').trim();
    if (content.length > 0) {
      sections.push({
        content,
        headingPath: [...currentHeadingPath],
      });
    }
    currentLines = [];
  }

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);
    const h3Match = line.match(/^###\s+(.+)/);

    if (h1Match) {
      flushSection();
      currentHeadingPath = [h1Match[1].trim()];
    } else if (h2Match) {
      flushSection();
      const h1Ancestor = currentHeadingPath.length > 0 ? currentHeadingPath[0] : null;
      currentHeadingPath = h1Ancestor
        ? [h1Ancestor, h2Match[1].trim()]
        : [h2Match[1].trim()];
    } else if (h3Match) {
      flushSection();
      currentHeadingPath = [...currentHeadingPath, h3Match[1].trim()];
      if (currentHeadingPath.length === 0) {
        currentHeadingPath = [h3Match[1].trim()];
      }
    } else {
      currentLines.push(line);
    }
  }

  flushSection();

  // If no headings were found at all, return the full content as one section
  if (sections.length === 0 && currentLines.length === 0 && text.trim().length > 0) {
    sections.push({ content: text.trim(), headingPath: [] });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Fixed-Size Chunker — sliding window, no semantic awareness
// ---------------------------------------------------------------------------

export class FixedSizeChunker implements Chunker {
  private readonly maxChunkSize: number;
  private readonly chunkOverlap: number;

  constructor(options?: ChunkingOptions) {
    const opts = chunkingDefaults(options);
    this.maxChunkSize = opts.maxChunkSize;
    this.chunkOverlap = opts.chunkOverlap;
  }

  chunk(doc: Document): Chunk[] {
    const parts = fixedSizeSplit(doc.content, this.maxChunkSize, this.chunkOverlap);
    return parts.map((content, i) => ({
      content,
      chunkIndex: i,
      totalChunks: parts.length,
      parentDocId: doc.id,
      headingPath: [],
    }));
  }
}

/**
 * Split text into fixed-size windows with overlap.
 *
 * Tries to break at paragraph boundaries (double newline) within a tolerance
 * of maxSize to avoid cutting sentences in half. Falls back to hard cut.
 *
 * Protects fenced code blocks (```) and pipe tables (|...|) from being
 * split mid-structure — cut points are adjusted to land before or after
 * these regions.
 */
function fixedSizeSplit(
  text: string,
  maxSize: number,
  overlap: number,
): string[] {
  const paragraphs = splitRespectingBlocks(text);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 <= maxSize) {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    } else {
      // Current chunk is full — flush it
      if (current) {
        chunks.push(current);
        // Start new chunk with overlap: take the last `overlap` chars of the
        // previous chunk as prefix so boundary semantics aren't lost.
        const overlapPrefix = overlap > 0 && current.length > overlap
          ? current.slice(-overlap).replace(/^[^\w一-鿿]+/, '') + '\n\n'
          : '';
        current = overlapPrefix + trimmed;
      } else {
        // Single paragraph/block is larger than maxSize — force split
        // but still respect code block / table boundaries
        current = trimmed;
        while (current.length > maxSize) {
          let cutPoint = findBreakPointSafe(current, maxSize);
          chunks.push(current.slice(0, cutPoint).trim());
          const suffix = current.slice(cutPoint).trim();
          current = overlap > 0 && suffix.length > 0
            ? current.slice(Math.max(0, cutPoint - overlap), cutPoint).replace(/^[^\w一-鿿]+/, '') + '\n\n' + suffix
            : suffix;
        }
      }
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [text.trim()];
}

// ---------------------------------------------------------------------------
// Block-aware splitting helpers
// ---------------------------------------------------------------------------

/** Regex matching the opening/closing of a fenced code block. */
const FENCED_CODE_RE = /^(`{3,}|~{3,})/;

/**
 * Check whether a line is part of a pipe table row.
 * Matches lines like `| col1 | col2 |` and separator rows `|---|---|`.
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1;
}

/**
 * Split text into logical units that respect fenced code blocks and tables.
 *
 * Each returned unit is either:
 *   - A complete fenced code block (never split)
 *   - A contiguous run of table rows (never split)
 *   - A run of normal paragraphs separated by double newlines
 *
 * This ensures downstream fixed-size splitting never cuts inside a
 * code block or table.
 */
function splitRespectingBlocks(text: string): string[] {
  const lines = text.split('\n');
  const units: string[] = [];
  let buffer: string[] = [];
  let inCodeBlock = false;
  let codeFence = '';
  let inTable = false;

  function flushBuffer(): void {
    if (buffer.length > 0) {
      const content = buffer.join('\n').trim();
      if (content.length > 0) {
        units.push(content);
      }
      buffer = [];
    }
  }

  for (const line of lines) {
    // --- Fenced code block detection ---
    const fenceMatch = line.match(FENCED_CODE_RE);
    if (fenceMatch) {
      if (!inCodeBlock) {
        // Entering code block — flush any preceding normal content
        flushBuffer();
        inCodeBlock = true;
        codeFence = fenceMatch[1].charAt(0); // ` or ~
        buffer.push(line);
      } else if (line.trimStart().startsWith(codeFence.repeat(codeFence.length)) && line.trim().length <= codeFence.length + 1) {
        // Closing fence — end of code block
        buffer.push(line);
        flushBuffer(); // emit the complete code block as one unit
        inCodeBlock = false;
        codeFence = '';
      } else {
        // Inside code block
        buffer.push(line);
      }
      continue;
    }

    if (inCodeBlock) {
      buffer.push(line);
      continue;
    }

    // --- Table row detection ---
    if (isTableRow(line)) {
      if (!inTable) {
        // Entering table — flush preceding normal content
        flushBuffer();
        inTable = true;
      }
      buffer.push(line);
      continue;
    }

    // Not a table row
    if (inTable) {
      // Exiting table — flush the complete table as one unit
      flushBuffer();
      inTable = false;
    }

    // Normal line — accumulate; double-newline splits are handled
    // by the paragraph-level logic below via empty-line detection
    buffer.push(line);
  }

  // Flush any remaining content
  flushBuffer();

  // Post-process: further split normal units on double-newlines so that
  // the paragraph-level sliding window works correctly. Code blocks and
  // tables remain as single units.
  const result: string[] = [];
  for (const unit of units) {
    if (FENCED_CODE_RE.test(unit.split('\n')[0] ?? '') || isTableRow(unit.split('\n')[0] ?? '')) {
      // Protected block — keep as-is
      result.push(unit);
    } else {
      // Normal text — split on paragraph boundaries
      const paras = unit.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
      result.push(...paras);
    }
  }

  return result.length > 0 ? result : [text.trim()];
}

/**
 * Find a safe break point that avoids cutting inside code blocks or tables.
 *
 * Delegates to findBreakPoint for natural break detection, then adjusts
 * the result if it lands inside a protected region.
 */
function findBreakPointSafe(text: string, maxSize: number): number {
  const candidate = findBreakPoint(text, maxSize);

  // Check if the candidate falls inside a fenced code block
  const beforeCut = text.slice(0, candidate);
  const fenceOpens = (beforeCut.match(/^(`{3,}|~{3,})/gm) ?? []).length;
  const fenceCloses = (beforeCut.match(/^(`{3,}|~{3,})\s*$/gm) ?? []).length;

  if (fenceOpens > fenceCloses) {
    // Inside an unclosed code block — move cut point backward to before the fence
    const lastOpenIdx = beforeCut.lastIndexOf('\n```');
    const lastOpenTilde = beforeCut.lastIndexOf('\n~~~');
    const safePoint = Math.max(lastOpenIdx, lastOpenTilde);
    if (safePoint > 0) return safePoint;
  }

  // Check if the candidate falls inside a table
  const linesBeforeCut = beforeCut.split('\n');
  const lastLine = linesBeforeCut[linesBeforeCut.length - 1] ?? '';
  if (isTableRow(lastLine)) {
    // Move backward to before the table started
    for (let i = linesBeforeCut.length - 1; i >= 0; i--) {
      if (!isTableRow(linesBeforeCut[i])) {
        // Found the line before the table — compute its offset
        const offset = linesBeforeCut.slice(0, i + 1).join('\n').length + 1;
        if (offset > 0) return offset;
        break;
      }
    }
  }

  return candidate;
}

/**
 * Find a natural break point within [maxSize * 0.8, maxSize].
 * Prefers paragraph breaks > sentence-ending punctuation > space.
 */
function findBreakPoint(text: string, maxSize: number): number {
  const minPoint = Math.floor(maxSize * 0.7);

  // Try double newline first
  for (let i = maxSize; i >= minPoint; i--) {
    if (text[i] === '\n' && text[i - 1] === '\n') return i + 1;
  }

  // Try sentence-ending punctuation followed by space or newline
  const sentenceBreaks = /[。.!?！？]\s/g;
  let match: RegExpExecArray | null;
  let bestSentence = -1;

  sentenceBreaks.lastIndex = minPoint;
  while ((match = sentenceBreaks.exec(text)) !== null) {
    if (match.index > maxSize) break;
    bestSentence = match.index + 1; // after the punctuation
  }
  if (bestSentence > minPoint) return bestSentence;

  // Try any newline
  for (let i = maxSize; i >= minPoint; i--) {
    if (text[i] === '\n') return i + 1;
  }

  // Fallback: hard cut at maxSize, but try to land on a space
  for (let i = maxSize; i >= minPoint; i--) {
    if (text[i] === ' ') return i + 1;
  }

  return maxSize;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a chunker based on the configured strategy.
 *
 * - `'auto'` (default): tries MarkdownChunker; if no headings found, falls
 *   back to FixedSizeChunker.
 * - `'markdown'`: always uses heading-aware splitting.
 * - `'fixed'`: always uses fixed-size sliding window.
 */
export function createChunker(options?: ChunkingOptions): Chunker {
  const strategy = options?.strategy ?? 'auto';

  switch (strategy) {
    case 'markdown':
      return new MarkdownChunker(options);
    case 'fixed':
      return new FixedSizeChunker(options);
    case 'auto':
    default:
      return new AutoChunker(options);
  }
}

/** Auto-detect chunking strategy: markdown when headings exist, else fixed. */
class AutoChunker implements Chunker {
  private markdown: MarkdownChunker;
  private fixed: FixedSizeChunker;

  constructor(options?: ChunkingOptions) {
    this.markdown = new MarkdownChunker(options);
    this.fixed = new FixedSizeChunker(options);
  }

  chunk(doc: Document): Chunk[] {
    // If the document content contains markdown headings (## or ###), use
    // heading-aware chunking; otherwise fall back to fixed-size splits.
    if (/^#{1,3}\s+\S/m.test(doc.content)) {
      return this.markdown.chunk(doc);
    }
    return this.fixed.chunk(doc);
  }
}
