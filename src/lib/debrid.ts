import { episodeMatchesPath, parseEpisodeFromText } from "./episode-parse";

const DEBRID_BASE = "https://api.real-debrid.com/rest/1.0";

export class DebridError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "DebridError";
  }
}

async function debridFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${DEBRID_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DebridError(text || res.statusText, res.status);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export interface DebridUser {
  id: number;
  username: string;
  email: string;
  premium: number;
  expiration: string;
}

export interface DebridTorrent {
  id: string;
  filename: string;
  hash: string;
  bytes: number;
  host: string;
  split: number;
  progress: number;
  status: string;
  added: string;
  links: string[];
  files: Array<{
    id: number;
    path: string;
    bytes: number;
    selected: number;
  }>;
}

export async function getDebridUser(token: string): Promise<DebridUser> {
  return debridFetch<DebridUser>("/user", token);
}

export async function addMagnet(token: string, magnet: string): Promise<{ id: string }> {
  const body = new URLSearchParams({ magnet });
  return debridFetch<{ id: string }>("/torrents/addMagnet", token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

export async function getTorrentInfo(token: string, id: string): Promise<DebridTorrent> {
  return debridFetch<DebridTorrent>(`/torrents/info/${id}`, token);
}

export async function selectTorrentFiles(
  token: string,
  id: string,
  fileIds: string
): Promise<void> {
  const body = new URLSearchParams({ files: fileIds });
  await debridFetch<void>(`/torrents/selectFiles/${id}`, token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

export async function unrestrictLink(token: string, link: string): Promise<{ download: string; filename: string; streamable: number }> {
  const body = new URLSearchParams({ link });
  return debridFetch<{ download: string; filename: string; streamable: number }>(
    "/unrestrict/link",
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );
}

export async function listTorrents(token: string): Promise<DebridTorrent[]> {
  return debridFetch<DebridTorrent[]>("/torrents", token);
}

export async function deleteTorrent(token: string, id: string): Promise<void> {
  await debridFetch<void>(`/torrents/delete/${id}`, token, {
    method: "DELETE",
  });
}

const VIDEO_EXTENSIONS = [".mkv", ".mp4", ".avi", ".xvid", ".mov", ".wmv", ".m4v", ".webm"];

export function isVideoFile(path: string): boolean {
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function pickVideoFileForEpisode(
  torrent: DebridTorrent,
  season?: number,
  episode?: number
): number | null {
  const videos = torrent.files.filter((f) => isVideoFile(f.path));
  if (videos.length === 0) return null;

  if (season != null && episode != null) {
    const match = videos.find((f) => episodeMatchesPath(f.path, season, episode));
    if (match) return match.id;

    const sorted = [...videos].sort((a, b) => {
      const pa = parseEpisodeFromText(a.path);
      const pb = parseEpisodeFromText(b.path);
      if (!pa || !pb) return 0;
      if (pa.season !== pb.season) return pa.season - pb.season;
      return pa.episode - pb.episode;
    });
    const index = sorted.findIndex((f) => {
      const p = parseEpisodeFromText(f.path);
      return p?.season === season && p?.episode === episode;
    });
    if (index >= 0) return sorted[index].id;
  }

  const selected = videos.find((f) => f.selected === 1);
  if (selected) return selected.id;
  return videos[0].id;
}

export function pickBestVideoFile(torrent: DebridTorrent): number | null {
  return pickVideoFileForEpisode(torrent);
}

function isTorrentReady(torrent: DebridTorrent): boolean {
  return torrent.status === "downloaded" || torrent.progress >= 100;
}

async function waitForTorrentReady(
  token: string,
  torrentId: string,
  timeoutMs = 45_000
): Promise<DebridTorrent> {
  const start = Date.now();
  let delayMs = 250;

  while (Date.now() - start < timeoutMs) {
    const torrent = await getTorrentInfo(token, torrentId);
    if (isTorrentReady(torrent)) return torrent;
    if (torrent.status === "error" || torrent.status === "magnet_error") {
      throw new DebridError(`Torrent failed: ${torrent.status}`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
    delayMs = Math.min(delayMs * 2, 3000);
  }
  throw new DebridError("Torrent download timed out on Real-Debrid");
}

/** Reuse an already-cached torrent on the RD account when the info-hash matches. */
export async function findOrAddTorrentByMagnet(
  token: string,
  magnet: string
): Promise<string> {
  const hash = extractInfoHash(magnet);
  if (hash) {
    const existing = await listTorrents(token);
    const match = existing.find((t) => t.hash.toLowerCase() === hash);
    if (match) return match.id;
  }
  const { id } = await addMagnet(token, magnet);
  return id;
}

export function extractMagnetFromText(text: string): string | null {
  const match = text.match(/magnet:\?[^"'\\s]+/i);
  return match ? decodeURIComponent(match[0]) : null;
}

export function extractInfoHash(text: string): string | null {
  const magnet = extractMagnetFromText(text) ?? text;
  const match = magnet.match(/btih:([a-f0-9]{40}|[a-z2-7]{32})/i);
  return match ? match[1].toLowerCase() : null;
}

async function unrestrictTorrentLink(
  token: string,
  torrent: DebridTorrent,
  fileId: number
): Promise<{ streamUrl: string; filename: string }> {
  const selected = torrent.files.filter((f) => f.selected === 1);
  const linkIndex = selected.findIndex((f) => f.id === fileId);
  const link = torrent.links[linkIndex >= 0 ? linkIndex : 0] ?? torrent.links[0];
  if (!link) throw new DebridError("No download link for selected file");
  const unrestricted = await unrestrictLink(token, link);
  return {
    streamUrl: unrestricted.download,
    filename: unrestricted.filename,
  };
}

export async function resolveTorrentStreamForEpisode(
  token: string,
  torrentId: string,
  season?: number,
  episode?: number
): Promise<{ streamUrl: string; filename: string }> {
  let torrent = await getTorrentInfo(token, torrentId);

  if (torrent.status === "waiting_files_selection") {
    const videoId = pickVideoFileForEpisode(torrent, season, episode);
    if (!videoId) throw new DebridError("No video files found in torrent");
    await selectTorrentFiles(token, torrentId, String(videoId));
    torrent = await getTorrentInfo(token, torrentId);
  }

  if (!isTorrentReady(torrent)) {
    torrent = await waitForTorrentReady(token, torrentId);
  }

  const videoId = pickVideoFileForEpisode(torrent, season, episode);
  if (!videoId) throw new DebridError("No matching episode file in torrent");

  const selected = torrent.files.filter((f) => f.selected === 1);
  const needsSelect =
    selected.length !== 1 || !selected.some((f) => f.id === videoId);

  if (needsSelect) {
    await selectTorrentFiles(token, torrentId, String(videoId));
    torrent = await getTorrentInfo(token, torrentId);
    if (!isTorrentReady(torrent)) {
      torrent = await waitForTorrentReady(token, torrentId);
    }
  }

  return unrestrictTorrentLink(token, torrent, videoId);
}

export async function resolveMagnetStreamForEpisode(
  token: string,
  magnet: string,
  season?: number,
  episode?: number
): Promise<{ streamUrl: string; filename: string }> {
  const id = await findOrAddTorrentByMagnet(token, magnet);
  return resolveTorrentStreamForEpisode(token, id, season, episode);
}

export async function resolveTorrentStream(
  token: string,
  torrentId: string,
  season?: number,
  episode?: number
): Promise<{ streamUrl: string; filename: string }> {
  return resolveTorrentStreamForEpisode(token, torrentId, season, episode);
}
