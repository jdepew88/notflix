export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { logStartupConfig } = await import("@/lib/env");
    const { seedSettingsFromEnv } = await import("@/lib/server-settings");
    const { bootstrapLibraryOnStartup } = await import("@/lib/library-bootstrap");
    seedSettingsFromEnv();
    logStartupConfig();
    void bootstrapLibraryOnStartup().catch((err) => {
      console.error("[notflix] Library bootstrap failed:", err);
    });
  } catch (err) {
    console.error("[notflix] Startup initialization failed:", err);
  }
}
