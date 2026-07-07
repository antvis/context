import * as crypto from 'crypto';

/**
 * Compute a short hash for change detection and ID generation.
 *
 * Uses SHA-256 truncated to 16 hex chars (64-bit) — compact enough
 * for zvec field storage and doc IDs, collision-resistant enough for dedup.
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}
