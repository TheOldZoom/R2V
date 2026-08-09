import { logger } from "./logger";

export enum LLMProvider {
  Gemini = "gemini",
}

export enum TTSProvider {
  Gemini = "gemini",
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

interface BaseTTSConfig {
  voice: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface GeminiTTSConfig extends BaseTTSConfig {
  provider: TTSProvider.Gemini;
  apiKey: string;
}

interface KokoroTTSConfig extends BaseTTSConfig {
  provider: TTSProvider.Kokoro;
}

interface GeminiTTSConfig {
  provider: TTSProvider.Gemini;
  voice: string;
  apiKey: string;
  model?: string;
}

interface KokoroTTSConfig {
  provider: TTSProvider.Kokoro;
  voice: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export type TTSConfig = GeminiTTSConfig | KokoroTTSConfig;

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

  logger.debug({ name }, "Loaded required environment variable");

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

  logger.debug({ name, value }, "Validated enum environment variable");

  return value as T[keyof T];
}

function loadTTSConfig(): TTSConfig {
  const provider = requireEnum("TTS_PROVIDER", TTSProvider);

  switch (provider) {
    case TTSProvider.Gemini:
      return {
        provider,
        voice: requireEnv("TTS_VOICE"),
        apiKey: requireEnv("TTS_API_KEY"),
        model: process.env.TTS_MODEL,
        baseUrl: process.env.TTS_BASE_URL,
      };

    case TTSProvider.Kokoro:
      return {
        provider,
        voice: process.env.TTS_VOICE ?? "af_alloy",
        apiKey: process.env.TTS_API_KEY,
        model: process.env.TTS_MODEL,
        baseUrl: process.env.TTS_BASE_URL,
      };

    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unsupported TTS provider: ${exhaustiveCheck}`);
    }
  }
}

logger.debug("Loading R2V configuration");

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

logger.debug({ subreddits }, "Parsed subreddit configuration");

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

  tts: loadTTSConfig(),

  llm: {
    provider: requireEnum("LLM_PROVIDER", LLMProvider),
    model: process.env.LLM_MODEL ?? "gemini-3.5-flash-lite",
    apiKey: requireEnv("LLM_API_KEY"),
  },
};

logger.debug(
  {
    video: config.video,
    reddit: {
      subredditCount: config.reddit.subreddits.length,
      userAgent: config.reddit.userAgent,
    },
    tts: {
      provider: config.tts.provider,
      voice: config.tts.voice,
      model: config.tts.model,
      hasApiKey: Boolean(config.tts.apiKey),
    },
    llm: {
      provider: config.llm.provider,
      model: config.llm.model,
      hasApiKey: Boolean(config.llm.apiKey),
    },
  },
  "R2V configuration loaded",
);
