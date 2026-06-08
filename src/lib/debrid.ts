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

export function pickBestVideoFile(torrent: DebridTorrent): number | null {
  const videos = torrent.files.filter((f) => isVideoFile(f.path));
  if (videos.length === 0) return null;
  const selected = videos.find((f) => f.selected === 1) ?? videos[0];
  return selected.id;
}

export async function resolveTorrentStream(
  token: string,
  torrentId: string
): Promise<{ streamUrl: string; filename: string }> {
  let torrent = await getTorrentInfo(token, torrentId);

  if (torrent.status === "waiting_files_selection") {
    const videoId = pickBestVideoFile(torrent);
    if (!videoId) throw new DebridError("No video files found in torrent");
    await selectTorrentFiles(token, torrentId, String(videoId));
    torrent = await getTorrentInfo(token, torrentId);
  }

  if (torrent.progress < 100) {
    throw new DebridError(`Torrent still downloading (${torrent.progress}%)`);
  }

  const link = torrent.links[0];
  if (!link) throw new DebridError("No download links available");

  const unrestricted = await unrestrictLink(token, link);
  return {
    streamUrl: unrestricted.download,
    filename: unrestricted.filename,
  };
}
