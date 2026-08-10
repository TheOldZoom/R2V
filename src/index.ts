import { config } from "./libs/config";
import { createCaptionFile } from "./libs/captions";
import { FFmpeg } from "./libs/ffmpeg";
import { createLLMProvider } from "./libs/llm";
import { logger } from "./libs/logger";
import { selectRandomMusic, selectRandomVideo } from "./libs/media-selector";
import { generateNarrationScript } from "./libs/narration";
import { VideoRenderer } from "./libs/renderer";
import { createTTSProvider } from "./libs/tts";
import { WhisperTranscriber } from "./libs/transcription";

logger.debug("R2V pipeline starting");

const llm = createLLMProvider(config.llm);
const tts = createTTSProvider(config.tts);
const ffmpeg = new FFmpeg();
const renderer = new VideoRenderer(ffmpeg);

logger.debug("Providers and renderer initialized");

logger.debug("Generating narration script");

const narrationScript = await generateNarrationScript(llm, {
  title: "THE WORST CHRISTMAS DINNER",
  body: `Christmas morning was perfect. The lights were glowing, the presents were stacked under the tree, and dinner smelled amazing.

Then my uncle walked in carrying a mysterious bowl.

"Try this," he said.

I took one bite and froze.

"Wait... WHAT am I eating?"

Everyone started laughing.

Apparently, I had just eaten the weirdest Christmas food imaginable—and nobody bothered to tell me what it was until AFTER I finished the bowl.`,
});

const script = narrationScript;

logger.info(
  {
    scriptLength: script.length,
    script,
  },
  "Narration script generated",
);

logger.debug("Generating narration audio");

const narration = await tts.generate({
  text: script,
  outputPath: "output/narration.wav",
});

logger.info(
  { durationSeconds: narration.durationSeconds },
  "Narration audio generated",
);

logger.debug("Generating synchronized captions");

const whisperCaptions = await new WhisperTranscriber(
  config.whisperCaptions,
).transcribeWords(narration.path);

const captions = await createCaptionFile({
  text: script,
  durationSeconds: narration.durationSeconds,
  outputPath: "output/captions.ass",
  style: { ...config.captions, name: config.captions.style },
  audioPath: narration.path,
  offsetSeconds: config.captions.timingOffsetSeconds,
  wordTimings: whisperCaptions,
});

logger.info({ phraseCount: captions.phrases.length }, "Captions generated");

logger.debug("Selecting background video and music");

const backgroundVideo = await selectRandomVideo();
const backgroundMusic = await selectRandomMusic();

logger.info(
  { backgroundVideo, backgroundMusic },
  "Selected background video and music",
);

logger.info("Starting Video Render");

logger.debug(
  {
    backgroundVideo,
    audio: narration.path,
    music: backgroundMusic,
    output: "output/video.mp4",
  },
  "Calling VideoRenderer.render",
);

const metadata = await renderer.render({
  backgroundVideo,
  audio: narration.path,
  music: backgroundMusic,
  captions: "output/captions.ass",
  captionFontFile: config.captions.fontFile,
  output: "output/video.mp4",
});

logger.info({ metadata }, "Done");

logger.debug("R2V pipeline finished");
