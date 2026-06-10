import path from "path";
import { mapHostPathToContainer, resolveLibraryPath } from "./library-path";
import type { MediaItem } from "./types";
import type { ServerSettings } from "./server-settings";

export function mappedLibraryFilePath(filePath: string, libraryRoot?: string): string {
  return mapHostPathToContainer(filePath, libraryRoot);
}

export function libraryStreamUrl(filePath: string, libraryRoot?: string): string {
  const root = libraryRoot || resolveLibraryPath();
  const resolved = resolveAccessibleLibraryFile(filePath, root);
  const streamPath = resolved ?? mappedLibraryFilePath(filePath, root);
  return `/api/library/stream?path=${encodeURIComponent(streamPath)}`;
}

export function resolveLibraryRoot(settings: ServerSettings): string {
  return resolveLibraryPath(settings.libraryPath);
}

export function resolveAccessibleLibraryFile(
  filePath: string,
  libraryRoot: string
): string | null {
  if (!filePath || !libraryRoot) return null;
  const mapped = mappedLibraryFilePath(filePath, libraryRoot);
  const resolved = path.resolve(mapped);
  const root = path.resolve(libraryRoot);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

export function itemWithMappedPath(item: MediaItem, libraryRoot?: string): MediaItem {
  if (!item.filePath) return item;
  const root = libraryRoot || resolveLibraryPath();
  const resolved = resolveAccessibleLibraryFile(item.filePath, root);
  return {
    ...item,
    filePath: resolved ?? mappedLibraryFilePath(item.filePath, root),
  };
}
