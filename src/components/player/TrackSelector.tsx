"use client";

import { useState } from "react";
import { Languages, Volume2, ChevronUp } from "lucide-react";
import type { StreamTrack } from "@/types/media-tracks";
import { cn } from "@/lib/cn";

interface TrackSelectorProps {
  audioTracks: StreamTrack[];
  subtitleTracks: StreamTrack[];
  audioIndex: number;
  subtitleIndex: number | null;
  onAudioChange: (index: number) => void;
  onSubtitleChange: (index: number | null) => void;
  disabled?: boolean;
}

export function TrackSelector({
  audioTracks,
  subtitleTracks,
  audioIndex,
  subtitleIndex,
  onAudioChange,
  onSubtitleChange,
  disabled,
}: TrackSelectorProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"audio" | "sub">("audio");

  if (audioTracks.length <= 1 && subtitleTracks.length === 0) return null;

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
          </div>

          <div className="max-h-48 overflow-y-auto">
            {tab === "audio" &&
              audioTracks.map((track) => (
                <button
                  key={track.index}
                  type="button"
                  onClick={() => {
                    onAudioChange(track.index);
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

            {tab === "sub" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onSubtitleChange(null);
                    setOpen(false);
                  }}
                  className={cn(
                    "block w-full px-4 py-2 text-left text-sm hover:bg-white/10",
                    subtitleIndex === null && "text-netflix-red"
                  )}
                >
                  Off
                </button>
                {subtitleTracks.map((track) => (
                  <button
                    key={track.index}
                    type="button"
                    onClick={() => {
                      onSubtitleChange(track.index);
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
