import * as fs from 'fs';
import * as path from 'path';

/**
 * DocumentRegistry — manages document metadata for each library.
 *
 * Tracks loaded document IDs along with their content hashes for
 * change-detection. When a document's content hash changes (e.g. the
 * file was edited), the dedup check will allow it to be re-embedded.
 */

/** Registry entry: document ID + content hash for change detection. */
interface RegistryEntry {
  id: string;
  /** SHA-256 hash of the document content (first 16 chars). Empty = legacy entry without hash. */
  contentHash: string;
}

export class DocumentRegistry {
  private readonly entries: Map<string, Map<string, RegistryEntry>> = new Map();

  /**
   * Check whether a document ID has already been loaded into a library,
   * optionally verifying that the content hash matches.
   *
   * - If `contentHash` is provided and the existing entry has a hash,
   *   returns `true` only when both the ID and hash match (unchanged file).
   * - If `contentHash` is provided but differs from the stored hash,
   *   returns `false` (file has been updated — needs re-embedding).
   * - If `contentHash` is not provided, returns `true` when the ID exists
   *   (legacy behaviour — no change detection).
   */
  has(library: string, id: string, contentHash?: string): boolean {
    const lib = this.entries.get(library);
    if (!lib) return false;

    const entry = lib.get(id);
    if (!entry) return false;

    // If hash is provided, do change detection
    if (contentHash !== undefined && entry.contentHash) {
      return entry.contentHash === contentHash;
    }

    // No hash provided or stored — just check existence
    return true;
  }

  /**
   * Register a document as loaded for a library, with its content hash.
   */
  add(library: string, id: string, contentHash?: string): void {
    let lib = this.entries.get(library);
    if (!lib) {
      lib = new Map();
      this.entries.set(library, lib);
    }
    lib.set(id, { id, contentHash: contentHash ?? '' });
  }

  /**
   * Get all loaded document IDs for a library.
   */
  getIds(library: string): Set<string> {
    const lib = this.entries.get(library);
    return lib ? new Set(lib.keys()) : new Set();
  }

  /**
   * Get all registry entries for a library (including content hashes).
   */
  getEntries(library: string): Map<string, RegistryEntry> {
    return this.entries.get(library) ?? new Map();
  }

  /**
   * Check whether a library has any loaded documents.
   */
  hasLibrary(library: string): boolean {
    return (this.entries.get(library)?.size ?? 0) > 0;
  }

  /**
   * Remove a specific document from a library's registry.
   */
  remove(library: string, id: string): void {
    this.entries.get(library)?.delete(id);
  }

  /**
   * Get all library names that have loaded documents.
   */
  getLibraryNames(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Remove all documents for a library.
   */
  removeLibrary(library: string): void {
    this.entries.delete(library);
  }

  /**
   * Persist registry state to disk (for process restart recovery).
   *
   * Format: `{ id, contentHash }` entries for change detection across
   * restarts.
   */
  saveToDisk(vectorsDir: string, library: string): void {
    const indexPath = path.join(vectorsDir, `${library}.index.json`);
    const lib = this.entries.get(library);
    if (!lib) {
      // No entries — write empty array
      fs.writeFileSync(indexPath, JSON.stringify([]));
      return;
    }
    const data = [...lib.values()];
    fs.writeFileSync(indexPath, JSON.stringify(data));
  }

  /**
   * Load registry state from disk.
   */
  loadFromDisk(vectorsDir: string, library: string): void {
    const indexPath = path.join(vectorsDir, `${library}.index.json`);
    if (fs.existsSync(indexPath)) {
      const raw: RegistryEntry[] | string[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      const lib = new Map<string, RegistryEntry>();

      for (const item of raw) {
        if (typeof item === 'string') {
          // Legacy format: plain ID strings (no content hash)
          lib.set(item, { id: item, contentHash: '' });
        } else {
          // New format: { id, contentHash } entries
          lib.set(item.id, item);
        }
      }

      this.entries.set(library, lib);
    }
  }
}
