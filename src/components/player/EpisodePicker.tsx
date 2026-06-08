"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Play, Library } from "lucide-react";
import { MediaImage } from "@/components/ui/MediaImage";
import { cn } from "@/lib/cn";
import type { SeasonGroup } from "@/lib/episode-library";
import { formatEpisodeLabel } from "@/lib/episode-parse";

interface EpisodePickerProps {
  title: string;
  poster?: string;
  tmdbId?: number;
  seriesId?: string;
  onSelect: (season: number, episode: number) => void;
  onCancel: () => void;
}

export function EpisodePicker({
  title,
  poster,
  tmdbId,
  seriesId,
  onSelect,
  onCancel,
}: EpisodePickerProps) {
  const [seasons, setSeasons] = useState<SeasonGroup[]>([]);
  const [activeSeason, setActiveSeason] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (tmdbId) params.set("tmdbId", String(tmdbId));
      if (seriesId) params.set("seriesId", seriesId);
      params.set("title", title);

      const res = await fetch(`/api/play/episodes?${params}`).catch(() => null);
      if (cancelled) return;

      if (!res?.ok) {
        const data = await res?.json().catch(() => ({}));
        setError(data.message || data.error || "Could not load episodes");
        setLoading(false);
        return;
      }

      const data = await res.json();
      const list = (data.seasons ?? []) as SeasonGroup[];
      setSeasons(list);
      setActiveSeason(list[0]?.season ?? null);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [title, tmdbId, seriesId]);

  const active = seasons.find((s) => s.season === activeSeason);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center gap-4 border-b border-white/10 px-4 py-4 md:px-8">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-2 hover:bg-white/10"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {poster && (
            <div className="relative hidden h-14 w-10 shrink-0 overflow-hidden rounded sm:block">
              <MediaImage src={poster} alt="" fill className="object-cover" sizes="40px" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold md:text-xl">{title}</h1>
            <p className="text-sm text-netflix-light-gray">Choose an episode</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-4 py-3 md:w-48 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
            {seasons.map((group) => (
              <button
                key={group.season}
                type="button"
                onClick={() => setActiveSeason(group.season)}
                className={cn(
                  "shrink-0 rounded px-4 py-2 text-left text-sm transition md:w-full",
                  activeSeason === group.season
                    ? "bg-white text-black"
                    : "bg-white/10 hover:bg-white/20"
                )}
              >
                Season {group.season}
                <span className="ml-2 text-xs opacity-70">{group.episodes.length} eps</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8">
            <div className="mx-auto flex max-w-4xl flex-col gap-2">
              {active?.episodes.map((ep) => (
                <button
                  key={`${ep.season}-${ep.episode}`}
                  type="button"
                  onClick={() => onSelect(ep.season, ep.episode)}
                  className="group flex w-full items-start gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/25 hover:bg-white/10"
                >
                  <div className="relative mt-0.5 flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-800">
                    {ep.stillPath ? (
                      <MediaImage
                        src={ep.stillPath}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="112px"
                      />
                    ) : (
                      <span className="text-xs text-netflix-gray">
                        {formatEpisodeLabel(ep.season, ep.episode)}
                      </span>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <Play className="h-6 w-6 fill-current" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {ep.episode}. {ep.title}
                      </span>
                      {ep.inLibrary && (
                        <span className="flex items-center gap-1 rounded bg-green-900/40 px-2 py-0.5 text-xs text-green-300">
                          <Library className="h-3 w-3" />
                          In library
                        </span>
                      )}
                    </div>
                    {ep.overview && (
                      <p className="line-clamp-2 text-sm text-netflix-light-gray">{ep.overview}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
