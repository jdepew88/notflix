import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getUserById, readUserState } from "@/lib/users";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const user = getUserById(userId);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const state = readUserState(userId);
  return NextResponse.json({
    user: { id: user.id, name: user.name },
    state,
  });
}
