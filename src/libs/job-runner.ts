import { config } from "./config";
import { createCaptionFile } from "./captions";
import { tempDirForJob } from "./cleanup";
import type { JobRow } from "./db";
import { withStage } from "./errors";
import { FFmpeg } from "./ffmpeg";
import type { LLMProviderClient } from "./llm/types";
import { logger } from "./logger";
import { selectRandomMusic, selectRandomVideo } from "./media-selector";
import { generateNarrationScript } from "./narration";
import { ChocodataClient, selectRedditStory } from "./reddit";
import { VideoRenderer } from "./renderer";
import type { TTSProviderClient } from "./tts/types";
import { WhisperTranscriber } from "./transcription";

export interface JobRunnerDeps {
  llm: LLMProviderClient;
  tts: TTSProviderClient;
}

export interface JobResult {
  outputPath: string;
  title: string;
  redditPostId: string;
  redditSubreddit: string;
  redditPermalink: string;
  scriptLength: number;
  durationSeconds: number;
}

const OUTPUT_VIDEO_ROOT = "output/videos";

export async function runJob(
  job: JobRow,
  deps: JobRunnerDeps,
): Promise<JobResult> {
  const jobLog = logger.child({ jobId: job.id, attempt: job.attempts });
  const tmpDir = tempDirForJob(job.id);
  const startedAt = Date.now();

  jobLog.info("Job started");

  const redditStory = await withStage("select-story", async () => {
    jobLog.debug("Selecting Reddit source story");
    const story = await selectRedditStory(
      new ChocodataClient(config.reddit),
      config.reddit,
    );
    jobLog.info(
      {
        redditPostId: story.id,
        subreddit: story.subreddit,
        storyScore: story.storyScore,
        permalink: story.permalink,
      },
      "Selected Reddit source story",
    );
    return story;
  });

  const script = await withStage("generate-script", async () => {
    jobLog.debug("Generating narration script");
    const text = await generateNarrationScript(deps.llm, {
      title: redditStory.title,
      body: redditStory.body,
    });
    jobLog.info({ scriptLength: text.length }, "Narration script generated");
    return text;
  });

  const narration = await withStage("generate-audio", async () => {
    jobLog.debug("Generating narration audio");
    const result = await deps.tts.generate({
      text: script,
      outputPath: `${tmpDir}/narration.wav`,
    });
    jobLog.info(
      { durationSeconds: result.durationSeconds },
      "Narration audio generated",
    );
    return result;
  });

  const captions = await withStage("transcribe-captions", async () => {
    jobLog.debug("Transcribing narration for word-level timing");
    const words = await new WhisperTranscriber(
      config.whisperCaptions,
    ).transcribeWords(narration.path);

    const doc = await createCaptionFile({
      text: script,
      durationSeconds: narration.durationSeconds,
      outputPath: `${tmpDir}/captions.ass`,
      style: { ...config.captions, name: config.captions.style },
      audioPath: narration.path,
      offsetSeconds: config.captions.timingOffsetSeconds,
      wordTimings: words,
    });

    jobLog.info({ phraseCount: doc.phrases.length }, "Captions generated");
    return doc;
  });

  const { backgroundVideo, backgroundMusic } = await withStage(
    "select-media",
    async () => {
      jobLog.debug("Selecting background video and music");
      const [video, music] = await Promise.all([
        selectRandomVideo(),
        selectRandomMusic(),
      ]);
      jobLog.info(
        { backgroundVideo: video, backgroundMusic: music },
        "Selected background video and music",
      );
      return { backgroundVideo: video, backgroundMusic: music };
    },
  );

  const outputPath = `${OUTPUT_VIDEO_ROOT}/${job.id}.mp4`;

  const metadata = await withStage("render", async () => {
    jobLog.info("Starting video render");
    const renderer = new VideoRenderer(new FFmpeg());
    const result = await renderer.render({
      musicReverb: true,
      backgroundVideo,
      audio: narration.path,
      music: backgroundMusic,
      captions: `${tmpDir}/captions.ass`,
      captionFontFile: config.captions.fontFile,
      output: outputPath,
    });
    jobLog.info({ output: outputPath }, "Render complete");
    return result;
  });

  jobLog.info(
    { totalMs: Date.now() - startedAt, output: outputPath },
    "Job finished",
  );

  return {
    outputPath,
    title: redditStory.title,
    redditPostId: redditStory.id,
    redditSubreddit: redditStory.subreddit,
    redditPermalink: redditStory.permalink,
    scriptLength: script.length,
    durationSeconds: metadata.durationSeconds,
  };
}
