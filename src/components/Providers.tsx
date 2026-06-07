"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PortalProvider } from "@/providers/PortalProvider";
import { DetailModalProvider } from "@/providers/DetailModalProvider";
import { TitleCardPortal } from "@/components/browse/TitleCardPortal";
import { DetailModal } from "@/components/browse/DetailModal";
import { useAppStore } from "@/lib/store";

function AppHydrator() {
  const router = useRouter();
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setUser = useAppStore((s) => s.setUser);
  const hydrateUserState = useAppStore((s) => s.hydrateUserState);
  const user = useAppStore((s) => s.user);
  const activeProfileId = useAppStore((s) => s.activeProfileId);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const [configRes, meRes] = await Promise.all([
          fetch("/api/settings/sync?config=1", { credentials: "same-origin" }),
          fetch("/api/auth/me", { credentials: "same-origin" }),
        ]);

        if (!cancelled && configRes.ok) {
          const data = await configRes.json();
          if (data.settings) updateSettings(data.settings);
        }

        if (!cancelled && meRes.ok) {
          const data = await meRes.json();
          setUser(data.user);
          hydrateUserState(data.state);
        }
      } catch {
        /* optional */
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [updateSettings, setUser, hydrateUserState]);

  useEffect(() => {
    const path = window.location.pathname;
    if (
      user &&
      (path.startsWith("/browse") || path.startsWith("/watch") || path === "/settings") &&
      !activeProfileId
    ) {
      router.replace("/profiles");
    }
  }, [user, activeProfileId, router]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined" && window.cast?.framework) {
      const context = window.cast.framework.CastContext.getInstance();
      context.setOptions({
        receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
    }
  }, []);

  return (
    <PortalProvider>
      <DetailModalProvider>
        <AppHydrator />
        {children}
        <TitleCardPortal />
        <DetailModal />
      </DetailModalProvider>
    </PortalProvider>
  );
}

declare global {
  interface Window {
    cast?: typeof cast;
    chrome: typeof chrome;
  }
}
