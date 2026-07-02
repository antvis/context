import { pipeline, env, FeatureExtractionPipeline } from '@huggingface/transformers';
import * as path from 'path';
import * as fs from 'fs';

export class TransformerVectorizer {
  private pipeline: FeatureExtractionPipeline | null = null;

  constructor(
    private readonly model: string = 'sentence-transformers/all-MiniLM-L6-v2',
    private readonly dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'
  ) {}

  /**
   * 配置模型下载镜像
   * 通过环境变量设置: HF_ENDPOINT 或 HF_MIRROR
   * 常用镜像: https://hf-mirror.com
   */
  private configureMirror(): void {
    const mirror = process.env.HF_ENDPOINT || process.env.HF_MIRROR;
    if (mirror) env.remoteHost = mirror;
  }

  async initialize(): Promise<void> {
    this.configureMirror();

    // 查找本地缓存模型
    const cacheDir = path.join(process.env.HOME || '', '.cache/huggingface/models');
    let modelPath = this.model;

    if (fs.existsSync(cacheDir)) {
      const modelName = this.model.replace('sentence-transformers--', '').split('-').slice(0, 2).join('-');
      const localModel = fs.readdirSync(cacheDir).find(d => d.includes(modelName));
      if (localModel) modelPath = path.join(cacheDir, localModel);
    }

    this.pipeline = await pipeline('feature-extraction', modelPath, this.dtype ? { dtype: this.dtype } : undefined) as FeatureExtractionPipeline;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.pipeline) throw new Error('Pipeline not initialized');
    const output = await this.pipeline(text, { pooling: 'mean', normalize: true }) as unknown as { data: Float32Array };
    return Array.from(output.data);
  }
}