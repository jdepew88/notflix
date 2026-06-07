export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logStartupConfig } = await import("@/lib/env");
    const { seedSettingsFromEnv } = await import("@/lib/server-settings");
    const { bootstrapLibraryOnStartup } = await import("@/lib/library-bootstrap");
    seedSettingsFromEnv();
    logStartupConfig();
    void bootstrapLibraryOnStartup();
  }
}
