"use client";

import { useEffect, useState } from "react";
import { X, Search, Loader2 } from "lucide-react";
import { MediaImage } from "@/components/ui/MediaImage";
import { posterUrl } from "@/lib/tmdb";
import { matchItemMetadata, searchLibraryItemMatches } from "@/lib/title-actions";
import { dispatchLibraryItemUpdated } from "@/lib/item-update-events";
import type { MediaItem } from "@/lib/types";
import { cn } from "@/lib/cn";

interface MetadataMatchDialogProps {
  item: MediaItem;
  onClose: () => void;
  onMatched?: (item: MediaItem) => void;
}

export function MetadataMatchDialog({ item, onClose, onMatched }: MetadataMatchDialogProps) {
  const [query, setQuery] = useState(item.title);
  const [matches, setMatches] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await searchLibraryItemMatches(item.id, query);
        if (!cancelled) setMatches(data.matches);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Search failed");
          setMatches([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = setTimeout(() => void load(), 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [item.id, query]);

  const applyMatch = async (match: MediaItem) => {
    if (!match.tmdbId || !match.mediaType) return;
    setApplyingId(match.tmdbId);
    setError("");
    try {
      const updated = await matchItemMetadata(item.id, match.tmdbId, match.mediaType);
      dispatchLibraryItemUpdated(updated);
      onMatched?.(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply match");
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-white/15 bg-netflix-dark shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-match-title"
      >
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="metadata-match-title" className="text-lg font-semibold text-white">
              Fix metadata &amp; artwork
            </h2>
            <p className="mt-1 text-sm text-netflix-light-gray">
              Match <span className="text-white">{item.title}</span> to the correct TMDB title.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-netflix-light-gray hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-white/10 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-netflix-gray" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded bg-black/40 py-2 pl-10 pr-3 text-sm text-white outline-none ring-1 ring-white/15 focus:ring-netflix-red"
              placeholder="Search TMDB…"
              autoFocus
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-netflix-light-gray">
              <Loader2 className="h-5 w-5 animate-spin" />
              Searching TMDB…
            </div>
          ) : matches.length === 0 ? (
            <p className="py-12 text-center text-sm text-netflix-light-gray">
              No matches found. Try a different search.
            </p>
          ) : (
            <ul className="space-y-2">
              {matches.map((match) => {
                const poster = posterUrl(match.posterPath, "w342");
                const busy = applyingId === match.tmdbId;
                return (
                  <li key={`${match.mediaType}-${match.tmdbId}`}>
                    <button
                      type="button"
                      disabled={busy || !match.tmdbId || !match.mediaType}
                      onClick={() => void applyMatch(match)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left transition hover:border-white/25 hover:bg-white/5 disabled:opacity-60"
                      )}
                    >
                      <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-zinc-800">
                        {poster ? (
                          <MediaImage src={poster} alt="" fill className="object-cover" sizes="44px" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-netflix-gray">
                            ?
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-white">{match.title}</p>
                        <p className="text-xs text-netflix-light-gray">
                          {match.mediaType === "tv" ? "TV" : "Movie"}
                          {match.releaseDate ? ` · ${match.releaseDate.slice(0, 4)}` : ""}
                          {match.rating ? ` · ★ ${match.rating.toFixed(1)}` : ""}
                        </p>
                        {match.overview && (
                          <p className="mt-1 line-clamp-2 text-xs text-netflix-gray">{match.overview}</p>
                        )}
                      </div>
                      {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
