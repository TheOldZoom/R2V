export interface TTSGenerateOptions {
  text: string;
  outputPath: string;
}

export interface TTSResult {
  path: string;
  durationSeconds: number;
}

export interface TTSProviderClient {
  generate(options: TTSGenerateOptions): Promise<TTSResult>;
}
