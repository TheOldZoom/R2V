import { basename } from "node:path";
import type { CaptionWord } from "../captions";
import { logger } from "../logger";

export interface WhisperCaptionOptions {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  language?: string;
}

interface WhisperWordResponse {
  word?: string;
  start?: number;
  end?: number;
}

interface WhisperVerboseResponse {
  words?: WhisperWordResponse[];
}

export class WhisperTranscriber {
  constructor(private readonly options: WhisperCaptionOptions) {}

  async transcribeWords(audioPath: string): Promise<CaptionWord[]> {
    const form = new FormData();
    form.append("file", Bun.file(audioPath), basename(audioPath));
    form.append("model", this.options.model ?? "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");

    if (this.options.language) {
      form.append("language", this.options.language);
    }

    const url = `${this.options.baseUrl.replace(/\/+$/, "")}/v1/audio/transcriptions`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.options.apiKey
        ? { Authorization: `Bearer ${this.options.apiKey}` }
        : undefined,
      body: form,
    });

    if (!response.ok) {
      throw new Error(
        `Whisper caption request failed (${response.status}): ${await response.text()}`,
      );
    }

    const result = (await response.json()) as WhisperVerboseResponse;
    const words = (result.words ?? [])
      .filter(
        (word) =>
          typeof word.word === "string" &&
          typeof word.start === "number" &&
          typeof word.end === "number" &&
          word.end > word.start,
      )
      .map((word) => ({
        text: word.word!.trim(),
        startSeconds: word.start!,
        endSeconds: word.end!,
      }))
      .filter((word) => word.text.length > 0);

    if (words.length === 0) {
      throw new Error(
        "Whisper returned no word timestamps. Enable WHISPER_WORD_TIMESTAMPS=true on the server.",
      );
    }

    logger.info(
      { audioPath, wordCount: words.length },
      "Received Whisper caption timings",
    );
    return words;
  }
}
