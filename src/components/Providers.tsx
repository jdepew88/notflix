"use client";

import { useEffect } from "react";
import { PortalProvider } from "@/providers/PortalProvider";
import { DetailModalProvider } from "@/providers/DetailModalProvider";
import { TitleCardPortal } from "@/components/browse/TitleCardPortal";
import { DetailModal } from "@/components/browse/DetailModal";

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
