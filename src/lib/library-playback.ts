import path from "path";
import { mapHostPathToContainer, resolveLibraryPath } from "./library-path";
import type { MediaItem } from "./types";
import type { ServerSettings } from "./server-settings";

export function mappedLibraryFilePath(filePath: string): string {
  return mapHostPathToContainer(filePath);
}

export function libraryStreamUrl(filePath: string): string {
  const mapped = mappedLibraryFilePath(filePath);
  return `/api/library/stream?path=${encodeURIComponent(mapped)}`;
}

export function resolveLibraryRoot(settings: ServerSettings): string {
  return resolveLibraryPath(settings.libraryPath);
}

export function resolveAccessibleLibraryFile(
  filePath: string,
  libraryRoot: string
): string | null {
  if (!filePath || !libraryRoot) return null;
  const mapped = mappedLibraryFilePath(filePath);
  const resolved = path.resolve(mapped);
  const root = path.resolve(libraryRoot);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

export function itemWithMappedPath(item: MediaItem): MediaItem {
  if (!item.filePath) return item;
  return { ...item, filePath: mappedLibraryFilePath(item.filePath) };
}
