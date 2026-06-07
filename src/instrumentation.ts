export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logStartupConfig } = await import("@/lib/env");
    logStartupConfig();
  }
}
