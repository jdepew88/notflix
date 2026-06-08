"use client";

import { useRef, useState } from "react";
import { Languages, Volume2, ChevronUp, Upload } from "lucide-react";
import type { StreamTrack } from "@/types/media-tracks";
import { cn } from "@/lib/cn";

function isEnglishTrack(track: StreamTrack): boolean {
  const lang = (track.language || track.title || "").toLowerCase();
  return lang === "en" || lang === "eng" || lang.startsWith("en-") || lang.includes("english");
}

function sortSubtitleTracks(tracks: StreamTrack[]): StreamTrack[] {
  return [...tracks].sort((a, b) => {
    const aEn = isEnglishTrack(a);
    const bEn = isEnglishTrack(b);
    if (aEn !== bEn) return aEn ? -1 : 1;
    return a.index - b.index;
  });
}

interface TrackSelectorProps {
  audioTracks: StreamTrack[];
  subtitleTracks: StreamTrack[];
  audioIndex: number;
  subtitleIndex: number | null;
  onAudioChange?: (index: number) => void;
  onSubtitleChange?: (index: number | null) => void;
  onExternalSubtitle?: (file: File) => void;
  externalSubtitleName?: string | null;
  disabled?: boolean;
}

export function TrackSelector({
  audioTracks,
  subtitleTracks,
  audioIndex,
  subtitleIndex,
  onAudioChange,
  onSubtitleChange,
  onExternalSubtitle,
  externalSubtitleName,
  disabled,
}: TrackSelectorProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"audio" | "sub">("audio");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedSubs = sortSubtitleTracks(subtitleTracks);
  const hasAudio = audioTracks.length > 0;
  const hasSubs = subtitleTracks.length > 0 || Boolean(onExternalSubtitle);

  if (!hasAudio && !hasSubs) return null;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-white hover:text-netflix-light-gray disabled:opacity-50"
        title="Audio & Subtitles"
      >
        <Languages className="h-5 w-5" />
        <ChevronUp className={cn("h-3 w-3 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-72 rounded bg-black/95 py-2 shadow-xl ring-1 ring-white/10">
          <div className="mb-2 flex border-b border-white/10">
            {hasAudio && (
              <button
                type="button"
                onClick={() => setTab("audio")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 py-2 text-sm",
                  tab === "audio" ? "text-white" : "text-netflix-gray"
                )}
              >
                <Volume2 className="h-4 w-4" />
                Audio
              </button>
            )}
            {hasSubs && (
              <button
                type="button"
                onClick={() => setTab("sub")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 py-2 text-sm",
                  tab === "sub" ? "text-white" : "text-netflix-gray"
                )}
              >
                <Languages className="h-4 w-4" />
                Subtitles
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto">
            {tab === "audio" &&
              hasAudio &&
              audioTracks.map((track) => (
                <button
                  key={track.index}
                  type="button"
                  onClick={() => {
                    onAudioChange?.(track.index);
                    setOpen(false);
                  }}
                  className={cn(
                    "block w-full px-4 py-2 text-left text-sm hover:bg-white/10",
                    audioIndex === track.index && "text-netflix-red"
                  )}
                >
                  {track.label}
                </button>
              ))}

            {tab === "sub" && hasSubs && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onSubtitleChange?.(null);
                    setOpen(false);
                  }}
                  className={cn(
                    "block w-full px-4 py-2 text-left text-sm hover:bg-white/10",
                    subtitleIndex === null && !externalSubtitleName && "text-netflix-red"
                  )}
                >
                  Off
                </button>
                {sortedSubs.map((track) => (
                  <button
                    key={track.index}
                    type="button"
                    onClick={() => {
                      onSubtitleChange?.(track.index);
                      setOpen(false);
                    }}
                    className={cn(
                      "block w-full px-4 py-2 text-left text-sm hover:bg-white/10",
                      subtitleIndex === track.index && "text-netflix-red"
                    )}
                  >
                    {track.label}
                  </button>
                ))}
                {externalSubtitleName && (
                  <p className="px-4 py-2 text-xs text-netflix-gray">
                    External: {externalSubtitleName}
                  </p>
                )}
                {onExternalSubtitle && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".srt,.vtt,text/vtt,application/x-subrip"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          onExternalSubtitle(file);
                          setOpen(false);
                        }
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-white/10"
                    >
                      <Upload className="h-4 w-4" />
                      Load external subtitle…
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
