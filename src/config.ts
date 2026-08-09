export enum LLMProvider {
  Gemini = "gemini",
  Groq = "groq",
  OpenRouter = "openrouter",
  Ollama = "ollama",
}

export enum TTSProvider {
  ElevenLabs = "elevenlabs",
  Google = "google",
  Kokoro = "kokoro",
}

interface VideoConfig {
  width: number;
  height: number;
  fps: number;
}

interface RedditSubreddit {
  name: string;
  weight: number;
}

interface RedditConfig {
  subreddits: RedditSubreddit[];
}

interface TTSConfig {
  provider: TTSProvider;
  voice: string;
}

interface LLMConfig {
  provider: LLMProvider;
  model: string;
}

export interface R2VConfig {
  video: VideoConfig;
  reddit: RedditConfig;
  tts: TTSConfig;
  llm: LLMConfig;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function requireEnum<T extends Record<string, string>>(
  name: string,
  enumObject: T,
): T[keyof T] {
  const value = requireEnv(name);

  if (!Object.values(enumObject).includes(value)) {
    throw new Error(
      `Invalid value for ${name}: "${value}". Expected one of: ${Object.values(enumObject).join(", ")}`,
    );
  }

  return value as T[keyof T];
}

const subreddits = requireEnv("REDDIT_SUBREDDITS")
  .split(",")
  .map((entry) => {
    const [name, weightString] = entry.split(":");

    if (!name || !weightString) {
      throw new Error(`Invalid subreddit configuration: "${entry}"`);
    }

    const weight = Number(weightString);

    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(`Invalid subreddit weight: "${entry}"`);
    }

    return {
      name,
      weight,
    };
  });

export const config: R2VConfig = {
  video: {
    width: Number(process.env.VIDEO_WIDTH ?? 1080),
    height: Number(process.env.VIDEO_HEIGHT ?? 1920),
    fps: Number(process.env.VIDEO_FPS ?? 30),
  },

  reddit: {
    subreddits,
  },

  tts: {
    provider: requireEnum("TTS_PROVIDER", TTSProvider),
    voice: process.env.TTS_VOICE ?? "",
  },

  llm: {
    provider: requireEnum("LLM_PROVIDER", LLMProvider),
    model: process.env.LLM_MODEL ?? "gemini-2.5-flash-lite",
  },
};
