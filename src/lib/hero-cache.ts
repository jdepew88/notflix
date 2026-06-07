import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import type { MediaItem } from "./types";
import type { ServerSettings } from "./server-settings";
import { getDataPath } from "./data-path";
import { getFfmpegPath, isFfmpegAvailable } from "./ffmpeg";

export interface HeroManifest {
  primaryFeaturedId: string;
  featuredId: string;
  candidateIds: string[];
  failedIds: string[];
  attemptIndex: number;
  lastError?: string;
  videoReady: boolean;
  exhausted: boolean;
  fileName?: string;
  sourceKey?: string;
  createdAt?: string;
}

export interface HeroStatus {
  primaryFeaturedId: string;
  featuredId: string;
  candidateIds: string[];
  failedIds: string[];
  attemptIndex: number;
  videoReady: boolean;
  exhausted: boolean;
  lastError?: string;
}

const MIN_VIDEO_BYTES = 16_000;
const activeJobs = new Map<string, Promise<boolean>>();
let resolveInFlight: Promise<HeroStatus> | null = null;

export function heroCacheDir(): string {
  return path.join(getDataPath(), "hero-cache");
}

export function heroTmpDir(): string {
  return path.join(getDataPath(), "tmp", "hero");
}

function manifestPath(): string {
  return path.join(heroCacheDir(), "manifest.json");
}

export function ensureHeroDirs(): void {
  fs.mkdirSync(heroTmpDir(), { recursive: true });
  fs.mkdirSync(heroCacheDir(), { recursive: true });
}

function safeFileName(itemId: string): string {
  return itemId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function videoPathForItem(itemId: string): string {
  return path.join(heroCacheDir(), `${safeFileName(itemId)}.mp4`);
}

function tmpVideoPathForItem(itemId: string): string {
  return path.join(heroTmpDir(), `${safeFileName(itemId)}.work.mp4`);
}

function readManifest(): HeroManifest | null {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(), "utf8")) as HeroManifest;
  } catch {
    return null;
  }
}

function writeManifest(manifest: HeroManifest): void {
  ensureHeroDirs();
  fs.writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2), "utf8");
}

function cleanTmpDir(): void {
  const dir = heroTmpDir();
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, entry));
    } catch {
      /* ignore */
    }
  }
}

export function getHeroManifest(): HeroManifest | null {
  return readManifest();
}

export function getHeroStatus(): HeroStatus | null {
  const manifest = readManifest();
  if (!manifest) return null;
  return {
    primaryFeaturedId: manifest.primaryFeaturedId,
    featuredId: manifest.featuredId,
    candidateIds: manifest.candidateIds,
    failedIds: manifest.failedIds,
    attemptIndex: manifest.attemptIndex,
    videoReady: manifest.videoReady && isValidVideoFile(manifest.featuredId),
    exhausted: manifest.exhausted,
    lastError: manifest.lastError,
  };
}

export function initHeroManifest(candidates: MediaItem[]): HeroManifest | null {
  if (candidates.length === 0) return null;
  ensureHeroDirs();
  const manifest: HeroManifest = {
    primaryFeaturedId: candidates[0].id,
    featuredId: candidates[0].id,
    candidateIds: candidates.map((c) => c.id),
    failedIds: [],
    attemptIndex: 0,
    videoReady: false,
    exhausted: false,
  };
  writeManifest(manifest);
  return manifest;
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

export function isValidVideoFile(itemId: string): boolean {
  const file = getHeroVideoFile(itemId);
  if (!file) return false;
  try {
    const stat = fs.statSync(file);
    return stat.size >= MIN_VIDEO_BYTES;
  } catch {
    return false;
  }
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
  const tmp = tmpVideoPathForItem(itemId);
  if (fs.existsSync(tmp)) {
    try {
      fs.unlinkSync(tmp);
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
  if (!input) throw new Error("No stream source for hero preview");

  const available = await isFfmpegAvailable();
  if (!available) throw new Error("ffmpeg not available");

  ensureHeroDirs();
  cleanTmpDir();

  const tmpOut = tmpVideoPathForItem(item.id);
  const outPath = videoPathForItem(item.id);
  removeHeroVideoFile(item.id);

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
    tmpOut,
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(tmpOut)) resolve();
      else reject(new Error(stderr.slice(-400) || `ffmpeg exited ${code}`));
    });
  });

  if (!fs.existsSync(tmpOut)) {
    throw new Error("Hero preview file was not created");
  }

  const stat = fs.statSync(tmpOut);
  if (stat.size < MIN_VIDEO_BYTES) {
    fs.unlinkSync(tmpOut);
    throw new Error("Hero preview file is too small or corrupt");
  }

  fs.renameSync(tmpOut, outPath);

  return true;
}

async function tryGenerateForItem(
  item: MediaItem,
  settings: ServerSettings
): Promise<{ ok: boolean; error?: string }> {
  if (activeJobs.has(item.id)) {
    const ok = await activeJobs.get(item.id)!;
    return ok
      ? { ok: true }
      : { ok: false, error: "Hero preview generation failed" };
  }

  const job = generateHeroPreview(item, settings)
    .then(() => isValidVideoFile(item.id))
    .catch((err) => {
      removeHeroVideoFile(item.id);
      console.warn("[hero-cache] Preview generation failed:", err);
      return false;
    })
    .finally(() => {
      activeJobs.delete(item.id);
    });

  activeJobs.set(item.id, job);
  const ok = await job;
  return ok
    ? { ok: true }
    : { ok: false, error: "Could not generate hero preview video" };
}

