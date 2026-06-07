import { NextRequest, NextResponse } from "next/server";
import {
  buildPlexAuthUrl,
  checkPlexPin,
  createPlexPin,
  fetchPlexResources,
  getPlexClientIdentifier,
  selectPlexServerUrl,
} from "@/lib/plex-auth";
import {
  deletePlexPinSession,
  getPlexPinSession,
  markPlexPinAuthorized,
  savePlexPinSession,
} from "@/lib/plex-pin-sessions";
import { mergeSettings } from "@/lib/settings";
import { testPlexConnection } from "@/lib/plex";

async function completeAuthorization(
  request: NextRequest,
  authToken: string,
  pinId: string
) {
  const settings = mergeSettings(request);
  const resources = await fetchPlexResources(authToken);
  const selected = selectPlexServerUrl(resources, settings.plexUrl);
  const plexUrl = selected.url ?? settings.plexUrl ?? "";

  let serverName = selected.serverName;
  if (plexUrl) {
    const test = await testPlexConnection(plexUrl, authToken);
    if (test.ok && test.serverName) serverName = test.serverName;
  }

  deletePlexPinSession(pinId);

  return NextResponse.json({
    status: "authorized",
    plexToken: authToken,
    plexUrl,
    serverName,
    servers: resources
      .filter((r) => r.provides?.includes("server"))
      .map((r) => ({
        name: r.name,
        connections: (r.connections ?? []).map((c) => c.uri),
      })),
  });
}

export async function POST() {
  try {
    const clientId = getPlexClientIdentifier();
    const pin = await createPlexPin(clientId);
    const pinId = String(pin.id);

    savePlexPinSession({
      pinId,
      clientId,
      code: pin.code,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      pinId,
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
    const session = getPlexPinSession(pinId);
    const clientId =
      request.nextUrl.searchParams.get("clientId")?.trim() ||
      session?.clientId ||
      getPlexClientIdentifier();

    if (session?.authToken) {
      return completeAuthorization(request, session.authToken, pinId);
    }

    if (!session?.code) {
      return NextResponse.json(
        { error: "PIN session expired. Click Sign in with Plex again." },
        { status: 410 }
      );
    }

    const pin = await checkPlexPin(pinId, clientId, session.code);

    if (!pin) {
      if (session.authToken) {
        return completeAuthorization(request, session.authToken, pinId);
      }
      return NextResponse.json({ status: "expired" });
    }

    if (!pin.authToken) {
      return NextResponse.json({ status: "pending" });
    }

    markPlexPinAuthorized(pinId, pin.authToken);
    return completeAuthorization(request, pin.authToken, pinId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plex sign-in check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
