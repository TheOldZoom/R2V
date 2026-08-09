import { config } from "./config";
import type { FFmpeg } from "./ffmpeg";

export interface RenderOptions {
  input: string;
  output: string;
}

export class VideoRenderer {
  constructor(private readonly ffmpeg: FFmpeg) {}

  async render(options: RenderOptions): Promise<void> {
    await this.ffmpeg.run({
      input: options.input,
      output: options.output,

      args: [
        "-vf",
        `scale=${config.video.width}:${config.video.height}`,
        "-r",
        String(config.video.fps),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
      ],
    });
  }
}
