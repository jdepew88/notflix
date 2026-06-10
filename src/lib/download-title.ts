import { canPlayItem } from "./playback";
import { isSeriesItem } from "./watch-url";
import type { TorrentioStreamOption } from "./torrentio";
import type { MediaItem } from "./types";
import type { DownloadResolveResult } from "./download-playback";

export function canDownloadItem(item: MediaItem): boolean {
  if (item.filePath) return true;
  if (isSeriesItem(item) && item.type !== "episode") {
    if (item.season == null || item.episode == null) return false;
  }
  return canPlayItem(item);
}

function downloadQueryForItem(item: MediaItem, streamIndex?: number): string {
  const params = new URLSearchParams();
  params.set("itemId", item.id);

  if (item.tmdbId) params.set("tmdbId", String(item.tmdbId));
  if (item.title) params.set("title", item.title);

  const type = item.type === "episode" || isSeriesItem(item) ? "series" : "movie";
  params.set("type", type);

  if (item.season != null) params.set("season", String(item.season));
  if (item.episode != null) params.set("episode", String(item.episode));
  if (item.seriesId) params.set("seriesId", item.seriesId);

  const year = item.releaseDate?.slice(0, 4);
  if (year) params.set("year", year);
  if (streamIndex != null) params.set("streamIndex", String(streamIndex));

  return params.toString();
}

export function triggerBrowserDownload(downloadUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function resolveTitleDownload(item: MediaItem): Promise<DownloadResolveResult> {
  const res = await fetch(`/api/play/download?${downloadQueryForItem(item)}`, {
    credentials: "same-origin",
  });
  const data = (await res.json()) as DownloadResolveResult & { error?: string };

  if (!res.ok) {
    throw new Error(data.error || "Could not resolve download");
  }

  return data;
}

export async function downloadTitleTorrent(item: MediaItem, streamIndex: number): Promise<void> {
  const res = await fetch(
    `/api/play/download?${downloadQueryForItem(item, streamIndex)}`,
    { credentials: "same-origin" }
  );
  const data = (await res.json()) as {
    error?: string;
    mode?: string;
    downloadUrl?: string;
    filename?: string;
  };

  if (!res.ok || data.mode !== "direct" || !data.downloadUrl) {
    throw new Error(data.error || "Could not start torrent download");
  }

  triggerBrowserDownload(data.downloadUrl, data.filename || "video.mkv");
}

export type TorrentDownloadPickerState = {
  item: MediaItem;
  streams: TorrentioStreamOption[];
  message?: string;
};

export async function startTitleDownload(
  item: MediaItem
): Promise<TorrentDownloadPickerState | null> {
  const result = await resolveTitleDownload(item);

  if (result.mode === "direct") {
    triggerBrowserDownload(result.downloadUrl, result.filename);
    return null;
  }

  return {
    item,
    streams: result.streams,
    message: result.message,
  };
}
