import type { LLMProviderClient } from "./llm/types";
import { logger } from "./logger";

export interface NarrationSource {
  title: string;
  body: string;
}

const NARRATION_SYSTEM_PROMPT = `You write narration scripts for short-form vertical videos based on Reddit posts.
Rewrite the story as a spoken narration script: natural, conversational sentences meant to be read aloud.
Do not include markdown, headers, or stage directions. Do not mention Reddit, upvotes, or usernames.
Keep it tight and engaging — cut anything that doesn't move the story forward.
End the narration something like: "What do you think about this? Leave a comment, like this video and see you in the next one."`;

export async function generateNarrationScript(
  llm: LLMProviderClient,
  source: NarrationSource,
): Promise<string> {
  const startedAt = Date.now();
  const prompt = `Title: ${source.title}\n\nStory:\n${source.body}`;

  logger.debug(
    {
      title: source.title,
      bodyLength: source.body.length,
      promptLength: prompt.length,
    },
    "Generating narration script",
  );

  const { text } = await llm.generate({
    prompt,
    systemPrompt: NARRATION_SYSTEM_PROMPT,
  });

  const script = text.trim();

  logger.debug(
    {
      title: source.title,
      scriptLength: script.length,
      totalMs: Date.now() - startedAt,
    },
    "Narration script generation complete",
  );

  return script;
}
