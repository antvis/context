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
 */
function fixedSizeSplit(
  text: string,
  maxSize: number,
  overlap: number,
): string[] {
  const paragraphs = text.split(/\n\n+/);
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
        // Single paragraph is larger than maxSize — force split
        current = trimmed;
        while (current.length > maxSize) {
          // Try to break at a sentence boundary (。.!?。！？\n)
          let cutPoint = findBreakPoint(current, maxSize);
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
