import { FFmpeg } from "./libs/ffmpeg";
import { logger } from "./libs/logger";
import { VideoRenderer } from "./libs/renderer";

logger.debug(`Hello World!`);

const ffmpeg = new FFmpeg();
const renderer = new VideoRenderer(ffmpeg);

logger.info("Starting Video Render");

await renderer.render({
  input: "input.mp4",
  output: "output/video.mp4",
});
