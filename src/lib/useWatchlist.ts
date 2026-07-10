"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SteamUser } from "@/lib/useAuth";

export interface WatchedItem {
  appid: number;
  marketHashName: string;
  addedAt: number;
  iconUrl?: string | null;
  type?: string | null;
}

const STORAGE_KEY = "steam-tracker:watchlist:v2";

function key(item: { appid: number; marketHashName: string }): string {
  return `${item.appid}:${item.marketHashName}`;
}

function loadLocal(): WatchedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocal(items: WatchedItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

async function fetchServerWatchlist(): Promise<WatchedItem[]> {
  const res = await fetch("/api/watchlist");
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((r: {
    appid: number;
    market_hash_name: string;
    icon_url: string | null;
    item_type: string | null;
    added_at: string;
  }) => ({
    appid: r.appid,
    marketHashName: r.market_hash_name,
    iconUrl: r.icon_url,
    type: r.item_type,
    addedAt: new Date(r.added_at).getTime(),
  }));
}

/**
 * Watchlist that lives in localStorage while signed out, and in Supabase
 * (via /api/watchlist, keyed by Steam session) once signed in — so it
 * follows the user across devices instead of being tied to one browser.
 * On first sign-in, any local items are migrated to the server once.
 */
export function useWatchlist(user: SteamUser | null, authLoading: boolean) {
  const [items, setItems] = useState<WatchedItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const migratedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    async function load() {
      if (user) {
        const local = loadLocal();
        if (local.length > 0 && !migratedRef.current) {
          migratedRef.current = true;
          await Promise.all(
            local.map((item) =>
              fetch("/api/watchlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  appid: item.appid,
                  marketHashName: item.marketHashName,
                  iconUrl: item.iconUrl,
                  type: item.type,
                }),
              }).catch(() => {}),
            ),
          );
          localStorage.removeItem(STORAGE_KEY);
        }
        const server = await fetchServerWatchlist();
        if (!cancelled) setItems(server);
      } else {
        if (!cancelled) setItems(loadLocal());
      }
      if (!cancelled) setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

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

      if (user) {
        fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appid,
            marketHashName,
            iconUrl: extra?.iconUrl,
            type: extra?.type,
          }),
        }).catch(() => {});
      }
    },
    [user],
  );

  const remove = useCallback(
    (appid: number, marketHashName: string) => {
      setItems((prev) => prev.filter((i) => key(i) !== key({ appid, marketHashName })));

      if (user) {
        fetch(
          `/api/watchlist?appid=${appid}&marketHashName=${encodeURIComponent(marketHashName)}`,
          { method: "DELETE" },
        ).catch(() => {});
      }
    },
    [user],
  );

  useEffect(() => {
    if (loaded && !user) saveLocal(items);
  }, [items, loaded, user]);

  return { items, loaded, add, remove };
}