function findItem(items: MediaItem[], id: string): MediaItem | null {
  return items.find((i) => i.id === id) ?? null;
}

export async function resolveHeroVideoCandidates(
  allItems: MediaItem[],
  settings: ServerSettings,
  options: { startIndex?: number; markFailedId?: string; reason?: string } = {}
): Promise<HeroStatus> {
  if (resolveInFlight) return resolveInFlight;

  resolveInFlight = (async () => {
    ensureHeroDirs();

    const playableCandidates = allItems.filter(
      (i) => i.type === "movie" && (i.plexPartKey || i.filePath)
    );

    let manifest = readManifest();
    if (!manifest || manifest.candidateIds.length === 0) {
      manifest = initHeroManifest(
        playableCandidates.slice(0, 3).length
          ? playableCandidates.slice(0, 3)
          : allItems.filter((i) => i.type === "movie").slice(0, 3)
      );
    }
    if (!manifest) {
      throw new Error("No hero candidates");
    }

    if (options.markFailedId && !manifest.failedIds.includes(options.markFailedId)) {
      manifest.failedIds.push(options.markFailedId);
      removeHeroVideoFile(options.markFailedId);
    }

    const primaryId = manifest.primaryFeaturedId;
    const candidateItems = manifest.candidateIds
      .map((id) => findItem(allItems, id))
      .filter((item): item is MediaItem => item !== null);

    const maxAttempts = Math.min(3, candidateItems.length);
    let startIndex = options.startIndex ?? manifest.attemptIndex;

    if (options.markFailedId) {
      const failedIndex = manifest.candidateIds.indexOf(options.markFailedId);
      if (failedIndex >= 0) startIndex = failedIndex + 1;
    }

    let lastError = options.reason ?? manifest.lastError;

    for (let attempt = startIndex; attempt < maxAttempts; attempt++) {
      const item = candidateItems[attempt];
      if (!item || manifest.failedIds.includes(item.id)) continue;

      manifest.attemptIndex = attempt;
      manifest.featuredId = item.id;
      manifest.videoReady = false;
      manifest.exhausted = false;
      manifest.lastError = undefined;
      writeManifest(manifest);

      if (isValidVideoFile(item.id)) {
        manifest.videoReady = true;
        manifest.fileName = path.basename(videoPathForItem(item.id)!);
        manifest.sourceKey = sourceFingerprint(item);
        manifest.createdAt = new Date().toISOString();
        writeManifest(manifest);
        clearStaleHeroVideos(item.id);
        return getHeroStatus()!;
      }

      const result = await tryGenerateForItem(item, settings);
      if (result.ok && isValidVideoFile(item.id)) {
        manifest.videoReady = true;
        manifest.exhausted = false;
        manifest.lastError = undefined;
        manifest.fileName = path.basename(videoPathForItem(item.id)!);
        manifest.sourceKey = sourceFingerprint(item);
        manifest.createdAt = new Date().toISOString();
        writeManifest(manifest);
        clearStaleHeroVideos(item.id);
        return getHeroStatus()!;
      }

      lastError = result.error ?? "Hero preview generation failed";
      if (!manifest.failedIds.includes(item.id)) {
        manifest.failedIds.push(item.id);
      }
      removeHeroVideoFile(item.id);
      manifest.lastError = lastError;
      writeManifest(manifest);
    }

    manifest.featuredId = primaryId;
    manifest.attemptIndex = maxAttempts;
    manifest.videoReady = false;
    manifest.exhausted = true;
    manifest.lastError =
      lastError ??
      "Marquee video unavailable after 3 attempts. Showing backdrop for the featured title.";
    writeManifest(manifest);
    clearStaleHeroVideos("");

    return getHeroStatus()!;
  })().finally(() => {
    resolveInFlight = null;
  });

  return resolveInFlight;
}

export function scheduleHeroPreview(
  candidates: MediaItem[],
  allItems: MediaItem[],
  settings: ServerSettings
): void {
  if (candidates.length === 0) return;
  initHeroManifest(candidates);
  void resolveHeroVideoCandidates(allItems, settings).catch((err) => {
    console.warn("[hero-cache] Hero resolve failed:", err);
  });
}

export async function ensureHeroPreview(
  item: MediaItem,
  settings: ServerSettings,
  allItems: MediaItem[]
): Promise<boolean> {
  const status = await resolveHeroVideoCandidates(allItems, settings);
  return status.videoReady && status.featuredId === item.id;
}

export async function readHeroVideoBuffer(itemId: string): Promise<Buffer | null> {
  const file = getHeroVideoFile(itemId);
  if (!file) return null;
  return fsPromises.readFile(file);
}

export function isHeroVideoReady(itemId: string): boolean {
  return isValidVideoFile(itemId);
}

export function isHeroVideoGenerating(itemId: string): boolean {
  return activeJobs.has(itemId) || resolveInFlight !== null;
}
