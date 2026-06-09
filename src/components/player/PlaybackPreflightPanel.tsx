"use client";

import { AlertTriangle, CheckCircle2, Cpu, Film, HardDriveDownload, Volume2, Subtitles } from "lucide-react";
import {
  prepEstimateLabel,
  strategyLabel,
  type PlaybackPreflight,
} from "@/lib/playback-preflight";
import { cn } from "@/lib/cn";

interface PlaybackPreflightPanelProps {
  preflight: PlaybackPreflight | null;
  phase?: "analyzing" | "preparing" | "ready" | "error";
  statusText?: string;
  error?: string;
  className?: string;
  showDebridSearch?: boolean;
  searchingDebrid?: boolean;
  onSearchDebrid?: () => void;
}

export function PlaybackPreflightPanel({
  preflight,
  phase = "analyzing",
  statusText,
  error,
  className,
  showDebridSearch = false,
  searchingDebrid = false,
  onSearchDebrid,
}: PlaybackPreflightPanelProps) {
  const busy = phase === "analyzing" || phase === "preparing";

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-lg rounded-lg border border-white/15 bg-black/85 p-5 text-left shadow-xl backdrop-blur-sm",
        className
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        {busy ? (
          <div className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : preflight?.strategy === "blocked" || error ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-white">
            {phase === "analyzing"
              ? "Analyzing stream…"
              : phase === "preparing"
                ? "Preparing playback…"
                : error
                  ? "Playback blocked"
                  : preflight
                    ? strategyLabel(preflight.strategy)
                    : "Playback"}
          </h2>
          <p className="mt-1 text-sm text-netflix-light-gray">
            {error ||
              statusText ||
              (preflight ? prepEstimateLabel(preflight.prepEstimate) : "Checking codecs and ffmpeg…")}
          </p>
        </div>
      </div>

      {preflight && (
        <dl className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded bg-white/5 px-3 py-2">
            <dt className="flex items-center gap-1 text-netflix-gray">
              <Film className="h-3.5 w-3.5" />
              Video
            </dt>
            <dd className="mt-1 font-medium text-white">
              {preflight.videoCodec?.toUpperCase() ?? "Unknown"}
            </dd>
          </div>
          <div className="rounded bg-white/5 px-3 py-2">
            <dt className="flex items-center gap-1 text-netflix-gray">
              <Volume2 className="h-3.5 w-3.5" />
              Audio
            </dt>
            <dd className="mt-1 font-medium text-white">
              {preflight.defaultAudioCodec?.toUpperCase() ?? "Unknown"}
            </dd>
          </div>
          <div className="rounded bg-white/5 px-3 py-2">
            <dt className="text-netflix-gray">Container</dt>
            <dd className="mt-1 font-medium text-white">{preflight.format}</dd>
          </div>
          <div className="rounded bg-white/5 px-3 py-2">
            <dt className="flex items-center gap-1 text-netflix-gray">
              <Subtitles className="h-3.5 w-3.5" />
              Subtitles
            </dt>
            <dd className="mt-1 font-medium text-white">
              {preflight.subtitleCount}
              {preflight.imageSubtitleCount > 0
                ? ` (${preflight.imageSubtitleCount} image)`
                : ""}
            </dd>
          </div>
        </dl>
      )}

      {preflight && (
        <div className="space-y-2 text-sm">
          {preflight.reasons.map((reason) => (
            <p key={reason} className="text-white/90">
              • {reason}
            </p>
          ))}
          {preflight.warnings.map((warning) => (
            <p key={warning} className="text-yellow-200/90">
              ⚠ {warning}
            </p>
          ))}
          {!preflight.ffmpegAvailable && preflight.ffmpegRequired && (
            <p className="flex items-start gap-2 rounded border border-red-500/30 bg-red-950/40 px-3 py-2 text-red-200">
              <Cpu className="mt-0.5 h-4 w-4 shrink-0" />
              Install ffmpeg in the container (Dockerfile already includes it) or set FFMPEG_PATH.
            </p>
          )}
          {preflight.subtitleNote && (
            <p className="text-netflix-light-gray">{preflight.subtitleNote}</p>
          )}
        </div>
      )}

      {showDebridSearch && onSearchDebrid && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="mb-3 text-sm text-netflix-light-gray">
            This file needs server transcoding. Search Real-Debrid for an H.264/AAC release that may
            direct-play instead (includes CAM and telesync when available).
          </p>
          <button
            type="button"
            onClick={onSearchDebrid}
            disabled={searchingDebrid || busy}
            className="flex w-full items-center justify-center gap-2 rounded bg-netflix-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-netflix-red-hover disabled:cursor-wait disabled:opacity-60"
          >
            {searchingDebrid ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Searching Debrid…
              </>
            ) : (
              <>
                <HardDriveDownload className="h-4 w-4" />
                Search Debrid for direct play
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
