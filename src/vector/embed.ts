import { pipeline, FeatureExtractionPipeline, env } from '@huggingface/transformers';
import { Config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { access, mkdir, readdir } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Model configuration - default to model that doesn't require auth
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
const DEFAULT_DIMENSIONS = 384;

// Supported models (in order of preference for auto-detection)
const SUPPORTED_MODELS = [
  { name: 'all-MiniLM-L6-v2', hfName: 'Xenova/all-MiniLM-L6-v2', dims: 384 },
  { name: 'bge-small-en-v1.5', hfName: 'Xenova/bge-small-en-v1.5', dims: 384 },
  { name: 'nomic-embed-text-v1.5', hfName: 'Xenova/nomic-embed-text-v1.5', dims: 768 },
];

export class EmbeddingEngine {
  private embedder: FeatureExtractionPipeline | null = null;
  private config: Config;
  private log = logger.child('embedder');
  private initialized = false;
  private actualDimensions: number | null = null; // Set during initialization

  constructor(config: Config) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.log.info('Initializing embedding engine...');

    // Set up model caching directory - use project data dir for persistence
    const modelCacheDir = join(this.config.dataDir, 'models');
    await mkdir(modelCacheDir, { recursive: true });

    // Check for bundled model first (for fully offline distribution)
    const bundledModelsDir = join(__dirname, '../../models');
    const bundledModel = await this.findBundledModel(bundledModelsDir);

    // Configure transformers.js environment
    let modelId: string;
    let modelSource: string;

    if (bundledModel) {
      // Use bundled local model (no network required)
      this.log.info(`Using bundled local model: ${bundledModel.name}`);
      env.localModelPath = bundledModelsDir;
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      modelId = bundledModel.name;
      modelSource = 'bundled';
      this.actualDimensions = bundledModel.dims;
    } else {
      // Use HuggingFace cache - model will be downloaded on first use
      this.log.info('Using HuggingFace model (will download on first use)');
      env.cacheDir = modelCacheDir;
      env.allowRemoteModels = true;
      env.allowLocalModels = true;

      // Use configured model or default
      modelId = this.config.embeddingModel || DEFAULT_MODEL;
      modelSource = 'huggingface';

      // Find dimensions for this model
      const modelInfo = SUPPORTED_MODELS.find(m => m.hfName === modelId || m.name === modelId);
      this.actualDimensions =
        modelInfo?.dims || this.config.embeddingDimensions || DEFAULT_DIMENSIONS;
    }

    try {
      this.log.info(`Loading embedding model: ${modelId}`);
      if (modelSource === 'huggingface') {
        this.log.info('(First run may take 1-2 minutes to download the model)');
      }

      this.embedder = await pipeline('feature-extraction', modelId, {
        dtype: 'q8', // Use quantized model for smaller memory footprint
      });

      this.log.info(`Embedding model loaded successfully: ${modelId}`);
      this.log.info(`Embedding dimensions: ${this.actualDimensions}`);
      this.initialized = true;
    } catch (err) {
      this.log.error('Failed to initialize embedding engine:', err);
      this.log.error('');
      this.log.error('Troubleshooting:');
      this.log.error('1. Check your internet connection (model downloads from HuggingFace)');
      this.log.error('2. Run: npm run download-model (to pre-download the model)');
      this.log.error('3. If using nomic model, you may need HF_TOKEN for authentication');
      this.log.error('');
      throw err;
    }
  }

  private async findBundledModel(
    modelsDir: string
  ): Promise<{ name: string; dims: number } | null> {
    try {
      const entries = await readdir(modelsDir);

      // Check each supported model in order of preference
      for (const model of SUPPORTED_MODELS) {
        if (entries.includes(model.name)) {
          // Verify it has required files
          const modelPath = join(modelsDir, model.name);
          try {
            await access(join(modelPath, 'config.json'));
            await access(join(modelPath, 'tokenizer.json'));
            return { name: model.name, dims: model.dims };
          } catch {
            // Model directory exists but incomplete
            continue;
          }
        }
      }
      return null;
    } catch {
      return null;
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

      // Truncate to effective dimensions (supports Matryoshka truncation)
      return embedding.slice(0, this.getEffectiveDimensions());
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

        this.log.debug(
          `Embedded batch ${i / batchSize + 1}/${Math.ceil(texts.length / batchSize)}`
        );
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
    const dims = this.getEffectiveDimensions();
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
      return embedding.slice(0, this.getEffectiveDimensions());
    } catch (err) {
      this.log.error('Failed to generate query embedding:', err);
      throw err;
    }
  }

  /**
   * Get effective embedding dimensions (supports Matryoshka truncation).
   * If configured dimensions are smaller than model's native dimensions, use configured.
   */
  private getEffectiveDimensions(): number {
    if (this.config.embeddingDimensions && this.config.embeddingDimensions < (this.actualDimensions ?? Infinity)) {
      return this.config.embeddingDimensions;
    }
    return this.actualDimensions ?? this.config.embeddingDimensions;
  }

  getDimensions(): number {
    // Return effective dimensions (truncated if configured)
    return this.getEffectiveDimensions();
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
