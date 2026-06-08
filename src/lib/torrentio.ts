import {
  fetchStremioStreams,
  isLikelyEnglishStream,
  listPlayableStremioStreams,
  normalizeStremioBaseUrl,
  streamScore,
  type StremioStream,
  type StremioStreamOption,
} from "./stremio-streams";

export type TorrentioStream = StremioStream;
export type TorrentioStreamOption = StremioStreamOption;

export {
  isLikelyEnglishStream,
  listPlayableStremioStreams as listPlayableTorrentioStreams,
  normalizeStremioBaseUrl as normalizeTorrentioBaseUrl,
  streamScore,
};

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
  return fetchStremioStreams(baseUrl, type, videoId);
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
