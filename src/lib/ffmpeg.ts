import { spawn } from "child_process";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import crypto from "crypto";

export interface StreamTrack {
  index: number;
  type: "audio" | "subtitle";
  codec: string;
  language?: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
  channels?: number;
  label: string;
}

export interface ProbeResult {
  format: string;
  duration?: number;
  audio: StreamTrack[];
  subtitles: StreamTrack[];
  needsTranscode: boolean;
}

const CACHE_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), ".cache", "debrid");

const BROWSER_AUDIO = new Set(["aac", "mp3", "opus", "flac", "vorbis"]);
const TRANSCODE_AUDIO = new Set(["ac3", "eac3", "dts", "truehd", "dts_hd_ma", "dts-hd", "pcm_s16le"]);

let resolvedBinaries: { ffmpeg: string; ffprobe: string } | null = null;

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function resolveFfmpegBinaries(): { ffmpeg: string; ffprobe: string } {
  if (resolvedBinaries) return resolvedBinaries;

  const fromEnv = {
    ffmpeg: process.env.FFMPEG_PATH?.trim(),
    ffprobe: process.env.FFPROBE_PATH?.trim(),
  };
  if (fromEnv.ffmpeg && fromEnv.ffprobe) {
    resolvedBinaries = { ffmpeg: fromEnv.ffmpeg, ffprobe: fromEnv.ffprobe };
    return resolvedBinaries;
  }
  if (fromEnv.ffmpeg) {
    const dir = path.dirname(fromEnv.ffmpeg);
    const ffprobe = fromEnv.ffprobe || path.join(dir, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
    if (fileExists(fromEnv.ffmpeg) && fileExists(ffprobe)) {
      resolvedBinaries = { ffmpeg: fromEnv.ffmpeg, ffprobe };
      return resolvedBinaries;
    }
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const wingetLinks = path.join(localAppData, "Microsoft", "WinGet", "Links");
      const ffmpegLink = path.join(wingetLinks, "ffmpeg.exe");
      const ffprobeLink = path.join(wingetLinks, "ffprobe.exe");
      if (fileExists(ffmpegLink) && fileExists(ffprobeLink)) {
        resolvedBinaries = { ffmpeg: ffmpegLink, ffprobe: ffprobeLink };
        return resolvedBinaries;
      }

      const packagesDir = path.join(localAppData, "Microsoft", "WinGet", "Packages");
      if (fileExists(packagesDir)) {
        for (const dir of fs.readdirSync(packagesDir)) {
          if (!dir.startsWith("Gyan.FFmpeg")) continue;
          const packageRoot = path.join(packagesDir, dir);
          for (const build of fs.readdirSync(packageRoot)) {
            const binDir = path.join(packageRoot, build, "bin");
            const ffmpeg = path.join(binDir, "ffmpeg.exe");
            const ffprobe = path.join(binDir, "ffprobe.exe");
            if (fileExists(ffmpeg) && fileExists(ffprobe)) {
              resolvedBinaries = { ffmpeg, ffprobe };
              return resolvedBinaries;
            }
          }
        }
      }
    }

    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    for (const ffmpeg of [
      path.join(programFiles, "ffmpeg", "bin", "ffmpeg.exe"),
      "C:\\ffmpeg\\bin\\ffmpeg.exe",
    ]) {
      const ffprobe = path.join(path.dirname(ffmpeg), "ffprobe.exe");
      if (fileExists(ffmpeg) && fileExists(ffprobe)) {
        resolvedBinaries = { ffmpeg, ffprobe };
        return resolvedBinaries;
      }
    }
  }

  resolvedBinaries = { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };
  return resolvedBinaries;
}

export function getFfmpegPath(): string {
  return resolveFfmpegBinaries().ffmpeg;
}

function getFfprobePath(): string {
  return resolveFfmpegBinaries().ffprobe;
}

