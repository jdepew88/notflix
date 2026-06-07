"use client";

import { useEffect } from "react";
import { PortalProvider } from "@/providers/PortalProvider";
import { DetailModalProvider } from "@/providers/DetailModalProvider";
import { TitleCardPortal } from "@/components/browse/TitleCardPortal";
import { DetailModal } from "@/components/browse/DetailModal";
import { useAppStore } from "@/lib/store";

function SettingsHydrator() {
  const updateSettings = useAppStore((s) => s.updateSettings);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const res = await fetch("/api/settings/sync?config=1", { credentials: "same-origin" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.settings) {
          updateSettings(data.settings);
        }
      } catch {
        /* server settings optional on first paint */
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [updateSettings]);

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
        <SettingsHydrator />
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
