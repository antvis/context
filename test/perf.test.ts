import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Context } from '../src/index';

const TEST_DIR = path.join(__dirname, '.test-tmp');
const NUM_FILES = 100;

describe('Context performance', () => {
  const perfTestDir = TEST_DIR + '-perf-test';

  afterAll(() => {
    if (fs.existsSync(perfTestDir)) {
      fs.rmSync(perfTestDir, { recursive: true, force: true });
    }
  });

  it('should load 100 random documents within acceptable time', async () => {
    // Create test fixtures directory
    const perfFixturesDir = path.join(__dirname, '.perf-test-fixtures');
    if (fs.existsSync(perfFixturesDir)) {
      fs.rmSync(perfFixturesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(perfFixturesDir, { recursive: true });

    try {
      // Generate 100 random markdown files with 5x longer content
      for (let i = 0; i < NUM_FILES; i++) {
        const content = `# Document ${i} - Performance Testing Content

This is random content number ${i}. This is a comprehensive performance test document
designed to simulate real-world usage patterns with substantial amounts of text content.
The document contains multiple paragraphs with various topics to ensure the embedding
and search operations are properly tested under realistic load conditions.

## Section 1: Introduction

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt
ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation
ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt
mollit anim id est laborum.

The quick brown fox jumps over the lazy dog. This is a classic pangram that contains
every letter of the English alphabet at least once. It is often used for testing
typewriters and computer keyboards. In the context of our performance testing, this
sample text serves as filler content to increase the document size and complexity.

## Section 2: Performance Considerations

Testing performance of loading ${i} documents into context requires careful consideration
of various factors. These include the computational overhead of embedding generation,
the I/O performance of reading files from disk, and the efficiency of vector storage
operations. Each of these components contributes to the overall execution time and
must be optimized for production use cases.

The keyword density for search optimization should be carefully calibrated. Too many
keywords can lead to overfitting and poor generalization, while too few can result
in suboptimal retrieval performance. Finding the right balance is crucial for building
effective semantic search systems.

## Section 3: Technical Details

Modern embedding models like BERT, Sentence Transformers, and other transformer-based
architectures provide high-quality semantic representations of text. These models
convert input text into dense vector representations that capture semantic meaning.
The dimensionality of these vectors typically ranges from 128 to 1024 dimensions,
depending on the specific model architecture and training objectives.

When performing similarity search, we typically use cosine similarity or Euclidean
distance to measure the semantic closeness between query and document vectors.
The search operation can be accelerated using various techniques including:
- Approximate Nearest Neighbor (ANN) algorithms
- Hierarchical Navigable Small World (HNSW) graphs
- Inverted File Index (IVF) with product quantization
- Locality-Sensitive Hashing (LSH)

## Section 4: Use Cases

Semantic search has numerous applications across different domains. In enterprise
settings, it enables employees to quickly find relevant documents, technical
specifications, and knowledge base articles. In e-commerce, it powers product
recommendations and visual search capabilities. In healthcare, it helps researchers
find relevant studies and clinical trial information.

The context system provides a flexible framework for building domain-specific search
applications. By supporting custom loaders, embedders, and rerankers, it can be
adapted to various content types and search requirements. The modular architecture
allows developers to swap out components as needed without major refactoring.

## Section 5: Optimization Strategies

Several optimization strategies can improve the performance of semantic search systems:

1. **Caching**: Pre-computed embeddings can be cached to avoid redundant computation.
2. **Batching**: Processing multiple documents in a batch improves throughput.
3. **Parallelization**: Using multiple CPU cores or GPU acceleration speeds up processing.
4. **Incremental Updates**: Only reprocessing changed documents reduces overhead.
5. **Compression**: Quantizing vectors reduces memory usage and improves cache efficiency.

## Section 6: Random Data Section

More random text here with keywords: performance, test, load, document, context.
Keyword density for search optimization ${Math.random().toString(36).substring(7)}.
Additional padding content to increase file size for more realistic testing scenarios.
The variety of content helps ensure the embedding model handles diverse text properly.
Each document should contain enough variation to simulate complex real-world data.

## Section 7: Additional Content

Here is some more filler content to further increase the document length and ensure
our performance tests are comprehensive. We want to make sure that the system
can handle not just small documents but also larger ones that contain significant
amounts of text. This is important for production systems that process diverse content.

The embedding process converts this text into numerical representations that capture
semantic meaning. Modern transformer models excel at this task because they have
been pre-trained on massive amounts of text data and can understand contextual
relationships between words and phrases. This deep understanding enables nuanced
semantic matching that goes beyond simple keyword search.

## Section 8: Conclusion

In conclusion, performance testing is a critical aspect of building robust search
systems. By simulating realistic workloads and measuring actual performance metrics,
we can identify bottlenecks and optimize accordingly. The test document serves
as a valuable tool for validating the system's ability to handle large-scale
content processing efficiently and effectively.

This concludes our comprehensive test document. The content has been expanded
to approximately five times the original length to provide a more realistic
benchmark for performance evaluation. The additional sections include various
types of content that simulate different document structures and complexities.

## Section 9: Final Notes

Additional paragraph to further increase document length. Understanding the
performance characteristics of your search system is essential for production
deployment. Consider monitoring key metrics like latency, throughput, and resource
utilization to ensure optimal user experience.

## Section 10: Extra Content

Even more content here. The random string for testing is: ${Math.random().toString(36).substring(7)}.
This helps add some variability to the content while keeping the document structure
consistent across all test files. Performance testing is an ongoing process that
should be integrated into the development workflow.
`;
        fs.writeFileSync(path.join(perfFixturesDir, `doc-${i}.md`), content);
      }

      const ctx = await Context.create({
        vectorsDir: perfTestDir,
      });

      // Measure load time
      const startTime = Date.now();
      await ctx.load('perf', path.join(perfFixturesDir, '*.md'));
      const endTime = Date.now();

      const loadTimeMs = endTime - startTime;
      console.log(`\nPerformance: Loaded ${NUM_FILES} documents in ${loadTimeMs}ms`);

      // Verify documents were loaded
      const results = await ctx.query('test', { library: 'perf', topK: 50 });
      expect(results.length).toBeGreaterThan(0);

      // Performance assertion: should load 100 docs in under 60 seconds
      // This is a reasonable expectation for local embeddings with longer content
      expect(loadTimeMs).toBeLessThan(60000);

      // Log detailed timing
      console.log(`Average time per document: ${(loadTimeMs / NUM_FILES).toFixed(2)}ms`);

      await ctx.close();
    } finally {
      // Cleanup fixtures
      if (fs.existsSync(perfFixturesDir)) {
        fs.rmSync(perfFixturesDir, { recursive: true, force: true });
      }
    }
  });
});