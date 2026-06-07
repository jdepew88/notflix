import { NextRequest, NextResponse } from "next/server";
import {
  buildPlexAuthUrl,
  checkPlexPin,
  createPlexPin,
  fetchPlexResources,
  getPlexClientIdentifier,
  selectPlexServerUrl,
} from "@/lib/plex-auth";
import { mergeSettings } from "@/lib/settings";
import { testPlexConnection } from "@/lib/plex";

export async function POST() {
  try {
    const clientId = getPlexClientIdentifier();
    const pin = await createPlexPin(clientId);
    return NextResponse.json({
      pinId: pin.id,
      code: pin.code,
      clientId,
      authUrl: buildPlexAuthUrl(clientId, pin.code),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start Plex sign-in";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const pinId = request.nextUrl.searchParams.get("pinId");
  if (!pinId) {
    return NextResponse.json({ error: "Missing pinId" }, { status: 400 });
  }

  try {
    const clientId = getPlexClientIdentifier();
    const pin = await checkPlexPin(pinId, clientId);

    if (!pin.authToken) {
      return NextResponse.json({ status: "pending" });
    }

    const settings = mergeSettings(request);
    const resources = await fetchPlexResources(pin.authToken);
    const selected = selectPlexServerUrl(resources, settings.plexUrl);
    const plexUrl = selected.url ?? settings.plexUrl ?? "";

    let serverName = selected.serverName;
    if (plexUrl) {
      const test = await testPlexConnection(plexUrl, pin.authToken);
      if (test.ok && test.serverName) serverName = test.serverName;
    }

    return NextResponse.json({
      status: "authorized",
      plexToken: pin.authToken,
      plexUrl,
      serverName,
      servers: resources
        .filter((r) => r.provides?.includes("server"))
        .map((r) => ({
          name: r.name,
          connections: (r.connections ?? []).map((c) => c.uri),
        })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plex sign-in check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
