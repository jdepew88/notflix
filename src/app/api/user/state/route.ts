import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import {
  addProfile,
  readUserState,
  removeProfile,
  writeUserState,
  type UserState,
} from "@/lib/users";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ state: readUserState(userId) });
}

export async function PUT(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  if (body.action === "addProfile") {
    const profile = addProfile(userId, body.name ?? "Profile", body.avatar ?? "👤");
    return NextResponse.json({ profile, state: readUserState(userId) });
  }

  if (body.action === "removeProfile") {
    removeProfile(userId, body.profileId);
    return NextResponse.json({ state: readUserState(userId) });
  }

  const current = readUserState(userId);
  const next: UserState = {
    profiles:
      Array.isArray(body.profiles) && body.profiles.length > 0
        ? body.profiles
        : current.profiles,
    activeProfileId:
      body.activeProfileId !== undefined ? body.activeProfileId : current.activeProfileId,
    myListByProfile: body.myListByProfile ?? current.myListByProfile,
    continueWatchingByProfile:
      body.continueWatchingByProfile ?? current.continueWatchingByProfile,
  };
  writeUserState(userId, next);
  return NextResponse.json({ state: next });
}
