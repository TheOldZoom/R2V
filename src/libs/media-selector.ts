import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { logger } from "./logger";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm"]);
const MUSIC_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".flac",
  ".aac",
]);

const DEFAULT_VIDEO_DIR = "data/video";
const DEFAULT_MUSIC_DIR = "data/music";

async function readDirEntries(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error({ dir, error: message }, "Failed to read media directory");

    throw new Error(`Could not read media directory: ${dir} (${message})`);
  }
}

async function listFiles(
  dir: string,
  extensions: Set<string>,
): Promise<string[]> {
  logger.debug({ dir }, "Listing media directory");

  const entries = await readDirEntries(dir);

  const files = entries
    .filter(
      (entry) =>
        entry.isFile() && extensions.has(extname(entry.name).toLowerCase()),
    )
    .map((entry) => join(dir, entry.name));

  logger.debug({ dir, fileCount: files.length }, "Listed media directory");

  if (files.length === 0) {
    logger.error({ dir }, "No usable media files found");

    throw new Error(`No usable media files found in: ${dir}`);
  }

  return files;
}

function pickRandom<T>(items: T[]): T {
  const index = Math.floor(Math.random() * items.length);

  return items[index] as T;
}

export async function selectRandomVideo(
  dir = DEFAULT_VIDEO_DIR,
): Promise<string> {
  const files = await listFiles(dir, VIDEO_EXTENSIONS);
  const selected = pickRandom(files);

  logger.debug(
    { dir, candidateCount: files.length, selected },
    "Selected random background video",
  );

  return selected;
}

export async function selectRandomMusic(
  dir = DEFAULT_MUSIC_DIR,
): Promise<string> {
  const files = await listFiles(dir, MUSIC_EXTENSIONS);
  const selected = pickRandom(files);

  logger.debug(
    { dir, candidateCount: files.length, selected },
    "Selected random background music",
  );

  return selected;
}
