import fs from "fs";
import {
  CONTAINER_MEDIA_PATH,
  CONTAINER_VIDEO_PATH,
} from "./library-path";

export function listMediaMountSubdirs(): string[] {
  try {
    if (!fs.existsSync(CONTAINER_MEDIA_PATH)) return [];
    return fs
      .readdirSync(CONTAINER_MEDIA_PATH, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `${CONTAINER_MEDIA_PATH}/${e.name}`)
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function suggestLibraryPaths(): string[] {
  const candidates = [
    CONTAINER_VIDEO_PATH,
    `${CONTAINER_MEDIA_PATH}/Movies`,
    `${CONTAINER_MEDIA_PATH}/TV`,
    CONTAINER_MEDIA_PATH,
  ];
  return candidates.filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}
