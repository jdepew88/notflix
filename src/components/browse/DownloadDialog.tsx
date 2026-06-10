"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, FolderOpen, HardDriveDownload, Loader2 } from "lucide-react";
import { StreamPicker } from "@/components/player/StreamPicker";
import {
  downloadTitleTorrent,
  loadTorrentDownloadOptions,
  resolveTitleDownload,
  startDirectDownload,
} from "@/lib/download-title";
import type { DirectDownloadResult, DownloadResolveResult } from "@/lib/download-playback";
import type { TorrentioStreamOption } from "@/lib/torrentio";
import type { MediaItem } from "@/lib/types";
import { useAppStore } from "@/lib/store";

type Phase = "loading" | "direct" | "torrents" | "error";

interface DownloadDialogProps {
  item: MediaItem;
  onClose: () => void;
}

export function DownloadDialog({ item, onClose }: DownloadDialogProps) {
  const settings = useAppStore((s) => s.settings);
  const [phase, setPhase] = useState<Phase>("loading");
  const [direct, setDirect] = useState<DirectDownloadResult | null>(null);
  const [streams, setStreams] = useState<TorrentioStreamOption[]>([]);
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [hint, setHint] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [openingIndex, setOpeningIndex] = useState<number | null>(null);
  const [loadingTorrents, setLoadingTorrents] = useState(false);
  const [canSearchDebrid, setCanSearchDebrid] = useState(false);

  const applyResult = useCallback((result: DownloadResolveResult) => {
    if (result.mode === "direct") {
      setDirect(result);
      setCanSearchDebrid(result.canSearchDebrid);
      setHeadline(result.headline);
      setDescription(result.description);
      setPhase("direct");
      return;
    }

    setStreams(result.streams);
    setHeadline(result.headline);
    setDescription(result.description);
    setHint(result.message);
    setPhase("torrents");
  }, []);

  useEffect(() => {
    let cancelled = false;

    void resolveTitleDownload(item, settings)
      .then((result) => {
        if (cancelled) return;
        applyResult(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Download failed");
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [item, settings, applyResult]);

  const openTorrentPicker = async () => {
    setLoadingTorrents(true);
    setError(null);
    try {
      const listed = await loadTorrentDownloadOptions(item, settings);
      setStreams(listed.streams);
      setHint(listed.message);
      setHeadline("Real-Debrid torrents");
      setDescription(
        "Pick a torrent to download. Notflix unlocks it through Real-Debrid and sends the file to your browser."
      );
      setPhase("torrents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Torrent search failed");
    } finally {
      setLoadingTorrents(false);
    }
  };

  if (phase === "torrents") {
    return (
      <StreamPicker
        variant="download"
        title={`Download ${item.title}`}
        subtitle={headline}
        hint={hint ?? description}
        streams={streams}
        error={error ?? undefined}
        openingIndex={openingIndex}
        onCancel={onClose}
        onSelect={(index) => {
          setOpeningIndex(index);
          setError(null);
          void downloadTitleTorrent(item, index, settings)
            .then(() => onClose())
            .catch((err) => {
              setError(err instanceof Error ? err.message : "Download failed");
            })
            .finally(() => setOpeningIndex(null));
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-lg border border-white/15 bg-zinc-900 shadow-2xl"
        role="dialog"
        aria-labelledby="download-dialog-title"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Close"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 id="download-dialog-title" className="truncate text-lg font-semibold">
              Download {item.title}
            </h2>
          </div>
        </div>

        <div className="px-5 py-6">
          {phase === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-netflix-red" />
              <p className="text-sm text-netflix-light-gray">
                Checking Plex library and download options…
              </p>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-4">
              <div className="rounded bg-red-900/40 px-4 py-3 text-sm text-red-200">{error}</div>
              <button
                type="button"
                onClick={() => {
                  setPhase("loading");
                  setError(null);
                  void resolveTitleDownload(item, settings)
                    .then(applyResult)
                    .catch((err) => {
                      setError(err instanceof Error ? err.message : "Download failed");
                      setPhase("error");
                    });
                }}
                className="w-full rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
              >
                Try again
              </button>
            </div>
          )}

          {phase === "direct" && direct && (
            <div className="space-y-5">
              <div>
                <p className="text-base font-medium text-white">{headline}</p>
                <p className="mt-1 text-sm text-netflix-light-gray">{description}</p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-netflix-red/20 text-netflix-red">
                    {direct.source === "library" ? (
                      <FolderOpen className="h-5 w-5" />
                    ) : (
                      <HardDriveDownload className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-white">{direct.label ?? direct.source}</p>
                    <p className="truncate text-sm text-netflix-light-gray">{direct.filename}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => startDirectDownload(direct)}
                  className="flex w-full items-center justify-center gap-2 rounded bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
                >
                  <Download className="h-4 w-4" />
                  Download file
                </button>
              </div>

              {canSearchDebrid && (
                <button
                  type="button"
                  disabled={loadingTorrents}
                  onClick={() => void openTorrentPicker()}
                  className="w-full text-sm text-netflix-light-gray underline transition hover:text-white disabled:opacity-50"
                >
                  {loadingTorrents
                    ? "Searching Real-Debrid torrents…"
                    : "Not the right file? Search Real-Debrid torrents instead"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
