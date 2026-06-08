export interface StremioStream {
  name?: string;
  title?: string;
  url?: string;
  behaviorHints?: {
    bingeGroup?: string;
    notWebReady?: boolean;
    proxyHeaders?: Record<string, string>;
  };
}

export interface StremioStreamResponse {
  streams: StremioStream[];
}

export function normalizeStremioBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/manifest\.json$/i, "")
    .replace(/\/$/, "");
}

export async function fetchStremioStreams(
  baseUrl: string,
  type: "movie" | "series",
  videoId: string
): Promise<StremioStream[]> {
  const root = normalizeStremioBaseUrl(baseUrl);
  const url = `${root}/stream/${type}/${encodeURIComponent(videoId)}.json`;

  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Notflix/1.0" },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (text.trimStart().toLowerCase().startsWith("<!doctype")) {
      throw new Error("Addon returned an error page. Check addon URL and credentials.");
    }
    throw new Error(`Addon error (${res.status}): ${text.slice(0, 200)}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("Addon returned HTML instead of stream list. Check configuration.");
  }

  const data = (await res.json()) as StremioStreamResponse;
  return data.streams ?? [];
}

const QUALITY_ORDER = ["4k", "2160", "1080", "720", "480"];

export interface StremioStreamOption {
  index: number;
  label: string;
  detail: string;
  quality?: string;
  cached: boolean;
  score: number;
  recommended: boolean;
  source?: string;
}

const NON_ENGLISH_MARKERS = [
  "french",
  "german",
  "spanish",
  "espanol",
  "español",
  "castellano",
  "latino",
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
  "multi.spanish",
  "multi-spanish",
];

function streamLabel(stream: StremioStream): string {
  return `${stream.name ?? ""} ${stream.title ?? ""}`.toLowerCase();
}

export function isLikelyEnglishStream(stream: StremioStream): boolean {
  const label = streamLabel(stream);
  if (NON_ENGLISH_MARKERS.some((m) => label.includes(m))) return false;
  if (label.includes("english") || label.includes(" eng ") || /\beng\b/.test(label)) {
    return true;
  }
  if (label.includes("multi")) return true;
  return !/\b(fr|de|es|it|pt|ru|ja|ko|zh)\b/.test(label);
}

export function streamScore(stream: StremioStream): number {
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

function formatStreamOption(
  stream: StremioStream,
  index: number,
  recommended: boolean,
  source?: string
): StremioStreamOption {
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
    source,
  };
}

export function listPlayableStremioStreams(
  streams: StremioStream[],
  source?: string
): {
  playable: StremioStream[];
  options: StremioStreamOption[];
} {
  const playable = streams
    .filter((s) => s.url?.startsWith("http"))
    .filter(isLikelyEnglishStream)
    .sort((a, b) => streamScore(b) - streamScore(a));

  const options = playable.map((stream, index) =>
    formatStreamOption(stream, index, index === 0, source)
  );

  return { playable, options };
}

export function mergeStremioStreamLists(
  lists: Array<{ streams: StremioStream[]; source: string }>
): { playable: StremioStream[]; options: StremioStreamOption[] } {
  const seen = new Set<string>();
  const merged: StremioStream[] = [];

  for (const { streams, source } of lists) {
    for (const stream of streams) {
      if (!stream.url || seen.has(stream.url)) continue;
      seen.add(stream.url);
      merged.push({ ...stream, name: stream.name ?? source });
    }
  }

  const { playable, options } = listPlayableStremioStreams(merged);
  return {
    playable,
    options: options.map((opt, index) => ({
      ...opt,
      index,
      recommended: index === 0,
    })),
  };
}
