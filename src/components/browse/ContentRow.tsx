"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TitleCardWithHover } from "./TitleCardWithHover";
import type { MediaItem } from "@/lib/types";

interface ContentRowProps {
  title: string;
  items: MediaItem[];
  large?: boolean;
}

export function ContentRow({ title, items }: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (items.length === 0) return null;

  return (
    <section className="group/row relative mb-6 md:mb-8">
      <h2 className="mb-2 px-4 text-lg font-semibold md:px-12 md:text-xl lg:px-16">
        {title}
      </h2>
      <div className="relative">
        <button
          type="button"
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-black/50 opacity-0 transition group-hover/row:opacity-100 md:flex"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>

        <div
          ref={scrollRef}
          className="row-scroll flex gap-2 overflow-x-auto px-4 md:gap-3 md:px-12 lg:px-16"
        >
          {items.map((item, i) => (
            <TitleCardWithHover key={item.id} item={item} priority={i < 4} />
          ))}
        </div>

        <button
          type="button"
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-black/50 opacity-0 transition group-hover/row:opacity-100 md:flex"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>
    </section>
  );
}
