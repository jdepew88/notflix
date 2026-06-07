import type { UserProfile } from "./types";

export async function completeClientAuth(
  user: { id: string; name: string },
  setUser: (user: { id: string; name: string }) => void,
  hydrateUserState: (state: {
    profiles: UserProfile[];
    activeProfileId: string | null;
    myListByProfile: Record<string, string[]>;
    continueWatchingByProfile: Record<string, Record<string, number>>;
  }) => void
): Promise<void> {
  setUser(user);
  try {
    const meRes = await fetch("/api/auth/me", { credentials: "include" });
    if (meRes.ok) {
      const data = await meRes.json();
      hydrateUserState(data.state);
    }
  } catch {
    /* optional */
  }
  window.location.assign("/profiles");
}
