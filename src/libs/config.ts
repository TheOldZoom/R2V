import { logger } from "./logger";

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
  clientId: string;
  clientSecret: string;
  userAgent: string;
}

interface TTSConfig {
  provider: TTSProvider;
  voice: string;
  apiKey?: string;
}

interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
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
    const message = `Missing required environment variable: ${name}`;

    logger.error(message);

    throw new Error(message);
  }

  return value;
}

function requireEnum<T extends Record<string, string>>(
  name: string,
  enumObject: T,
): T[keyof T] {
  const value = requireEnv(name);
  const values = Object.values(enumObject);

  if (!values.includes(value)) {
    const message = `Invalid value for ${name}: "${value}". Expected one of: ${values.join(", ")}`;

    logger.error(message);

    throw new Error(message);
  }

  return value as T[keyof T];
}

const subreddits = requireEnv("REDDIT_SUBREDDITS")
  .split(",")
  .map((entry) => {
    const [name, weightString] = entry.split(":");

    if (!name || !weightString) {
      const message = `Invalid subreddit configuration: "${entry}"`;

      logger.error(message);

      throw new Error(message);
    }

    const weight = Number(weightString);

    if (!Number.isFinite(weight) || weight < 0) {
      const message = `Invalid subreddit weight: "${entry}"`;

      logger.error(message);

      throw new Error(message);
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
    clientId: requireEnv("REDDIT_CLIENT_ID"),
    clientSecret: requireEnv("REDDIT_CLIENT_SECRET"),
    userAgent: process.env.REDDIT_USER_AGENT ?? "R2V/0.1.0",
  },

  tts: {
    provider: requireEnum("TTS_PROVIDER", TTSProvider),
    voice: process.env.TTS_VOICE ?? "",
    apiKey: process.env.TTS_API_KEY,
  },

  llm: {
    provider: requireEnum("LLM_PROVIDER", LLMProvider),
    model: process.env.LLM_MODEL ?? "gemini-2.5-flash-lite",
    apiKey: requireEnv("LLM_API_KEY"),
  },
};
