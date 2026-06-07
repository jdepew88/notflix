import { NextResponse } from "next/server";
import { SESSION_COOKIE, parseSessionToken } from "@/lib/session";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/signup", "/login", "/settings"];
const AUTH_ENTRY_PATHS = ["/", "/signup", "/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await parseSessionToken(token) : null;
  const isAuthed = !!session;

  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    if (isAuthed && AUTH_ENTRY_PATHS.includes(pathname)) {
      return NextResponse.redirect(new URL("/profiles", request.url));
    }
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/browse") ||
    pathname.startsWith("/watch") ||
    pathname === "/profiles"
  ) {
    if (!isAuthed) {
      const login = new URL("/", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/signup", "/profiles", "/browse/:path*", "/watch/:path*", "/settings"],
};