function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => reject(new Error(`${cmd} not found: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `${cmd} exited with ${code}`));
    });
  });
}

function trackLabel(stream: {
  index: number;
  codec_name?: string;
  tags?: Record<string, string>;
  disposition?: { default?: number; forced?: number };
  channels?: number;
}): string {
  const lang = stream.tags?.language?.toUpperCase() || "UND";
  const name = stream.tags?.title || stream.tags?.handler_name || "";
  const codec = stream.codec_name?.toUpperCase() || "?";
  const parts = [lang, codec];
  if (name && name !== lang) parts.push(name);
  if (stream.disposition?.default) parts.push("(Default)");
  if (stream.disposition?.forced) parts.push("(Forced)");
  return parts.join(" · ");
}

export async function probeMediaFile(filePath: string): Promise<ProbeResult> {
  const output = await runCommand(getFfprobePath(), [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    filePath,
  ]);
  return parseProbeOutput(output);
}

function parseProbeOutput(output: string): ProbeResult {
  const data = JSON.parse(output) as {
    streams?: Array<{
      index: number;
      codec_type?: string;
      codec_name?: string;
      tags?: Record<string, string>;
      disposition?: { default?: number; forced?: number };
      channels?: number;
    }>;
    format?: { format_name?: string; duration?: string };
  };

  const audio: StreamTrack[] = [];
  const subtitles: StreamTrack[] = [];

  for (const stream of data.streams ?? []) {
    if (stream.codec_type === "audio") {
      audio.push({
        index: stream.index,
        type: "audio",
        codec: stream.codec_name || "unknown",
        language: stream.tags?.language,
        title: stream.tags?.title,
        default: stream.disposition?.default === 1,
        channels: stream.channels,
        label: trackLabel(stream),
      });
    }
    if (stream.codec_type === "subtitle") {
      subtitles.push({
        index: stream.index,
        type: "subtitle",
        codec: stream.codec_name || "unknown",
        language: stream.tags?.language,
        title: stream.tags?.title,
        default: stream.disposition?.default === 1,
        forced: stream.disposition?.forced === 1,
        label: trackLabel(stream),
      });
    }
  }

  const needsTranscode = audio.some((a) => {
    const c = a.codec.toLowerCase();
    return TRANSCODE_AUDIO.has(c) || !BROWSER_AUDIO.has(c);
  });

  return {
    format: data.format?.format_name || "unknown",
    duration: data.format?.duration ? parseFloat(data.format.duration) : undefined,
    audio,
    subtitles,
    needsTranscode: needsTranscode || audio.length === 0,
  };
}

export async function probeMediaUrl(url: string): Promise<ProbeResult> {
  const output = await runCommand(getFfprobePath(), [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    "-user_agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "-i",
    url,
  ]);
  return parseProbeOutput(output);
}

const TEXT_SUBTITLE_CODECS = new Set([
  "subrip",
  "srt",
  "ass",
  "ssa",
  "mov_text",
  "webvtt",
  "text",
]);

export function isTextSubtitleCodec(codec: string): boolean {
  const c = codec.toLowerCase();
  return TEXT_SUBTITLE_CODECS.has(c) || c.includes("subrip");
}

export function isEnglishLanguage(value?: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase().trim();
  if (["en", "eng", "english"].includes(normalized)) return true;
  const primary = normalized.split(/[-_]/)[0];
  return primary === "en" || primary === "eng";
}

function trackMatchesEnglish(track: StreamTrack): boolean {
  return isEnglishLanguage(track.language) || isEnglishLanguage(track.title);
}

export function defaultSubtitleTrack(subtitles: StreamTrack[]): number | null {
  if (subtitles.length === 0) return null;

  const english = subtitles.filter(trackMatchesEnglish);
  if (english.length > 0) {
    return (
      english.find((t) => t.default && !t.forced)?.index ??
      english.find((t) => !t.forced)?.index ??
      english[0].index
    );
  }

  const def = subtitles.find((t) => t.default);
  if (def) return def.index;
  return subtitles[0].index;
}

export function subtitleStreamOrdinal(
  subtitles: StreamTrack[],
  absoluteIndex: number
): number {
  const idx = subtitles.findIndex((s) => s.index === absoluteIndex);
  return idx >= 0 ? idx : 0;
}

export function trackResponseDefaults(probe: ProbeResult) {
  const defaultSubtitleIndex = defaultSubtitleTrack(probe.subtitles);
  return {
    ...probe,
    defaultAudioIndex: defaultAudioTrack(probe.audio),
    defaultSubtitleIndex,
    needsSubtitles: defaultSubtitleIndex !== null,
  };
}

export function defaultAudioTrack(audio: StreamTrack[]): number {
  const englishAac = audio.find(
    (a) => a.codec.toLowerCase() === "aac" && trackMatchesEnglish(a)
  );
  if (englishAac) return englishAac.index;

  const englishTracks = audio.filter(trackMatchesEnglish);
  if (englishTracks.length > 0) {
    const browserOk = englishTracks.find((a) => BROWSER_AUDIO.has(a.codec.toLowerCase()));
    if (browserOk) return browserOk.index;
    const def = englishTracks.find((a) => a.default);
    if (def) return def.index;
    return englishTracks[0].index;
  }

  const aac = audio.find((a) => a.codec.toLowerCase() === "aac");
  if (aac) return aac.index;
  const def = audio.find((a) => a.default);
  if (def) return def.index;
  return audio[0]?.index ?? 0;
}

export function sessionId(input: string, audioIndex: number, subtitleIndex: number): string {
  return crypto
    .createHash("sha256")
    .update(`${input}|${audioIndex}|${subtitleIndex}`)
    .digest("hex")
    .slice(0, 16);
}

export function cachePath(session: string): string {
  return path.join(CACHE_DIR, session);
}

export async function waitForFile(filePath: string, timeoutMs = 45000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

const activeJobs = new Map<string, Promise<void>>();

function subtitleFilterPath(input: string): string {
  const normalized = input.replace(/\\/g, "/");
  if (/^https?:\/\//i.test(normalized)) {
    return `'${normalized.replace(/'/g, "'\\''")}'`;
  }
  return normalized.replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export async function startHlsTranscode(
  input: string,
  audioStreamIndex: number,
  subtitleStreamIndex: number | null,
  subtitleCodec?: string,
  subtitlesForOrdinal: StreamTrack[] = []
): Promise<{ session: string; manifestPath: string }> {
  const session = sessionId(input, audioStreamIndex, subtitleStreamIndex ?? -1);
  const outDir = cachePath(session);
  const manifestPath = path.join(outDir, "master.m3u8");
  const isRemote = /^https?:\/\//i.test(input);

  try {
    await fsPromises.access(manifestPath);
    return { session, manifestPath };
  } catch {
    /* not cached */
  }

  if (!activeJobs.has(session)) {
    activeJobs.set(
      session,
      (async () => {
        await fsPromises.mkdir(outDir, { recursive: true });

        const inputArgs = isRemote
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
          : [];

        const burnInImageSub =
          subtitleStreamIndex !== null &&
          subtitleStreamIndex >= 0 &&
          subtitleCodec &&
          !isTextSubtitleCodec(subtitleCodec);

        const subOrdinal =
          subtitleStreamIndex !== null && subtitleStreamIndex >= 0
            ? subtitleStreamOrdinal(subtitlesForOrdinal, subtitleStreamIndex)
            : 0;

        const args = [
          ...inputArgs,
          "-i",
          input,
          "-map",
          "0:v:0",
          "-map",
          `0:${audioStreamIndex}`,
          "-c:v",
          burnInImageSub ? "libx264" : "copy",
          ...(burnInImageSub ? ["-preset", "ultrafast"] : []),
          ...(burnInImageSub
            ? ["-vf", `subtitles=${subtitleFilterPath(input)}:si=${subOrdinal}`]
            : []),
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-ac",
          "2",
        ];

        if (subtitleStreamIndex !== null && subtitleStreamIndex >= 0 && !burnInImageSub) {
          args.push("-map", `0:${subtitleStreamIndex}`, "-c:s", "webvtt");
        }

        args.push(
          "-f",
          "hls",
          "-hls_time",
          burnInImageSub ? "8" : "6",
          "-hls_list_size",
          "0",
          "-hls_flags",
          "independent_segments",
          "-hls_segment_filename",
          path.join(outDir, "seg_%03d.ts"),
          manifestPath
        );

        await new Promise<void>((resolve, reject) => {
          const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
          let stderr = "";
          proc.stderr.on("data", (d) => (stderr += d.toString()));
          proc.on("error", (err) => reject(new Error(`ffmpeg not found: ${err.message}`)));
          proc.on("close", (code) => {
            activeJobs.delete(session);
            if (code === 0 || code === 255) resolve();
            else reject(new Error(stderr.slice(-500) || `ffmpeg exited ${code}`));
          });
        });
      })().catch((err) => {
        activeJobs.delete(session);
        throw err;
      })
    );
  }

  const ready = await waitForFile(manifestPath);
  if (!ready) {
    throw new Error("Transcode timed out. Ensure ffmpeg is installed and in PATH.");
  }

  return { session, manifestPath };
}

