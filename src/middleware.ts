import { NextResponse } from "next/server";
import { SESSION_COOKIE, parseSessionToken } from "@/lib/session";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/signup"];
const AUTH_PATHS = ["/", "/signup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await parseSessionToken(token) : null;
  const isAuthed = !!session;

  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    if (isAuthed && AUTH_PATHS.includes(pathname)) {
      return NextResponse.redirect(new URL("/profiles", request.url));
    }
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/browse") ||
    pathname.startsWith("/watch") ||
    pathname === "/settings" ||
    pathname === "/profiles"
  ) {
    if (!isAuthed) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/signup", "/profiles", "/browse/:path*", "/watch/:path*", "/settings"],
};
