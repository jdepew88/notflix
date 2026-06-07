/** Host media share on unRAID (outside container). */
export const HOST_MEDIA_PATH = "/mnt/user/Media";

/** Typical host subfolder when videos live under Media/Video. */
export const HOST_VIDEO_PATH = "/mnt/user/Media/Video";

/** Mount point inside the container for `-v /mnt/user/Media:/media:ro`. */
export const CONTAINER_MEDIA_PATH = "/media";

/** Default library folder inside the container. */
export const CONTAINER_VIDEO_PATH = "/media/Video";

/** Map unRAID host paths to in-container paths. */
export function mapHostPathToContainer(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  if (trimmed === HOST_MEDIA_PATH || trimmed === `${HOST_MEDIA_PATH}/`) {
    return CONTAINER_MEDIA_PATH;
  }
  if (trimmed.startsWith(`${HOST_MEDIA_PATH}/`)) {
    return `${CONTAINER_MEDIA_PATH}${trimmed.slice(HOST_MEDIA_PATH.length)}`;
  }

  return trimmed;
}

export function isHostMediaPath(input: string): boolean {
  const trimmed = input.trim();
  return trimmed === HOST_MEDIA_PATH || trimmed.startsWith(`${HOST_MEDIA_PATH}/`);
}

export function resolveLibraryPath(settingsPath?: string): string {
  const trimmed = settingsPath?.trim();
  if (trimmed) return mapHostPathToContainer(trimmed);
  const fromEnv = process.env.LIBRARY_PATH?.trim();
  if (fromEnv) return mapHostPathToContainer(fromEnv);
  if (process.env.NODE_ENV === "production") return CONTAINER_VIDEO_PATH;
  return "";
}

export function libraryPathHint(path: string): string | undefined {
  if (isHostMediaPath(path)) {
    const mapped = mapHostPathToContainer(path);
    return `Use the container path ${mapped} in Settings (not the unRAID host path). Mount with -v /mnt/user/Media:/media:ro`;
  }
  return undefined;
}
