import { FFmpeg } from "./libs/ffmpeg";
import { logger } from "./libs/logger";
import { VideoRenderer } from "./libs/renderer";

logger.debug(`Hello World!`);

const ffmpeg = new FFmpeg();
const renderer = new VideoRenderer(ffmpeg);

logger.info("Starting Video Render");

const metadata = await renderer.render({
  backgroundVideo: "input.mp4",
  audio: "narration.mp3",
  output: "output/video.mp4",
});

logger.info({ metadata }, "Done");
