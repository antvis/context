/**
 * Zvec schema builder.
 */

import type { ZvecFieldSchema } from './types';

import { ZVecCollectionSchema, ZVecDataType, ZVecIndexType, ZVecMetricType } from '@zvec/zvec';

const FIELD_TYPES = {
  STRING: ZVecDataType.STRING,
  INT64: ZVecDataType.INT64,
  FLOAT: ZVecDataType.FLOAT,
  VECTOR_FP32: ZVecDataType.VECTOR_FP32,
};

const INDEX_TYPES = {
  FTS: ZVecIndexType.FTS,
  INVERT: ZVecIndexType.INVERT,
  HNSW: ZVecIndexType.HNSW,
};

export function buildZvecSchema(dims: number, tokenizerName: string = 'jieba'): ZVecCollectionSchema {
  const fields: ZvecFieldSchema[] = [
    { name: 'content', dataType: 'STRING', indexType: 'FTS', indexOptions: { tokenizerName } },
    { name: 'meta', dataType: 'STRING' },
    { name: 'path', dataType: 'STRING' },
    { name: 'contentHash', dataType: 'STRING' },
  ];

  return new ZVecCollectionSchema({
    name: 'context_docs',
    vectors: {
      name: 'embedding',
      dataType: ZVecDataType.VECTOR_FP32,
      dimension: dims,
      indexParams: {
        indexType: ZVecIndexType.HNSW,
        metricType: ZVecMetricType.COSINE,
        m: 32,
        efConstruction: 200,
      },
    },
    fields: fields.map((f: ZvecFieldSchema) => ({
      name: f.name,
      dataType: FIELD_TYPES[f.dataType],
      ...(f.indexType && f.indexType !== 'NONE' && INDEX_TYPES[f.indexType]
        ? { indexParams: { indexType: INDEX_TYPES[f.indexType], ...f.indexOptions } as never }
        : {}),
    })) as never,
  }) as ZVecCollectionSchema;
}