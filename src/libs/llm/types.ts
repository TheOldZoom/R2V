export interface LLMGenerateOptions {
  prompt: string;
  systemPrompt?: string;
}

export interface LLMResult {
  text: string;
}

export interface LLMProviderClient {
  generate(options: LLMGenerateOptions): Promise<LLMResult>;
}
