"use client";

import { useCallback, useEffect, useState } from "react";

export interface WatchedItem {
  appid: number;
  marketHashName: string;
  addedAt: number;
  /** Captured at add-time (e.g. from a search result) so the card can show
   *  an icon immediately instead of waiting on / depending on a fresh
   *  Steam lookup. Optional — items added by pasting a link won't have it
   *  until the first order-book fetch fills it in server-side. */
  iconUrl?: string | null;
  type?: string | null;
}

const STORAGE_KEY = "steam-tracker:watchlist:v2";

function key(item: { appid: number; marketHashName: string }): string {
  return `${item.appid}:${item.marketHashName}`;
}

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

  const add = useCallback(
    (
      appid: number,
      marketHashName: string,
      extra?: { iconUrl?: string | null; type?: string | null },
    ) => {
      setItems((prev) =>
        prev.some((i) => key(i) === key({ appid, marketHashName }))
          ? prev
          : [
              ...prev,
              {
                appid,
                marketHashName,
                addedAt: Date.now(),
                iconUrl: extra?.iconUrl,
                type: extra?.type,
              },
            ],
      );
    },
    [],
  );

  const remove = useCallback((appid: number, marketHashName: string) => {
    setItems((prev) =>
      prev.filter((i) => key(i) !== key({ appid, marketHashName })),
    );
  }, []);

  return { items, loaded, add, remove };
}
