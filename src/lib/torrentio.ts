export interface TorrentioStream {
  name?: string;
  title?: string;
  url?: string;
  behaviorHints?: {
    bingeGroup?: string;
    notWebReady?: boolean;
    proxyHeaders?: Record<string, string>;
  };
}

export interface TorrentioStreamResponse {
  streams: TorrentioStream[];
}

export function normalizeTorrentioBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/manifest\.json$/i, "")
    .replace(/\/$/, "");
}

export function buildDefaultTorrentioUrl(realDebridToken: string): string {
  return `https://torrentio.strem.fun/realdebrid=${encodeURIComponent(realDebridToken)}|sort=quality|qualityfilter=480p,scr,cam,unknown`;
}

export function buildStreamVideoId(options: {
  tmdbId?: number;
  imdbId?: string;
  type: "movie" | "series";
  season?: number;
  episode?: number;
}): string {
  const { tmdbId, imdbId, type, season, episode } = options;

  if (imdbId) {
    const id = imdbId.startsWith("tt") ? imdbId : `tt${imdbId}`;
    if (type === "series" && season != null && episode != null) {
      return `${id}:${season}:${episode}`;
    }
    return id;
  }

  if (!tmdbId) {
    throw new Error("tmdbId or imdbId required for torrent search");
  }

  if (type === "series" && season != null && episode != null) {
    return `tmdb:${tmdbId}:${season}:${episode}`;
  }

  return `tmdb:${tmdbId}`;
}

export async function fetchTorrentioStreams(
  baseUrl: string,
  type: "movie" | "series",
  videoId: string
): Promise<TorrentioStream[]> {
  const root = normalizeTorrentioBaseUrl(baseUrl);
  const url = `${root}/stream/${type}/${encodeURIComponent(videoId)}.json`;

  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Notflix/1.0" },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Torrentio error (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as TorrentioStreamResponse;
  return data.streams ?? [];
}

const QUALITY_ORDER = ["4k", "2160", "1080", "720", "480"];

function streamScore(stream: TorrentioStream): number {
  const label = `${stream.name ?? ""} ${stream.title ?? ""}`.toLowerCase();
  if (label.includes("download") || label.includes("⬇")) return -100;
  if (stream.behaviorHints?.notWebReady) return -50;
  if (!stream.url?.startsWith("http")) return -200;

  let score = 0;
  for (let i = 0; i < QUALITY_ORDER.length; i++) {
    if (label.includes(QUALITY_ORDER[i])) {
      score += (QUALITY_ORDER.length - i) * 10;
      break;
    }
  }
  if (label.includes("rd") || label.includes("real-debrid") || label.includes("debrid")) {
    score += 5;
  }
  return score;
}

export function pickBestTorrentioStream(streams: TorrentioStream[]): TorrentioStream | null {
  const candidates = streams
    .filter((s) => s.url?.startsWith("http"))
    .sort((a, b) => streamScore(b) - streamScore(a));

  return candidates[0] ?? null;
}

export async function resolveTorrentioStreamUrl(streamUrl: string): Promise<string> {
  const res = await fetch(streamUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "*/*",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to resolve stream (${res.status})`);
  }

  return res.url;
}
