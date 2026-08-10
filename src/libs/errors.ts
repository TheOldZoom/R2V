export type PipelineStage =
  | "select-story"
  | "generate-script"
  | "generate-audio"
  | "transcribe-captions"
  | "select-media"
  | "render";

export class PipelineStageError extends Error {
  constructor(
    public readonly stage: PipelineStage,
    public override readonly cause: unknown,
  ) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`[${stage}] ${causeMessage}`);
    this.name = "PipelineStageError";

    if (cause instanceof Error && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

export async function withStage<T>(
  stage: PipelineStage,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PipelineStageError) {
      throw error;
    }

    throw new PipelineStageError(stage, error);
  }
}
