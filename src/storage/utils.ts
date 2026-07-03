/**
 * ZvecStore utility functions.
 */

/** Cosine similarity between two vectors of equal length. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Evaluate a filter expression against document fields.
 *
 * Supports:
 *   - String equality:  `field = 'value'`
 *   - Number equality:  `field = 0`
 *   - AND conjunction:  `field = 'val1' AND field2 = 'val2'`
 *
 * Unknown / malformed expressions return true (pass-through) so that
 * MemoryZvecStore remains usable even when filters are only meant for
 * the native zvec engine.
 */
export function evalMemoryFilter(
  filter: string,
  fields: Record<string, string | number>
): boolean {
  // Split on AND (case-insensitive, with surrounding spaces)
  const clauses = filter.split(/\s+AND\s+/i);

  return clauses.every((clause) => evalSingleClause(clause.trim(), fields));
}

/**
 * Evaluate a single filter clause.
 *
 * Forms:
 *   `fieldName = 'stringVal'`  → string equality
 *   `fieldName = numericVal`   → number equality (coerces field to Number)
 */
function evalSingleClause(
  clause: string,
  fields: Record<string, string | number>
): boolean {
  // String equality: field = 'value'
  const stringMatch = clause.match(/^(\w+)\s*=\s*'([^']*)'$/);
  if (stringMatch) {
    const [, fieldName, expected] = stringMatch;
    return String(fields[fieldName] ?? '') === expected;
  }

  // Number equality: field = 0  (or any integer/float)
  const numberMatch = clause.match(/^(\w+)\s*=\s*(-?\d+(?:\.\d+)?)$/);
  if (numberMatch) {
    const [, fieldName, expected] = numberMatch;
    return Number(fields[fieldName]) === Number(expected);
  }

  // Unknown clause format — pass through (let native zvec handle it)
  return true;
}
