import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import type { MediaItem } from "./types";
import type { ServerSettings } from "./server-settings";
import { getDataPath } from "./data-path";
import { getFfmpegPath, isFfmpegAvailable } from "./ffmpeg";

interface HeroManifest {
  featuredId: string;
  fileName: string;
  sourceKey: string;
  createdAt: string;
}

const activeJobs = new Map<string, Promise<boolean>>();

function heroCacheDir(): string {
  return path.join(getDataPath(), "hero-cache");
}

function manifestPath(): string {
  return path.join(heroCacheDir(), "manifest.json");
}

function safeFileName(itemId: string): string {
  return itemId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function videoPathForItem(itemId: string): string {
  return path.join(heroCacheDir(), `${safeFileName(itemId)}.mp4`);
}

function readManifest(): HeroManifest | null {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(), "utf8")) as HeroManifest;
  } catch {
    return null;
  }
}

function writeManifest(manifest: HeroManifest): void {
  fs.mkdirSync(heroCacheDir(), { recursive: true });
  fs.writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2), "utf8");
}

export function clearStaleHeroVideos(keepItemId: string): void {
  const dir = heroCacheDir();
  if (!fs.existsSync(dir)) return;
  const keepFile = `${safeFileName(keepItemId)}.mp4`;
  for (const entry of fs.readdirSync(dir)) {
    if (entry.endsWith(".mp4") && entry !== keepFile) {
      try {
        fs.unlinkSync(path.join(dir, entry));
      } catch {
        /* ignore */
      }
    }
  }
}

export function getHeroVideoFile(itemId: string): string | null {
  const file = videoPathForItem(itemId);
  return fs.existsSync(file) ? file : null;
}

function sourceFingerprint(item: MediaItem): string {
  return item.plexPartKey || item.filePath || item.id;
}

function resolvePreviewInput(item: MediaItem, settings: ServerSettings): string | null {
  if (item.plexPartKey && settings.plexUrl && settings.plexToken) {
    const base = settings.plexUrl.replace(/\/$/, "");
    return `${base}${item.plexPartKey}?X-Plex-Token=${settings.plexToken}`;
  }
  if (item.filePath) return item.filePath;
  return null;
}

function isHeroPreviewCurrent(item: MediaItem): boolean {
  const file = getHeroVideoFile(item.id);
  if (!file) return false;
  const manifest = readManifest();
  if (!manifest || manifest.featuredId !== item.id) return false;
  return manifest.sourceKey === sourceFingerprint(item);
}

function removeHeroVideoFile(itemId: string): void {
  const file = videoPathForItem(itemId);
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

async function generateHeroPreview(
  item: MediaItem,
  settings: ServerSettings
): Promise<boolean> {
  const input = resolvePreviewInput(item, settings);
  if (!input) return false;

  const available = await isFfmpegAvailable();
  if (!available) return false;

  const outPath = videoPathForItem(item.id);
  fs.mkdirSync(heroCacheDir(), { recursive: true });

  const isRemote = /^https?:\/\//i.test(input);
  const args = [
    ...(isRemote
      ? [
          "-reconnect",
          "1",
          "-reconnect_streamed",
          "1",
          "-reconnect_delay_max",
          "5",
          "-user_agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ]
      : []),
    "-ss",
    "45",
    "-i",
    input,
    "-t",
    "25",
    "-an",
    "-vf",
    "scale=1280:-2",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-movflags",
    "+faststart",
    "-y",
    outPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve();
      else reject(new Error(stderr.slice(-400) || `ffmpeg exited ${code}`));
    });
  });

  writeManifest({
    featuredId: item.id,
    fileName: path.basename(outPath),
    sourceKey: sourceFingerprint(item),
    createdAt: new Date().toISOString(),
  });

  return true;
}

export function scheduleHeroPreview(
  item: MediaItem,
  settings: ServerSettings,
  previousFeaturedId?: string | null
): void {
  if (previousFeaturedId && previousFeaturedId !== item.id) {
    clearStaleHeroVideos(item.id);
  }

  if (isHeroPreviewCurrent(item)) return;

  if (getHeroVideoFile(item.id)) {
    removeHeroVideoFile(item.id);
  }

  if (activeJobs.has(item.id)) return;

  activeJobs.set(
    item.id,
    generateHeroPreview(item, settings)
      .catch((err) => {
        console.warn("[hero-cache] Preview generation failed:", err);
        return false;
      })
      .finally(() => {
        activeJobs.delete(item.id);
      })
  );
}

export async function ensureHeroPreview(
  item: MediaItem,
  settings: ServerSettings
): Promise<boolean> {
  if (isHeroPreviewCurrent(item)) return true;

  if (getHeroVideoFile(item.id)) {
    removeHeroVideoFile(item.id);
  }

  if (activeJobs.has(item.id)) {
    return activeJobs.get(item.id)!;
  }

  const job = generateHeroPreview(item, settings).finally(() => {
    activeJobs.delete(item.id);
  });
  activeJobs.set(item.id, job);
  return job;
}

export async function readHeroVideoBuffer(itemId: string): Promise<Buffer | null> {
  const file = getHeroVideoFile(itemId);
  if (!file) return null;
  return fsPromises.readFile(file);
}

export function isHeroVideoReady(itemId: string): boolean {
  return Boolean(getHeroVideoFile(itemId));
}

export function isHeroVideoGenerating(itemId: string): boolean {
  return activeJobs.has(itemId);
}
