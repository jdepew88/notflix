import { getLibraryPath } from "./env";

/** Host path on unRAID (outside container). */
export const HOST_VIDEO_PATH = "/mnt/user/Media/Video";

/** Path inside the container when /mnt/user/Media is mounted at /media. */
export const CONTAINER_VIDEO_PATH = "/media/Video";

export function resolveLibraryPath(settingsPath?: string): string {
  const trimmed = settingsPath?.trim();
  if (trimmed) return trimmed;
  const fromEnv = getLibraryPath();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") return CONTAINER_VIDEO_PATH;
  return "";
}
