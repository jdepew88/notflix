/** Build Chromecast- and AirPlay-friendly absolute media URLs. */

export function getAppOrigin(): string {
  if (typeof window === "undefined") return "";
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  return fromEnv || window.location.origin;
}

export function toAbsoluteMediaUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const origin = getAppOrigin();
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function withQueryParam(url: string, key: string, value: string): string {
  const absolute = toAbsoluteMediaUrl(url);
  const parsed = new URL(absolute);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

export function isHlsSource(src: string): boolean {
  return (
    src.includes(".m3u8") ||
    src.includes("/api/plex/hls") ||
    src.includes("/api/debrid/hls") ||
    src.includes("master.m3u8")
  );
}

export function isSafariBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|Firefox|FxiOS/i.test(ua);
}

export interface CastMediaDescriptor {
  url: string;
  contentType: string;
  streamType: "BUFFERED" | "LIVE";
}

export function buildCastMediaDescriptor(
  src: string,
  options?: { plexToken?: string; plexRatingKey?: string; plexUrl?: string }
): CastMediaDescriptor {
  let url = src;
  const hls = isHlsSource(src);

  if (options?.plexToken && url.includes("/api/plex/")) {
    url = withQueryParam(url, "token", options.plexToken);
  }

  if (
    !hls &&
    options?.plexRatingKey &&
    options?.plexUrl &&
    options?.plexToken &&
    url.includes("/api/plex/stream")
  ) {
    url = withQueryParam(
      `/api/plex/hls?ratingKey=${encodeURIComponent(options.plexRatingKey)}&plexUrl=${encodeURIComponent(options.plexUrl)}`,
      "token",
      options.plexToken
    );
  }

  url = toAbsoluteMediaUrl(url);

  return {
    url,
    contentType: isHlsSource(url) ? "application/x-mpegURL" : "video/mp4",
    streamType: "BUFFERED",
  };
}

export function buildRemotePlaybackUrl(
  src: string,
  options?: { plexToken?: string }
): string {
  let url = src;
  if (options?.plexToken && url.includes("/api/plex/")) {
    url = withQueryParam(url, "token", options.plexToken);
  }
  return toAbsoluteMediaUrl(url);
}
