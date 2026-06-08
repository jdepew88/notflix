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
