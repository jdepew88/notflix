import type { ProbeResult, StreamTrack } from "@/types/media-tracks";

const BROWSER_AUDIO = new Set(["aac", "mp3", "opus"]);
const TRANSCODE_AUDIO = new Set([
  "ac3",
  "eac3",
  "dts",
  "truehd",
  "dts_hd_ma",
  "dts-hd",
  "dts_hd",
  "pcm_s16le",
  "pcm_s24le",
  "flac",
  "vorbis",
]);
const BROWSER_VIDEO = new Set(["h264", "avc"]);
const HLS_VIDEO_COPY = new Set(["h264", "hevc", "h265", "avc"]);

const TEXT_SUBTITLE_CODECS = new Set([
  "subrip",
  "srt",
  "ass",
  "ssa",
  "mov_text",
  "webvtt",
  "text",
]);

export function isBrowserVideoCodec(codec: string): boolean {
  const c = codec.toLowerCase();
  if (BROWSER_VIDEO.has(c)) return true;
  if (c.startsWith("h264") || c.includes("avc")) return true;
  return false;
}

export function isHlsVideoCopySafe(codec: string): boolean {
  const c = codec.toLowerCase();
  if (HLS_VIDEO_COPY.has(c)) return true;
  if (c.startsWith("h264") || c.includes("avc") || c.startsWith("hevc") || c.includes("h265")) {
    return true;
  }
  return false;
}

export function isBrowserAudioCodec(codec: string): boolean {
  const c = codec.toLowerCase();
  if (TRANSCODE_AUDIO.has(c)) return false;
  return BROWSER_AUDIO.has(c);
}

export function trackNeedsTranscode(track: StreamTrack | undefined): boolean {
  if (!track) return true;
  return !isBrowserAudioCodec(track.codec);
}

export function containerPrefersTranscode(formatName: string): boolean {
  return /matroska|webm|avi|mpegts|m2ts/i.test(formatName);
}

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

export function subtitleStreamOrdinal(subtitles: StreamTrack[], absoluteIndex: number): number {
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
