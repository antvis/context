/**
 * String utilities.
 */

export function containsCJK(text: string): boolean {
  return /[一-鿿㐀-䶿豈-﫿]/.test(text);
}