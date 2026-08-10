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

export interface CaptionsConfig {
  style: "bold" | "minimal";
  fontFamily: string;
  fontFile?: string;
  fontSize: number;
  primaryColor: string;
  secondaryColor: string;
  outlineColor: string;
  marginBottom: number;
  maxWordsPerCaption: number;
  animated: boolean;
  timingOffsetSeconds: number;
}

export interface WhisperCaptionConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  language?: string;
}

export interface RedditSubreddit {
  name: string;
  weight: number;
}

export interface RedditConfig {
  subreddits: RedditSubreddit[];
  userAgent: string;
  listing: "hot" | "new" | "top";
  fetchLimit: number;
  minBodyLength: number;
  blockedTerms: string[];
  chocodataApiKey?: string;
  chocodataBaseUrl: string;
  topTimeframe: "day" | "week" | "month" | "year" | "all";
  detailLimit: number;
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
  captions: CaptionsConfig;
  whisperCaptions: WhisperCaptionConfig;
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

const redditListing = process.env.REDDIT_LISTING ?? "hot";
const redditTopTimeframe = process.env.REDDIT_TOP_TIMEFRAME ?? "week";

if (
  redditListing !== "hot" &&
  redditListing !== "new" &&
  redditListing !== "top"
) {
  throw new Error(
    `Invalid REDDIT_LISTING: "${redditListing}". Expected hot, new, or top.`,
  );
}

if (!["day", "week", "month", "year", "all"].includes(redditTopTimeframe)) {
  throw new Error(`Invalid REDDIT_TOP_TIMEFRAME: "${redditTopTimeframe}"`);
}

export const config: R2VConfig = {
  video: {
    width: Number(process.env.VIDEO_WIDTH ?? 1080),
    height: Number(process.env.VIDEO_HEIGHT ?? 1920),
    fps: Number(process.env.VIDEO_FPS ?? 30),
  },

  captions: {
    style: process.env.CAPTION_STYLE === "minimal" ? "minimal" : "bold",
    fontFamily: process.env.CAPTION_FONT_FAMILY ?? "Arial",
    fontFile: process.env.CAPTION_FONT_FILE,
    fontSize: Number(process.env.CAPTION_FONT_SIZE ?? 72),
    primaryColor: process.env.CAPTION_PRIMARY_COLOR ?? "#FFD700",
    secondaryColor: process.env.CAPTION_SECONDARY_COLOR ?? "#FFFFFF",
    outlineColor: process.env.CAPTION_OUTLINE_COLOR ?? "#000000",
    marginBottom: Number(process.env.CAPTION_MARGIN_BOTTOM ?? 220),
    maxWordsPerCaption: Number(process.env.CAPTION_MAX_WORDS ?? 4),
    animated: process.env.CAPTION_ANIMATED !== "false",
    timingOffsetSeconds: Number(process.env.CAPTION_TIMING_OFFSET_SECONDS ?? 0),
  },

  whisperCaptions: {
    baseUrl: process.env.WHISPER_BASE_URL ?? "http://127.0.0.1:9000",
    apiKey: process.env.WHISPER_API_KEY,
    model: process.env.WHISPER_MODEL ?? "whisper-1",
    language: process.env.WHISPER_LANGUAGE,
  },

  reddit: {
    subreddits,
    userAgent: process.env.REDDIT_USER_AGENT ?? "R2V/0.1.0",
    listing: redditListing,
    fetchLimit: Number(process.env.REDDIT_FETCH_LIMIT ?? 50),
    minBodyLength: Number(process.env.REDDIT_MIN_BODY_LENGTH ?? 80),
    blockedTerms: (process.env.REDDIT_BLOCKED_TERMS ?? "")
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean),
    chocodataApiKey: process.env.CHOCODATA_API_KEY,
    chocodataBaseUrl:
      process.env.CHOCODATA_BASE_URL ?? "https://api.chocodata.com",
    topTimeframe: redditTopTimeframe as RedditConfig["topTimeframe"],
    detailLimit: Number(process.env.CHOCODATA_DETAIL_LIMIT ?? 10),
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
      listing: config.reddit.listing,
      fetchLimit: config.reddit.fetchLimit,
      blockedTermCount: config.reddit.blockedTerms.length,
      chocodataBaseUrl: config.reddit.chocodataBaseUrl,
      hasChocodataApiKey: Boolean(config.reddit.chocodataApiKey),
    },
    captions: config.captions,
    whisperCaptions: {
      baseUrl: config.whisperCaptions.baseUrl,
      model: config.whisperCaptions.model,
      language: config.whisperCaptions.language,
      hasApiKey: Boolean(config.whisperCaptions.apiKey),
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
