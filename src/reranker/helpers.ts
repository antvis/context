const WORD_BOUNDARY = /[\s\n.,;:!?，。！？、：；"'(（【《\-_]/;

export function tokenizeQuery(query: string): string[] {
  const tokens = query.split(/[\s,，。.!！？?、：:；;]+/).filter(Boolean);
  const result: string[] = [];
  for (const r of tokens) {
    result.push(r);
    if (/[一-鿿]{3,}/.test(r)) {
      for (let i = 0; i + 2 <= r.length; i++) result.push(r.slice(i, i + 2));
    }
  }
  return [...new Set(result)];
}

export function countOccurrences(text: string, sub: string): number {
  let count = 0, pos = 0;
  while ((pos = text.indexOf(sub, pos)) !== -1) { count++; pos += sub.length; }
  return count;
}

export function countTermMatches(text: string, term: string): number {
  let count = 0, pos = 0;
  while ((pos = text.indexOf(term, pos)) !== -1) {
    if (isWordBoundary(text, term, pos)) count++;
    pos += term.length;
  }
  return count;
}

export function isWordBoundary(text: string, term: string, pos?: number): boolean {
  const idx = pos ?? text.indexOf(term);
  if (idx === -1) return false;
  const before = idx === 0 || WORD_BOUNDARY.test(text[idx - 1]);
  const after = idx + term.length >= text.length || WORD_BOUNDARY.test(text[idx + term.length]);
  return before && after;
}