import { canPlayItem } from "./playback";
import { isSeriesItem } from "./watch-url";
import {
  ensurePlexCookies,
  fetchWithSettings,
  getEffectiveSettings,
} from "./client-settings";
import type { AppSettings, MediaItem } from "./types";
import type { DirectDownloadResult, DownloadResolveResult } from "./download-playback";
import type { TorrentioStreamOption } from "./torrentio";

export function canDownloadItem(item: MediaItem): boolean {
  if (item.filePath) return true;
  if (isSeriesItem(item) && item.type !== "episode") {
    if (item.season == null || item.episode == null) return false;
  }
  return canPlayItem(item);
}

function downloadQueryForItem(
  item: MediaItem,
  options: { streamIndex?: number; forceDebrid?: boolean } = {}
): string {
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
  if (options.streamIndex != null) params.set("streamIndex", String(options.streamIndex));
  if (options.forceDebrid) params.set("forceDebrid", "1");

  return params.toString();
}

/** Navigate to a download URL so Content-Disposition / HTTPS links work reliably. */
export function triggerBrowserDownload(downloadUrl: string, _filename: string): void {
  if (/^https?:\/\//i.test(downloadUrl)) {
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(downloadUrl);
}

async function fetchDownloadApi(
  item: MediaItem,
  settings: Partial<AppSettings>,
  options: { streamIndex?: number; forceDebrid?: boolean } = {}
): Promise<DownloadResolveResult> {
  const effective = getEffectiveSettings(settings);
  await ensurePlexCookies(effective);

  const res = await fetchWithSettings(
    `/api/play/download?${downloadQueryForItem(item, options)}`,
    effective
  );
  const data = (await res.json()) as DownloadResolveResult & { error?: string };

  if (!res.ok) {
    throw new Error(data.error || "Could not resolve download");
  }

  return data;
}

export async function resolveTitleDownload(
  item: MediaItem,
  settings?: Partial<AppSettings>,
  options: { forceDebrid?: boolean } = {}
): Promise<DownloadResolveResult> {
  return fetchDownloadApi(item, getEffectiveSettings(settings), options);
}

export async function loadTorrentDownloadOptions(
  item: MediaItem,
  settings?: Partial<AppSettings>
): Promise<{ streams: TorrentioStreamOption[]; message?: string }> {
  const result = await fetchDownloadApi(item, getEffectiveSettings(settings), {
    forceDebrid: true,
  });
  if (result.mode !== "pick") {
    throw new Error("No torrent sources returned");
  }
  return { streams: result.streams, message: result.message };
}

export async function startDirectDownload(
  result: DirectDownloadResult,
  settings?: Partial<AppSettings>
): Promise<void> {
  const effective = getEffectiveSettings(settings);
  await ensurePlexCookies(effective);
  triggerBrowserDownload(result.downloadUrl, result.filename);
}

export async function downloadTitleTorrent(
  item: MediaItem,
  streamIndex: number,
  settings?: Partial<AppSettings>
): Promise<DirectDownloadResult> {
  const result = await fetchDownloadApi(item, getEffectiveSettings(settings), { streamIndex });
  if (result.mode !== "direct") {
    throw new Error("Could not start torrent download");
  }
  await startDirectDownload(result, settings);
  return result;
}
