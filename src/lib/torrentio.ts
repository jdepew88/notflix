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
  return `https://torrentio.strem.fun/realdebrid=${encodeURIComponent(realDebridToken)}|sort=quality|qualityfilter=480p,scr,cam,unknown|language=english`;
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
    if (text.trimStart().toLowerCase().startsWith("<!doctype")) {
      throw new Error("Torrentio returned an error page. Check Real-Debrid token and try again.");
    }
    throw new Error(`Torrentio error (${res.status}): ${text.slice(0, 200)}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("Torrentio returned HTML instead of stream list. Check Real-Debrid configuration.");
  }

  const data = (await res.json()) as TorrentioStreamResponse;
  return data.streams ?? [];
}

const QUALITY_ORDER = ["4k", "2160", "1080", "720", "480"];

export interface TorrentioStreamOption {
  index: number;
  label: string;
  detail: string;
  quality?: string;
  cached: boolean;
  score: number;
  recommended: boolean;
}

const NON_ENGLISH_MARKERS = [
  "french",
  "german",
  "spanish",
  "italian",
  "portuguese",
  "russian",
  "hindi",
  "tamil",
  "telugu",
  "japanese",
  "korean",
  "chinese",
  "mandarin",
  "cantonese",
  "vostfr",
  "multi.french",
  "multi-french",
];

function streamLabel(stream: TorrentioStream): string {
  return `${stream.name ?? ""} ${stream.title ?? ""}`.toLowerCase();
}

function isLikelyEnglishStream(stream: TorrentioStream): boolean {
  const label = streamLabel(stream);
  if (NON_ENGLISH_MARKERS.some((m) => label.includes(m))) return false;
  if (label.includes("english") || label.includes(" eng ") || /\beng\b/.test(label)) {
    return true;
  }
  if (label.includes("multi")) return true;
  return !/\b(fr|de|es|it|pt|ru|ja|ko|zh)\b/.test(label);
}

export function streamScore(stream: TorrentioStream): number {
  const label = streamLabel(stream);
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
  if (label.includes("aac")) score += 15;
  if (label.includes("x264") || label.includes("h264") || label.includes("h.264")) score += 10;
  if (label.includes("x265") || label.includes("hevc") || label.includes("h265")) score += 6;
  if (label.includes(".mp4") || label.includes(" mp4")) score += 8;
  if (label.includes("english") || label.includes(" eng ")) score += 12;
  return score;
}

function parseStreamQuality(label: string): string | undefined {
  const lower = label.toLowerCase();
  for (const q of ["4k", "2160p", "1080p", "720p", "480p"]) {
    if (lower.includes(q)) return q.toUpperCase().replace("2160P", "4K");
  }
  return undefined;
}

function formatStreamOption(stream: TorrentioStream, index: number, recommended: boolean): TorrentioStreamOption {
  const rawTitle = (stream.title ?? stream.name ?? "Stream").trim();
  const lines = rawTitle.split("\n").map((l) => l.trim()).filter(Boolean);
  const label = lines[0] || "Stream";
  const detail = lines.slice(1).join(" · ") || rawTitle;
  const combined = `${stream.name ?? ""} ${stream.title ?? ""}`.toLowerCase();
  const cached =
    combined.includes("rd") ||
    combined.includes("real-debrid") ||
    combined.includes("debrid") ||
    combined.includes("⚡");

  return {
    index,
    label,
    detail,
    quality: parseStreamQuality(combined),
    cached,
    score: streamScore(stream),
    recommended,
  };
}

export function listPlayableTorrentioStreams(streams: TorrentioStream[]): {
  playable: TorrentioStream[];
  options: TorrentioStreamOption[];
} {
  const playable = streams
    .filter((s) => s.url?.startsWith("http"))
    .filter(isLikelyEnglishStream)
    .sort((a, b) => streamScore(b) - streamScore(a));

  const options = playable.map((stream, index) =>
    formatStreamOption(stream, index, index === 0)
  );

  return { playable, options };
}

export function pickBestTorrentioStream(streams: TorrentioStream[]): TorrentioStream | null {
  const candidates = streams
    .filter((s) => s.url?.startsWith("http"))
    .filter(isLikelyEnglishStream)
    .sort((a, b) => streamScore(b) - streamScore(a));

  return candidates[0] ?? null;
}

export async function resolveTorrentioStreamUrl(
  streamUrl: string,
  realDebridToken?: string
): Promise<string> {
  let currentUrl = streamUrl;

  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "application/json, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = (await res.json()) as Record<string, unknown>;
      const next =
        (typeof data.url === "string" ? data.url : "") ||
        (typeof data.download === "string" ? data.download : "") ||
        (typeof data.stream_url === "string" ? data.stream_url : "") ||
        (typeof data.link === "string" ? data.link : "");
      if (next.startsWith("http")) {
        currentUrl = next;
        continue;
      }
      throw new Error("Torrent stream resolver returned JSON without a download URL");
    }

    if (contentType.includes("text/html")) {
      const snippet = (await res.text()).slice(0, 256).toLowerCase();
      if (snippet.includes("<!doctype") || snippet.includes("<html")) {
        throw new Error(
          "Stream not ready on Real-Debrid. Choose a cached (⚡) release or try 1080p instead of 4K."
        );
      }
    }

    break;
  }

  return finalizeDebridDownloadUrl(currentUrl, realDebridToken);
}

async function finalizeDebridDownloadUrl(
  url: string,
  token?: string
): Promise<string> {
  if (!token) return url;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const needsUnrestrict =
      (host === "real-debrid.com" || host === "www.real-debrid.com") &&
      parsed.pathname.includes("/d/");

    if (needsUnrestrict) {
      const { unrestrictLink } = await import("./debrid");
      const result = await unrestrictLink(token, url);
      return result.download;
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Stream not ready")) throw err;
  }

  return url;
}
