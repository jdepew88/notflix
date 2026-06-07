"use client";

import { cn } from "@/lib/cn";

export interface LibrarySyncStatus {
  status?: string;
  phase?: string;
  message?: string;
  percent?: number;
  itemsLoaded?: number;
  running?: boolean;
  error?: string;
}

interface LibrarySyncBarProps {
  sync: LibrarySyncStatus | null;
  className?: string;
}

export function LibrarySyncBar({ sync, className }: LibrarySyncBarProps) {
  if (!sync) return null;

  const active =
    sync.running ||
    sync.status === "running" ||
    (sync.percent !== undefined && sync.percent > 0 && sync.percent < 100 && sync.status !== "done");

  if (!active && sync.status !== "error") return null;

  const percent = Math.max(0, Math.min(100, sync.percent ?? 0));

  return (
    <div
      className={cn(
        "border-b border-white/10 bg-zinc-950/95 px-4 py-3 backdrop-blur md:px-12 lg:px-16",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className={sync.status === "error" ? "text-red-300" : "text-white"}>
            {sync.status === "error"
              ? sync.error || sync.message || "Library sync failed"
              : sync.message || "Syncing Plex library…"}
          </span>
          {active && (
            <span className="text-netflix-light-gray">
              {sync.itemsLoaded ? `${sync.itemsLoaded} titles · ` : ""}
              {percent}%
            </span>
          )}
        </div>
        {active && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-netflix-red transition-all duration-300 ease-out"
              style={{ width: `${Math.max(percent, 3)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
