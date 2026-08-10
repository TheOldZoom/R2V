import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { logger } from "./logger";

export type CaptionStyleName = "bold" | "minimal";

export interface CaptionStyle {
  name?: CaptionStyleName;
  fontFamily?: string;
  fontSize?: number;
  primaryColor?: string;
  secondaryColor?: string;
  outlineColor?: string;
  marginBottom?: number;
  maxWordsPerCaption?: number;
  animated?: boolean;
}

export interface CaptionWord {
  text: string;
  startSeconds: number;
  endSeconds: number;
}
export interface CaptionPhrase {
  words: CaptionWord[];
  startSeconds: number;
  endSeconds: number;
}
export interface CaptionDocument {
  words: CaptionWord[];
  phrases: CaptionPhrase[];
  durationSeconds: number;
}

export interface CaptionTimingOptions {
  pauses?: number[];
  offsetSeconds?: number;
}

const DEFAULT_STYLE: Required<CaptionStyle> = {
  name: "bold",
  fontFamily: "JetBrains Mono",
  fontSize: 72,
  primaryColor: "#FFD700",
  secondaryColor: "#FFFFFF",
  outlineColor: "#000000",
  marginBottom: 220,
  maxWordsPerCaption: 4,
  animated: true,
};
const MIN_WORD_DURATION_SECONDS = 0.08;