/** Stream-copy remux for Debrid — no video/audio re-encoding. */
export async function startHlsRemux(
  input: string,
  audioStreamIndex: number,
  subtitleStreamIndex: number | null,
  subtitleCodec?: string,
  subtitlesForOrdinal: StreamTrack[] = []
): Promise<{ session: string; manifestPath: string }> {
  const session = sessionId(input, audioStreamIndex, subtitleStreamIndex ?? -1);
  const outDir = cachePath(session);
  const manifestPath = path.join(outDir, "master.m3u8");
  const isRemote = /^https?:\/\//i.test(input);

  try {
    await fsPromises.access(manifestPath);
    return { session, manifestPath };
  } catch {
    /* not cached */
  }

  if (subtitleStreamIndex !== null && subtitleCodec && !isTextSubtitleCodec(subtitleCodec)) {
    throw new Error(
      "Image-based subtitles cannot be remuxed for direct play. Choose a text subtitle track or turn subtitles off."
    );
  }

  if (!activeJobs.has(session)) {
    activeJobs.set(
      session,
      (async () => {
        await fsPromises.mkdir(outDir, { recursive: true });

        const inputArgs = isRemote
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
          : [];

        const subOrdinal =
          subtitleStreamIndex !== null && subtitleStreamIndex >= 0
            ? subtitleStreamOrdinal(subtitlesForOrdinal, subtitleStreamIndex)
            : 0;

        const args = [
          ...inputArgs,
          "-i",
          input,
          "-map",
          "0:v:0",
          "-map",
          `0:${audioStreamIndex}`,
          "-c:v",
          "copy",
          "-c:a",
          "copy",
        ];

        if (subtitleStreamIndex !== null && subtitleStreamIndex >= 0) {
          args.push("-map", `0:${subtitleStreamIndex}`, "-c:s", "webvtt");
        }

        args.push(
          "-f",
          "hls",
          "-hls_time",
          "6",
          "-hls_list_size",
          "0",
          "-hls_flags",
          "independent_segments+append_list",
          "-hls_segment_filename",
          path.join(outDir, "seg_%03d.ts"),
          manifestPath
        );

        await new Promise<void>((resolve, reject) => {
          const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
          let stderr = "";
          proc.stderr.on("data", (d) => (stderr += d.toString()));
          proc.on("error", (err) => reject(new Error(`ffmpeg not found: ${err.message}`)));
          proc.on("close", (code) => {
            activeJobs.delete(session);
            if (code === 0 || code === 255) resolve();
            else reject(new Error(stderr.slice(-500) || `ffmpeg remux exited ${code}`));
          });
        });
      })().catch((err) => {
        activeJobs.delete(session);
        throw err;
      })
    );
  }

  const ready = await waitForFile(manifestPath, 60000);
  if (!ready) {
    throw new Error("Remux timed out. The stream may be slow to start — try again.");
  }

  return { session, manifestPath };
}

export async function readCachedFile(session: string, file: string): Promise<Buffer> {
  const safe = path.basename(file);
  const full = path.join(cachePath(session), safe);
  return fsPromises.readFile(full);
}

export async function rewriteHlsManifestForProxy(
  session: string,
  manifestContent: string
): Promise<string> {
  return manifestContent
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
          if (uri.endsWith(".m3u8")) {
            return `URI="/api/debrid/hls/${session}/${uri}"`;
          }
          return `URI="/api/debrid/hls/${session}/${uri}"`;
        });
      }
      if (trimmed.endsWith(".ts") || trimmed.endsWith(".vtt") || trimmed.endsWith(".m3u8")) {
        return `/api/debrid/hls/${session}/${trimmed}`;
      }
      return line;
    })
    .join("\n");
}

export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await runCommand(getFfmpegPath(), ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export function getFfmpegInstallHint(): string {
  const { ffmpeg } = resolveFfmpegBinaries();
  if (ffmpeg !== "ffmpeg") {
    return `Using ffmpeg at ${ffmpeg}. Restart the dev server if playback still fails.`;
  }
  return "Install ffmpeg (winget install Gyan.FFmpeg) and restart the dev server, or set FFMPEG_PATH in .env.local.";
}
