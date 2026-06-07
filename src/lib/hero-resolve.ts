import type { MediaItem } from "./types";
import type { ServerSettings } from "./server-settings";
import {
  pickHeroCandidates,
  readLibraryCache,
  updateLibraryCacheHero,
} from "./library-cache";
import {
  getHeroStatus,
  initHeroManifest,
  resolveHeroVideoCandidates,
} from "./hero-cache";

export function syncHeroToLibraryCache(
  status: ReturnType<typeof getHeroStatus>
): void {
  if (!status) return;
  updateLibraryCacheHero(
    status.featuredId,
    status.primaryFeaturedId,
    status.exhausted ? status.lastError ?? "Marquee video unavailable" : null
  );
}

export async function initializeAndResolveHeroVideo(
  items: MediaItem[],
  settings: ServerSettings,
  previousFeaturedId?: string | null
): Promise<void> {
  const candidates = pickHeroCandidates(items, previousFeaturedId, 3);
  if (candidates.length === 0) {
    updateLibraryCacheHero(null, null, null);
    return;
  }

  updateLibraryCacheHero(candidates[0].id, candidates[0].id, null);
  initHeroManifest(candidates);

  try {
    const status = await resolveHeroVideoCandidates(items, settings);
    syncHeroToLibraryCache(status);
  } catch (err) {
    console.warn("[hero-resolve] Failed to resolve hero video:", err);
    updateLibraryCacheHero(
      candidates[0].id,
      candidates[0].id,
      err instanceof Error ? err.message : "Marquee video setup failed"
    );
  }
}

export async function resolveHeroVideoWithSync(
  settings: ServerSettings,
  options?: { markFailedId?: string; reason?: string }
): Promise<ReturnType<typeof getHeroStatus>> {
  const cache = readLibraryCache();
  if (!cache) return null;

  const candidates = pickHeroCandidates(
    cache.items,
    cache.heroPrimaryId ?? cache.featuredHeroId,
    3
  );
  if (candidates.length === 0) return null;

  if (!getHeroStatus()) {
    initHeroManifest(candidates);
  }

  const status = await resolveHeroVideoCandidates(cache.items, settings, options);
  syncHeroToLibraryCache(status);
  return status;
}
