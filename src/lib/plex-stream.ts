import type { NextRequest } from "next/server";
import { mergeSettingsForServerOps } from "./settings";
import { getPlexToken, getPlexUrl } from "./env";

export const PLEX_CLIENT_ID = "netflix-clone-8f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c";
export const PLEX_PLATFORM = "Chrome";
export const PLEX_PRODUCT = "Plex Web";

export function normalizePlexUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export function getPlexCredentials(request?: NextRequest) {
  const merged = request
    ? mergeSettingsForServerOps(request)
    : {
        plexUrl: getPlexUrl(),
        plexToken: getPlexToken(),
      };

  const qp = request?.nextUrl.searchParams;

  return {
    plexUrl: normalizePlexUrl(qp?.get("plexUrl") || merged.plexUrl || ""),
    token: qp?.get("token") || qp?.get("X-Plex-Token") || merged.plexToken || "",
  };
}

export function buildTranscodeManifestUrl(
  plexUrl: string,
  token: string,
  ratingKey: string,
  session: string
): string {
  const params = new URLSearchParams({
    hasMDE: "1",
    path: `/library/metadata/${ratingKey}`,
    mediaIndex: "0",
    partIndex: "0",
    protocol: "hls",
    fastSeek: "1",
    directPlay: "0",
    directStream: "0",
    subtitleSize: "100",
    session,
    "X-Plex-Token": token,
    "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
    "X-Plex-Platform": PLEX_PLATFORM,
    "X-Plex-Product": PLEX_PRODUCT,
    "X-Plex-Version": "4.132.0",
    "X-Plex-Device": "Windows",
    "X-Plex-Device-Name": "Netflix Clone",
  });
  return `${plexUrl}/video/:/transcode/universal/start.m3u8?${params.toString()}`;
}

export function resolvePlexUrl(base: string, ref: string): string {
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  const normalized = normalizePlexUrl(base);
  return ref.startsWith("/") ? `${normalized}${ref}` : `${normalized}/${ref}`;
}

export async function fetchPlexText(url: string, token: string): Promise<string> {
  const sep = url.includes("?") ? "&" : "?";
  const fetchUrl = url.includes("X-Plex-Token")
    ? url
    : `${url}${sep}X-Plex-Token=${encodeURIComponent(token)}`;

  const res = await fetch(fetchUrl, {
    headers: {
      Accept: "*/*",
      "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
      "X-Plex-Platform": PLEX_PLATFORM,
      "X-Plex-Product": PLEX_PRODUCT,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Plex request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.text();
}

export function rewriteHlsManifest(
  manifest: string,
  plexUrl: string,
  token: string
): string {
  const tokenSuffix = `&token=${encodeURIComponent(token)}`;

  const proxyPath = (path: string) =>
    path.includes("?") ? `${path}${tokenSuffix}` : `${path}?token=${encodeURIComponent(token)}`;

  return manifest
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          const absolute = resolvePlexUrl(plexUrl, uri);
          if (uri.includes(".m3u8") || absolute.includes(".m3u8")) {
            return `URI="${proxyPath(`/api/plex/hls?manifest=${encodeURIComponent(absolute)}`)}"`;
          }
          return `URI="${proxyPath(`/api/plex/segment?url=${encodeURIComponent(absolute)}`)}"`;
        });
      }

      if (!trimmed) return line;

      const absolute = resolvePlexUrl(plexUrl, trimmed);
      if (trimmed.endsWith(".m3u8") || absolute.includes(".m3u8")) {
        return proxyPath(`/api/plex/hls?manifest=${encodeURIComponent(absolute)}`);
      }
      return proxyPath(`/api/plex/segment?url=${encodeURIComponent(absolute)}`);
    })
    .join("\n");
}

export function plexDirectStreamUrl(partKey: string, plexUrl: string): string {
  return `/api/plex/stream?partKey=${encodeURIComponent(partKey)}&plexUrl=${encodeURIComponent(normalizePlexUrl(plexUrl))}`;
}

export function plexHlsStreamUrl(ratingKey: string, plexUrl: string): string {
  return `/api/plex/hls?ratingKey=${encodeURIComponent(ratingKey)}&plexUrl=${encodeURIComponent(normalizePlexUrl(plexUrl))}`;
}
