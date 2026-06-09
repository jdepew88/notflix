/** CPU-oriented ffmpeg settings — no GPU / Quick Sync / NVENC. */

export function isHeroVideoEnabled(): boolean {
  const raw = process.env.HERO_VIDEO?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

/** x264 preset for the rare transcode path (ultrafast = lowest CPU on weak servers). */
export function getFfmpegPreset(): string {
  const preset = process.env.FFMPEG_PRESET?.trim();
  return preset || "ultrafast";
}

/** Limit ffmpeg CPU threads (unset = ffmpeg default). */
export function ffmpegThreadArgs(): string[] {
  const raw = process.env.FFMPEG_THREADS?.trim();
  if (!raw || raw === "0") return [];
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? ["-threads", String(n)] : [];
}

export function getFfmpegTuneArgs(): string[] {
  const tune = process.env.FFMPEG_TUNE?.trim();
  return tune ? ["-tune", tune] : [];
}

/** Downscale tall video when re-encoding (0 = no limit). Default 1080 for CPU transcodes. */
export function getFfmpegMaxHeight(): number {
  const raw = process.env.FFMPEG_MAX_HEIGHT?.trim();
  if (raw === "0" || raw === "off" || raw === "none") return 0;
  if (!raw) return 1080;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1080;
}

/** How long to wait for the HLS manifest before failing (ms). */
export function getTranscodeManifestTimeoutMs(encodeVideo: boolean): number {
  const raw = process.env.FFMPEG_TRANSCODE_TIMEOUT_MS?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return encodeVideo ? 180_000 : 60_000;
}
