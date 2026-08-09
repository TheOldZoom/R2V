import { config } from "./libs/config";
import { FFmpeg } from "./libs/ffmpeg";
import { createLLMProvider } from "./libs/llm";
import { logger } from "./libs/logger";
import { selectRandomMusic, selectRandomVideo } from "./libs/media-selector";
import { generateNarrationScript } from "./libs/narration";
import { VideoRenderer } from "./libs/renderer";
import { createTTSProvider } from "./libs/tts";

logger.debug("R2V pipeline starting");

const llm = createLLMProvider(config.llm);
const tts = createTTSProvider(config.tts);
const ffmpeg = new FFmpeg();
const renderer = new VideoRenderer(ffmpeg);

logger.debug("Providers and renderer initialized");

logger.debug("Generating narration script");

const narrationScript = await generateNarrationScript(llm, {
  title:
    "I 37F might be pregnant and don’t care that it’s not what the other person wants. ",
  body: `I ate balls for christmas`,
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
  output: "output/video.mp4",
});

logger.info({ metadata }, "Done");

logger.debug("R2V pipeline finished");
