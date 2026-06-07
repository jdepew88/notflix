import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  readCachedFile,
  rewriteHlsManifestForProxy,
} from "@/lib/ffmpeg";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ session: string; file: string[] }> }
) {
  const { session, file } = await params;
  const filename = file?.join("/") || "master.m3u8";

  if (!/^[a-f0-9]{16}$/.test(session)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  const safe = path.basename(filename);

  try {
    const content = await readCachedFile(session, safe);

    if (safe.endsWith(".m3u8")) {
      const rewritten = await rewriteHlsManifestForProxy(
        session,
        content.toString("utf-8")
      );
      return new NextResponse(rewritten, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (safe.endsWith(".vtt")) {
      return new NextResponse(new Uint8Array(content), {
        headers: { "Content-Type": "text/vtt", "Cache-Control": "no-cache" },
      });
    }

    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": "video/mp2t",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
