"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Footer } from "./Footer";

export function FooterReveal() {
  const [visible, setVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: null, rootMargin: "0px", threshold: 0.01 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
      <div
        className={cn(
          "transition-[opacity,max-height] duration-300 ease-out",
          visible
            ? "max-h-[2000px] opacity-100"
            : "pointer-events-none max-h-0 overflow-hidden opacity-0"
        )}
      >
        <Footer />
      </div>
    </>
  );
}
