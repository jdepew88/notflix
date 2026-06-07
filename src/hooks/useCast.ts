"use client";

import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

interface UseCastOptions {
  title: string;
  src: string;
  poster?: string;
  videoRef: RefObject<HTMLVideoElement | null>;
}

export function useCast({ title, src, poster, videoRef }: UseCastOptions) {
  const [castAvailable, setCastAvailable] = useState(false);
  const [casting, setCasting] = useState(false);

  useEffect(() => {
    const checkCast = () => {
      if (typeof window !== "undefined" && window.cast?.framework) {
        setCastAvailable(true);
      }
    };

    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) checkCast();
    };

    checkCast();
    const interval = setInterval(checkCast, 1000);
    return () => clearInterval(interval);
  }, []);

  const startCast = useCallback(async () => {
    if (!window.cast?.framework) return;

    const context = window.cast.framework.CastContext.getInstance();
    const session = context.getCurrentSession();

    try {
      if (!session) {
        await context.requestSession();
      }

      const currentSession = context.getCurrentSession();
      if (!currentSession) return;

      const proxySrc = src.startsWith("http")
        ? `/api/proxy/stream?url=${encodeURIComponent(src)}`
        : src;

      const mediaInfo = new window.chrome.cast.media.MediaInfo(proxySrc, "video/mp4");
      mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = title;
      if (poster) mediaInfo.metadata.images = [{ url: poster }];

      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      await currentSession.loadMedia(request);

      videoRef.current?.pause();
      setCasting(true);
    } catch (err) {
      console.error("Cast failed:", err);
    }
  }, [src, title, poster, videoRef]);

  const stopCast = useCallback(() => {
    if (!window.cast?.framework) return;
    const context = window.cast.framework.CastContext.getInstance();
    context.endCurrentSession(true);
    setCasting(false);
  }, []);

  useEffect(() => {
    if (!window.cast?.framework) return;
    const context = window.cast.framework.CastContext.getInstance();
    const listener = () => {
      setCasting(!!context.getCurrentSession());
    };
    context.addEventListener(
      window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      listener
    );
    return () => {
      context.removeEventListener(
        window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        listener
      );
    };
  }, []);

  return { castAvailable, casting, startCast, stopCast };
}

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
  }
}
