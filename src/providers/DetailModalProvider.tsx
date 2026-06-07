"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { MediaItem } from "@/lib/types";

interface DetailModalState {
  open: boolean;
  item: MediaItem | null;
}

interface DetailModalContextValue extends DetailModalState {
  openDetail: (item: MediaItem) => void;
  closeDetail: () => void;
}

const DetailModalContext = createContext<DetailModalContextValue | null>(null);

export function DetailModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DetailModalState>({ open: false, item: null });

  const openDetail = useCallback((item: MediaItem) => {
    setState({ open: true, item });
  }, []);

  const closeDetail = useCallback(() => {
    setState({ open: false, item: null });
  }, []);

  return (
    <DetailModalContext.Provider value={{ ...state, openDetail, closeDetail }}>
      {children}
    </DetailModalContext.Provider>
  );
}

export function useDetailModal() {
  const ctx = useContext(DetailModalContext);
  if (!ctx) throw new Error("useDetailModal must be used within DetailModalProvider");
  return ctx;
}
