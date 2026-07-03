/**
 * zvec-store — aggregate entry point for all storage modules.
 *
 * Re-exports from the split files for backward compatibility:
 *   types.ts    → public types & interfaces
 *   memory-store.ts → MemoryZvecStore
 *   actual-store.ts → ActualZvecStore, factories, schema builder
 *   utils.ts    → cosineSimilarity, evalMemoryFilter
 */

export type {
  ZvecDoc,
  ZvecQueryResult,
  ZvecSearchParams,
  ZvecHybridParams,
  IZvecStore,
  FtsFieldWeight,
  ZvecFieldSchema,
  ZvecStoreConfig,
  ActualZvecStoreOptions,
} from './types';

export { MemoryZvecStore } from './memory-store';

export {
  ActualZvecStore,
  createZvecStore,
  openZvecStore,
  openZvecStoreSync,
  isZvecAvailable,
  buildZvecSchema,
} from './actual-store';

export { cosineSimilarity } from './utils';
