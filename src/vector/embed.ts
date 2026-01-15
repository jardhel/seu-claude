import { pipeline, Pipeline, env } from '@huggingface/transformers';
import { Config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { join } from 'path';

export class EmbeddingEngine {
  private embedder: Pipeline | null = null;
  private config: Config;
  private log = logger.child('embedder');
  private initialized = false;

  constructor(config: Config) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.log.info('Initializing embedding engine...');

    // Configure for local-only operation
    env.allowRemoteModels = true; // Allow initial download
    env.cacheDir = join(this.config.dataDir, 'models');

    try {
      // Try WebGPU first for hardware acceleration
      this.embedder = await pipeline('feature-extraction', this.config.embeddingModel, {
        dtype: 'q8', // Use quantized model for smaller memory footprint
        // device: 'webgpu', // Uncomment if WebGPU is available
      });

      this.log.info(`Embedding model loaded: ${this.config.embeddingModel}`);
      this.initialized = true;
    } catch (err) {
      this.log.error('Failed to initialize embedding engine:', err);
      throw err;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.embedder) {
      throw new Error('Embedding engine not initialized. Call initialize() first.');
    }

    try {
      // Prepend "search_document: " for nomic models (improves retrieval quality)
      const prefixedText = `search_document: ${text}`;

      const result = await this.embedder(prefixedText, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the embedding tensor and convert to array
      const embedding = Array.from(result.data as Float32Array);

      // Truncate to configured dimensions (Matryoshka truncation)
      return embedding.slice(0, this.config.embeddingDimensions);
    } catch (err) {
      this.log.error('Failed to generate embedding:', err);
      throw err;
    }
  }

  async embedBatch(texts: string[], batchSize = 32): Promise<number[][]> {
    if (!this.embedder) {
      throw new Error('Embedding engine not initialized. Call initialize() first.');
    }

    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const prefixedBatch = batch.map(t => `search_document: ${t}`);

      try {
        const results = await this.embedder(prefixedBatch, {
          pooling: 'mean',
          normalize: true,
        });

        // Process batch results
        const batchEmbeddings = this.extractBatchEmbeddings(results, batch.length);
        embeddings.push(...batchEmbeddings);

        this.log.debug(`Embedded batch ${i / batchSize + 1}/${Math.ceil(texts.length / batchSize)}`);
      } catch (err) {
        this.log.error(`Failed to embed batch starting at index ${i}:`, err);
        throw err;
      }
    }

    return embeddings;
  }

  private extractBatchEmbeddings(results: unknown, count: number): number[][] {
    const embeddings: number[][] = [];
    const data = (results as { data: Float32Array }).data;
    const dims = this.config.embeddingDimensions;
    const fullDims = data.length / count;

    for (let i = 0; i < count; i++) {
      const start = i * fullDims;
      const embedding = Array.from(data.slice(start, start + dims));
      embeddings.push(embedding);
    }

    return embeddings;
  }

  async embedQuery(query: string): Promise<number[]> {
    if (!this.embedder) {
      throw new Error('Embedding engine not initialized. Call initialize() first.');
    }

    try {
      // Prepend "search_query: " for queries (nomic model convention)
      const prefixedQuery = `search_query: ${query}`;

      const result = await this.embedder(prefixedQuery, {
        pooling: 'mean',
        normalize: true,
      });

      const embedding = Array.from(result.data as Float32Array);
      return embedding.slice(0, this.config.embeddingDimensions);
    } catch (err) {
      this.log.error('Failed to generate query embedding:', err);
      throw err;
    }
  }

  getDimensions(): number {
    return this.config.embeddingDimensions;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
