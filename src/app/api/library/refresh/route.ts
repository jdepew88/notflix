import { NextRequest, NextResponse } from "next/server";
import { mergeSettings } from "@/lib/settings";
import { fetchPlexLibrary, refreshPlexLibraries } from "@/lib/plex";

export async function POST(request: NextRequest) {
  const settings = mergeSettings(request);

  if (!settings.plexUrl || !settings.plexToken) {
    return NextResponse.json(
      { success: false, error: "Plex URL and token required" },
      { status: 400 }
    );
  }

  try {
    const refresh = await refreshPlexLibraries(settings.plexUrl, settings.plexToken);
    const items = await fetchPlexLibrary(settings.plexUrl, settings.plexToken);
    return NextResponse.json({
      success: true,
      refreshedAt: new Date().toISOString(),
      sectionsRefreshed: refresh.sections,
      sectionNames: refresh.names,
      titleCount: items.length,
      message: `Triggered refresh on ${refresh.sections} library section(s). Found ${items.length} titles.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Plex refresh failed",
      },
      { status: 500 }
    );
  }
}
