import { normalizeStremioBaseUrl } from "./stremio-streams";
import { getPeerflixUrl } from "./env";

/** Default Peerflix addon base (English-filtered client-side). */
export const DEFAULT_PEERFLIX_BASE = "https://peerflix.mov";

export function buildDefaultPeerflixUrl(realDebridToken?: string): string {
  const parts: string[] = ["language=english"];
  if (realDebridToken) {
    parts.unshift(`realdebrid=${encodeURIComponent(realDebridToken)}`);
  }
  return `${DEFAULT_PEERFLIX_BASE}/${parts.join("|")}`;
}

export function normalizePeerflixBaseUrl(url: string): string {
  return normalizeStremioBaseUrl(url);
}

export function resolvePeerflixBaseUrl(options: {
  peerflixUrl?: string;
  realDebridToken?: string;
  enabled?: boolean;
}): string {
  if (options.peerflixUrl?.trim()) {
    return normalizePeerflixBaseUrl(options.peerflixUrl);
  }
  if (options.enabled === false) return "";
  if (options.realDebridToken || process.env.PEERFLIX_URL) {
    return options.realDebridToken
      ? buildDefaultPeerflixUrl(options.realDebridToken)
      : normalizePeerflixBaseUrl(getPeerflixUrl() || DEFAULT_PEERFLIX_BASE);
  }
  return normalizePeerflixBaseUrl(DEFAULT_PEERFLIX_BASE);
}
