import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/users";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");

    const user = createUser(name, password);
    const token = await createSessionToken(user.id);
    const response = NextResponse.json({
      user: { id: user.id, name: user.name },
    });
    response.cookies.set(sessionCookieOptions(token));
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign up failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
