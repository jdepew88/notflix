import { getServerSettingsSync } from "./server-settings";
import {
  getStoredTitleCount,
  scheduleBackgroundLibrarySync,
  startBackgroundLibrarySync,
} from "./library-sync";
import {
  databaseCompatibleWithSettings,
  databaseMatchesSettings,
  readLibraryDatabase,
} from "./library-store";

export async function bootstrapLibraryOnStartup(): Promise<void> {
  const settings = getServerSettingsSync();
  const db = readLibraryDatabase();
  const configured = Boolean(
    (settings.plexUrl?.trim() && settings.plexToken?.trim()) ||
      settings.libraryPath?.trim()
  );

  if (!configured) return;

  if (db && db.items.length > 0) {
    console.log(
      `[notflix] Library database loaded: ${db.items.length} titles (${db.source}, cached ${db.cachedAt})`
    );
    if (!databaseMatchesSettings(db, settings) && databaseCompatibleWithSettings(db, settings)) {
      console.log("[notflix] Settings changed — scheduling background library resync");
      void startBackgroundLibrarySync(settings);
    }
    return;
  }

  console.log("[notflix] No library database found — starting initial sync");
  scheduleBackgroundLibrarySync(settings);
}

export function getBootstrapTitleCount(): number {
  return getStoredTitleCount();
}
