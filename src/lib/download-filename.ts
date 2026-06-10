import path from "path";
import type { MediaItem } from "./types";

export function sanitizeDownloadFilename(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return cleaned || "video.mkv";
}

export function downloadFilenameForItem(item: MediaItem): string {
  if (item.filePath) {
    return sanitizeDownloadFilename(path.basename(item.filePath));
  }

  let name = item.episodeTitle?.trim() || item.title.trim() || "video";
  const year = item.releaseDate?.slice(0, 4);
  if (year && !name.includes(year)) {
    name = `${name} (${year})`;
  }
  if (item.season != null && item.episode != null) {
    name += ` S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}`;
  }

  const ext = guessExtension(item);
  const base = sanitizeDownloadFilename(name);
  if (/\.(mkv|mp4|avi|webm|m4v|mov)$/i.test(base)) return base;
  return `${base}${ext}`;
}

function guessExtension(item: MediaItem): string {
  const fromPath = item.filePath || item.streamUrl || "";
  const ext = path.extname(fromPath.split("?")[0]).toLowerCase();
  if (ext && /^\.(mkv|mp4|avi|webm|m4v|mov)$/.test(ext)) return ext;
  return ".mkv";
}

export function attachmentContentDisposition(filename: string): string {
  const safe = sanitizeDownloadFilename(filename);
  const encoded = encodeURIComponent(safe).replace(/'/g, "%27");
  return `attachment; filename="${safe.replace(/"/g, "")}"; filename*=UTF-8''${encoded}`;
}

export function withDownloadQuery(url: string, filename: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}download=1&filename=${encodeURIComponent(sanitizeDownloadFilename(filename))}`;
}

/** Build a browser-navigable download URL (same-origin proxy or external HTTPS). */
export function buildDownloadUrl(
  streamUrl: string,
  filename: string,
  options: { plexToken?: string } = {}
): string {
  const safeName = sanitizeDownloadFilename(filename);

  if (/^https?:\/\//i.test(streamUrl)) {
    return streamUrl;
  }

  const params = new URLSearchParams();
  const queryStart = streamUrl.indexOf("?");
  const path = queryStart >= 0 ? streamUrl.slice(0, queryStart) : streamUrl;
  const existing = queryStart >= 0 ? streamUrl.slice(queryStart + 1) : "";
  if (existing) {
    for (const part of existing.split("&")) {
      const [key, ...rest] = part.split("=");
      if (key) params.set(key, decodeURIComponent(rest.join("=")));
    }
  }

  params.set("download", "1");
  params.set("filename", safeName);
  if (options.plexToken && path.includes("/api/plex/stream")) {
    params.set("token", options.plexToken);
  }

  return `${path}?${params.toString()}`;
}