export function generateCaptionTimestamps(
  text: string,
  durationSeconds: number,
  style: CaptionStyle = {},
  timing: CaptionTimingOptions = {},
): CaptionDocument {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error("Caption duration must be a positive number");
  const words = text.match(/\S+/g) ?? [];
  if (words.length === 0)
    throw new Error("Cannot generate captions for empty text");
  const pauseAfterWord = mapPausesToPunctuation(words, timing.pauses ?? []);
  const totalPauseDuration = pauseAfterWord.reduce(
    (sum, pause) => sum + pause,
    0,
  );
  const weights = words.map((word) =>
    Math.max(1, word.replace(/[^\p{L}\p{N}]/gu, "").length),
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const remainingDuration = Math.max(
    0,
    durationSeconds -
      totalPauseDuration -
      words.length * MIN_WORD_DURATION_SECONDS,
  );
  const offsetSeconds = timing.offsetSeconds ?? 0;
  let cursor = offsetSeconds;
  const timedWords = words.map((word, index) => {
    const wordDuration =
      MIN_WORD_DURATION_SECONDS +
      remainingDuration * ((weights[index] ?? 1) / totalWeight);
    const startSeconds = cursor;
    const endSeconds = cursor + wordDuration;
    cursor = endSeconds + (pauseAfterWord[index] ?? 0);
    return { text: word, startSeconds, endSeconds };
  });
  const finalWord = timedWords.at(-1);
  if (finalWord) finalWord.endSeconds = durationSeconds + offsetSeconds;
  const phrases = groupPhrases(
    timedWords,
    resolveCaptionStyle(style).maxWordsPerCaption,
  );
  logger.debug(
    {
      wordCount: timedWords.length,
      phraseCount: phrases.length,
      durationSeconds,
      totalPauseDuration,
      offsetSeconds,
    },
    "Generated caption timestamps",
  );
  return { words: timedWords, phrases, durationSeconds };
}

export async function writeAssCaptions(
  captions: CaptionDocument,
  outputPath: string,
  style: CaptionStyle = {},
): Promise<string> {
  const resolvedStyle = resolveCaptionStyle(style);
  await mkdir(dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, renderAss(captions, resolvedStyle));
  logger.info(
    {
      outputPath,
      phraseCount: captions.phrases.length,
      style: resolvedStyle.name,
    },
    "Wrote ASS captions",
  );
  return outputPath;
}

export async function createCaptionFile(options: {
  text: string;
  durationSeconds: number;
  outputPath: string;
  style?: CaptionStyle;
  audioPath?: string;
  offsetSeconds?: number;
  wordTimings?: CaptionWord[];
}): Promise<CaptionDocument> {
  const captions = options.wordTimings?.length
    ? createCaptionDocumentFromWords(
        options.wordTimings,
        options.durationSeconds,
        options.style,
        options.offsetSeconds,
      )
    : generateCaptionTimestamps(
        options.text,
        options.durationSeconds,
        options.style,
        {
          pauses: options.audioPath
            ? await detectNarrationPauses(
                options.audioPath,
                options.durationSeconds,
              )
            : [],
          offsetSeconds: options.offsetSeconds,
        },
      );
  await writeAssCaptions(captions, options.outputPath, options.style);
  return captions;
}

function createCaptionDocumentFromWords(
  wordTimings: CaptionWord[],
  durationSeconds: number,
  style: CaptionStyle | undefined,
  offsetSeconds = 0,
): CaptionDocument {
  const words = wordTimings
    .filter(
      (word) =>
        word.text.trim().length > 0 &&
        Number.isFinite(word.startSeconds) &&
        Number.isFinite(word.endSeconds) &&
        word.endSeconds > word.startSeconds,
    )
    .map((word) => ({
      text: word.text.trim(),
      startSeconds: Math.max(0, word.startSeconds + offsetSeconds),
      endSeconds: Math.max(0, word.endSeconds + offsetSeconds),
    }));

  if (words.length === 0) {
    throw new Error("No valid Whisper caption words were provided");
  }

  const phrases = groupPhrases(
    words,
    resolveCaptionStyle(style ?? {}).maxWordsPerCaption,
  );
  logger.info(
    { wordCount: words.length, phraseCount: phrases.length },
    "Created captions from Whisper word timings",
  );
  return { words, phrases, durationSeconds };
}

async function detectNarrationPauses(
  audioPath: string,
  durationSeconds: number,
): Promise<number[]> {
  try {
    const process = Bun.spawn(
      [
        "ffmpeg",
        "-hide_banner",
        "-i",
        audioPath,
        "-af",
        "silencedetect=noise=-35dB:d=0.10",
        "-f",
        "null",
        "-",
      ],
      { stdout: "ignore", stderr: "pipe" },
    );
    const stderr = await new Response(process.stderr).text();

    if ((await process.exited) !== 0) {
      throw new Error("ffmpeg silencedetect failed");
    }

    const pauses = [
      ...stderr.matchAll(
        /silence_start:\s*([\d.]+)[\s\S]*?silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g,
      ),
    ]
      .map((match) => ({
        start: Number(match[1]),
        end: Number(match[2]),
        duration: Number(match[3]),
      }))
      .filter(
        (pause) =>
          Number.isFinite(pause.duration) &&
          pause.duration >= 0.1 &&
          pause.start > 0.05 &&
          pause.end < durationSeconds - 0.05,
      )
      .map((pause) => pause.duration);

    logger.debug({ audioPath, pauses }, "Detected narration pauses");
    return pauses;
  } catch (error) {
    logger.warn(
      {
        audioPath,
        error: error instanceof Error ? error.message : String(error),
      },
      "Could not analyze narration pauses; using estimated caption timings",
    );
    return [];
  }
}

function mapPausesToPunctuation(words: string[], pauses: number[]): number[] {
  const mapped = Array.from<number>({ length: words.length }).fill(0);
  const punctuationIndexes = words
    .map((word, index) => (/[.!?;,]$/.test(word) ? index : -1))
    .filter((index) => index >= 0);

  for (const [index, pause] of pauses.entries()) {
    const wordIndex = punctuationIndexes[index];
    if (wordIndex === undefined) break;
    mapped[wordIndex] = pause;
  }

  return mapped;
}

function resolveCaptionStyle(style: CaptionStyle): Required<CaptionStyle> {
  const preset =
    style.name === "minimal"
      ? {
          fontSize: 58,
          primaryColor: "#FFFFFF",
          secondaryColor: "#FFFFFF",
          outlineColor: "#000000",
          marginBottom: 180,
          animated: false,
        }
      : {};
  const resolved = { ...DEFAULT_STYLE, ...preset, ...style };
  if (
    !Number.isInteger(resolved.maxWordsPerCaption) ||
    resolved.maxWordsPerCaption < 1
  )
    throw new Error("maxWordsPerCaption must be a positive integer");
  return resolved;
}

function groupPhrases(
  words: CaptionWord[],
  maxWordsPerCaption: number,
): CaptionPhrase[] {
  const phrases: CaptionPhrase[] = [];
  let phrase: CaptionWord[] = [];
  for (const word of words) {
    phrase.push(word);
    if (phrase.length >= maxWordsPerCaption || /[.!?]$/.test(word.text)) {
      phrases.push({
        words: phrase,
        startSeconds: phrase[0]?.startSeconds ?? 0,
        endSeconds: phrase.at(-1)?.endSeconds ?? 0,
      });
      phrase = [];
    }
  }
  if (phrase.length)
    phrases.push({
      words: phrase,
      startSeconds: phrase[0]?.startSeconds ?? 0,
      endSeconds: phrase.at(-1)?.endSeconds ?? 0,
    });
  return phrases;
}

function renderAss(
  captions: CaptionDocument,
  style: Required<CaptionStyle>,
): string {
  const styleLine = [
    "Style: Captions",
    assEscape(style.fontFamily),
    style.fontSize,
    assColor(style.primaryColor),
    assColor(style.secondaryColor),
    "&H00000000",
    assColor(style.outlineColor),
    "-1",
    "0",
    "0",
    "0",
    "100",
    "100",
    "0",
    "0",
    "1",
    "3",
    "1",
    "2",
    "80",
    "80",
    style.marginBottom,
    "1",
  ].join(",");
  const events = captions.phrases.map((phrase) => {
    const animation = style.animated
      ? "\\an2\\fscx88\\fscy88\\fad(100,100)\\t(0,100,\\fscx100\\fscy100)"
      : "\\an2";
    const text = phrase.words
      .map(
        (word) =>
          `{\\kf${Math.max(1, Math.round((word.endSeconds - word.startSeconds) * 100))}}${assEscape(word.text)}`,
      )
      .join(" ");
    return `Dialogue: 0,${assTime(phrase.startSeconds)},${assTime(phrase.endSeconds)},Captions,,0,0,0,,{${animation}}${text}`;
  });
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    styleLine,
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ...events,
    "",
  ].join("\n");
}

function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}
function assColor(hex: string): string {
  const value = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(value))
    throw new Error(`Invalid caption color: ${hex}. Use a #RRGGBB value.`);
  return `&H00${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}&`;
}
function assEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[{}]/g, "");
}
