import type { ProbeResult, StreamTrack } from "@/types/media-tracks";
import {
  containerPrefersTranscode,
  defaultAudioTrack,
  isBrowserVideoCodec,
  isTextSubtitleCodec,
  trackNeedsTranscode,
} from "@/lib/media-codec";

export type PlaybackStrategy = "direct" | "transcode" | "blocked";
export type PrepEstimate = "instant" | "short" | "long";

export interface PlaybackPreflightInput extends ProbeResult {
  defaultAudioIndex?: number;
  defaultSubtitleIndex?: number | null;
}

export interface PlaybackPreflightOptions {
  ffmpegAvailable: boolean;
  preferDirectPlay?: boolean;
  subtitleIndex?: number | null;
}

export interface PlaybackPreflight {
  strategy: PlaybackStrategy;
  canDirectPlay: boolean;
  needsTranscode: boolean;
  needsAudioTranscode: boolean;
  needsVideoTranscode: boolean;
  ffmpegAvailable: boolean;
  ffmpegRequired: boolean;
  format: string;
  videoCodec?: string;
  defaultAudioCodec?: string;
  defaultAudioLabel?: string;
  subtitleCount: number;
  imageSubtitleCount: number;
  reasons: string[];
  warnings: string[];
  prepEstimate: PrepEstimate;
  subtitleNote?: string;
}

function selectedAudioTrack(
  probe: PlaybackPreflightInput,
  options: PlaybackPreflightOptions
): StreamTrack | undefined {
  const audioIndex = probe.defaultAudioIndex ?? defaultAudioTrack(probe.audio);
  return probe.audio.find((a) => a.index === audioIndex);
}

function selectedSubtitleTrack(
  probe: PlaybackPreflightInput,
  options: PlaybackPreflightOptions
): StreamTrack | undefined {
  const idx =
    options.subtitleIndex !== undefined
      ? options.subtitleIndex
      : probe.defaultSubtitleIndex ?? null;
  if (idx === null) return undefined;
  return probe.subtitles.find((s) => s.index === idx);
}

function estimatePrep(
  needsVideoTranscode: boolean,
  needsAudioTranscode: boolean,
  imageSubtitle: boolean
): PrepEstimate {
  if (needsVideoTranscode || imageSubtitle) return "long";
  if (needsAudioTranscode) return "short";
  return "instant";
}

export function analyzePlaybackPreflight(
  probe: PlaybackPreflightInput,
  options: PlaybackPreflightOptions
): PlaybackPreflight {
  const audio = selectedAudioTrack(probe, options);
  const subtitle = selectedSubtitleTrack(probe, options);
  const needsAudioTranscode = trackNeedsTranscode(audio);
  const needsVideoTranscode = Boolean(
    probe.needsDirectVideoTranscode ||
      probe.needsVideoTranscode ||
      (probe.videoCodec && !isBrowserVideoCodec(probe.videoCodec))
  );
  const needsSubTranscode = options.subtitleIndex !== undefined && options.subtitleIndex !== null;
  const imageSubtitle = Boolean(subtitle && !isTextSubtitleCodec(subtitle.codec));
  const needsTranscode =
    probe.needsTranscode ||
    needsAudioTranscode ||
    needsVideoTranscode ||
    needsSubTranscode ||
    imageSubtitle;

  const ffmpegRequired = needsTranscode;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (needsAudioTranscode && audio) {
    reasons.push(
      `Audio is ${audio.codec.toUpperCase()} — browsers need AAC (ffmpeg will transcode audio).`
    );
  }
  if (needsVideoTranscode && probe.videoCodec) {
    reasons.push(
      `Video is ${probe.videoCodec.toUpperCase()} — may need video transcode for this device.`
    );
  }
  if (containerPrefersTranscode(probe.format) && needsAudioTranscode) {
    reasons.push(`Container ${probe.format} with surround audio is not direct-play safe.`);
  }
  if (needsSubTranscode && subtitle) {
    if (imageSubtitle) {
      reasons.push(
        `Subtitle track is ${subtitle.codec.toUpperCase()} (image) — will be burned in (slower).`
      );
    } else {
      reasons.push(`Subtitles will be muxed as WebVTT in HLS.`);
    }
  }
  if (probe.audio.length > 1) {
    warnings.push(`${probe.audio.length} audio tracks — verify language in the player menu.`);
  }
  if (probe.subtitles.length > 0 && !needsSubTranscode) {
    warnings.push(
      `${probe.subtitles.length} subtitle track(s) available — select one in the player to enable.`
    );
  }
  if (probe.videoCodec && /hevc|h265/i.test(probe.videoCodec) && !needsVideoTranscode) {
    warnings.push(
      "HEVC/H.265 may not play on all browsers — switch to transcode if video is black or stutters."
    );
  }

  let strategy: PlaybackStrategy = "direct";
  if (!options.ffmpegAvailable && ffmpegRequired) {
    strategy = "blocked";
    reasons.unshift("ffmpeg is not available — AC3/DTS/MKV and subtitles cannot be prepared.");
  } else if (needsTranscode) {
    strategy = "transcode";
  } else if (options.preferDirectPlay === false) {
    strategy = "transcode";
    reasons.push("Direct play disabled in Settings — using server transcode.");
  }

  const canDirectPlay =
    strategy === "direct" && !needsTranscode && options.preferDirectPlay !== false;

  if (canDirectPlay && reasons.length === 0) {
    reasons.push("H.264/AAC-compatible stream — direct play.");
  }

  const prepEstimate = estimatePrep(needsVideoTranscode, needsAudioTranscode, imageSubtitle);

  let subtitleNote: string | undefined;
  if (imageSubtitle) {
    subtitleNote = "Image subtitles (PGS/VobSub) require burn-in and add CPU load.";
  } else if (probe.subtitles.length > 0) {
    subtitleNote = "Text subtitles work after HLS transcode/remux.";
  }

  return {
    strategy,
    canDirectPlay,
    needsTranscode,
    needsAudioTranscode,
    needsVideoTranscode,
    ffmpegAvailable: options.ffmpegAvailable,
    ffmpegRequired,
    format: probe.format,
    videoCodec: probe.videoCodec,
    defaultAudioCodec: audio?.codec,
    defaultAudioLabel: audio?.label,
    subtitleCount: probe.subtitles.length,
    imageSubtitleCount: probe.subtitles.filter((s) => !isTextSubtitleCodec(s.codec)).length,
    reasons,
    warnings,
    prepEstimate,
    subtitleNote,
  };
}

export function prepEstimateLabel(estimate: PrepEstimate): string {
  switch (estimate) {
    case "instant":
      return "Should start immediately";
    case "short":
      return "Preparing stream (~15–45s)";
    case "long":
      return "Preparing stream (~30–90s, CPU transcode)";
  }
}

export function strategyLabel(strategy: PlaybackStrategy): string {
  switch (strategy) {
    case "direct":
      return "Direct play";
    case "transcode":
      return "Server transcode (ffmpeg)";
    case "blocked":
      return "Blocked — ffmpeg required";
  }
}
