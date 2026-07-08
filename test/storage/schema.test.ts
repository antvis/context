import { describe, it, expect } from 'vitest';
import { buildZvecSchema } from '../../src/storage/schema';

describe('buildZvecSchema', () => {
  it('should create schema with correct vector dimension', () => {
    const schema = buildZvecSchema(384);
    const schemaStr = String(schema);

    expect(schemaStr).toContain('dimension: 384');
  });

  it('should create schema with HNSW index and COSINE metric', () => {
    const schema = buildZvecSchema(256);
    const schemaStr = String(schema);

    expect(schemaStr).toContain('HnswIndexParams');
    expect(schemaStr).toContain('metric:COSINE');
  });

  it('should include content field with FTS index and jieba tokenizer (default)', () => {
    const schema = buildZvecSchema(128, 'jieba');
    const schemaStr = String(schema);

    expect(schemaStr).toContain("name: 'content'");
    expect(schemaStr).toContain('FtsIndexParams');
    expect(schemaStr).toContain('tokenizer_name:jieba');
  });

  it('should accept custom tokenizer (standard)', () => {
    const schema = buildZvecSchema(128, 'standard');
    const schemaStr = String(schema);

    expect(schemaStr).toContain('tokenizer_name:standard');
  });

  it('should include meta, path, contentHash fields', () => {
    const schema = buildZvecSchema(256);
    const schemaStr = String(schema);

    expect(schemaStr).toContain("name: 'meta'");
    expect(schemaStr).toContain("name: 'path'");
    expect(schemaStr).toContain("name: 'contentHash'");
  });

  it('should use VECTOR_FP32 data type', () => {
    const schema = buildZvecSchema(256);
    const schemaStr = String(schema);

    expect(schemaStr).toContain('data_type: VECTOR_FP32');
  });
});