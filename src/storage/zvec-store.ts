/**
 * zvec-store — aggregate entry point for all storage modules.
 *
 * Re-exports from the split files for backward compatibility:
 *   types.ts        → public types & interfaces
 *   actual-store.ts → ActualZvecStore, factories, schema builder
 *   utils.ts        → cosineSimilarity
 */

export type {
  ZvecDoc,
  ZvecQueryResult,
  ZvecSearchParams,
  ZvecHybridParams,
  IZvecStore,
  ZvecFieldSchema,
  ZvecStoreConfig,
  ActualZvecStoreOptions,
} from './types';

export {
  ActualZvecStore,
  createZvecStore,
  openZvecStore,
  openZvecStoreSync,
  isZvecAvailable,
  buildZvecSchema,
} from './actual-store';

export { cosineSimilarity } from './utils';
