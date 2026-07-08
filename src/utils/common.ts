/**
 * Safely parse JSON string. Returns undefined on invalid JSON.
 */
export function safeJsonParse(str: string | undefined): unknown {
  if (!str) return undefined;
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}