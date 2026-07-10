"use client";

import { useCallback, useEffect, useState } from "react";

export interface WatchedItem {
  /** Steam Market listing URL, used as the stable key for this entry. */
  url: string;
  addedAt: number;
}

const STORAGE_KEY = "steam-tracker:watchlist";

/**
 * Local (browser-only) watchlist. Phase 1 stopgap until per-user watchlist
 * (auth + Supabase) lands in Phase 2 — same shape so migration is trivial.
 */
export function useWatchlist() {
  const [items, setItems] = useState<WatchedItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loaded]);

  const add = useCallback((url: string) => {
    setItems((prev) =>
      prev.some((i) => i.url === url)
        ? prev
        : [...prev, { url, addedAt: Date.now() }],
    );
  }, []);

  const remove = useCallback((url: string) => {
    setItems((prev) => prev.filter((i) => i.url !== url));
  }, []);

  return { items, loaded, add, remove };
}
