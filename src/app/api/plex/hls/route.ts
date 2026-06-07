import { NextRequest, NextResponse } from "next/server";
import {
  buildTranscodeManifestUrl,
  fetchPlexText,
  getPlexCredentials,
  rewriteHlsManifest,
} from "@/lib/plex-stream";
import { castCorsHeaders } from "@/lib/cast-cors";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: castCorsHeaders() });
}

export async function GET(request: NextRequest) {
  const ratingKey = request.nextUrl.searchParams.get("ratingKey");
  const manifestUrl = request.nextUrl.searchParams.get("manifest");
  const { plexUrl, token } = getPlexCredentials(request);
  const plexUrlParam = request.nextUrl.searchParams.get("plexUrl");
  const baseUrl = plexUrlParam ? plexUrlParam.replace(/\/$/, "") : plexUrl;

  if (!token || !baseUrl) {
    return NextResponse.json(
      { error: "Plex not configured. Save settings and sync library." },
      { status: 401 }
    );
  }

  try {
    const session = ratingKey ?? "manifest";
    const upstreamManifest =
      manifestUrl ??
      buildTranscodeManifestUrl(baseUrl, token, ratingKey!, session);

    if (!manifestUrl && !ratingKey) {
      return NextResponse.json({ error: "Missing ratingKey or manifest" }, { status: 400 });
    }

    const raw = await fetchPlexText(upstreamManifest, token);
    const rewritten = rewriteHlsManifest(raw, baseUrl, token);

    return new NextResponse(rewritten, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache",
        ...castCorsHeaders(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "HLS transcode failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
