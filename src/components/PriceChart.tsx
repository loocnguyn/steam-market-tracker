"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, type UTCTimestamp } from "lightweight-charts";
import { createClient } from "@/lib/supabase/client";

interface Props {
  appid: number;
  marketHashName: string;
}

interface SnapshotPoint {
  time: UTCTimestamp;
  value: number;
}

/**
 * Renders our own price history (lowest sell over time), built from
 * snapshots the server records on every order-book fetch. We can't use
 * Steam's real pricehistory endpoint — it requires a logged-in session
 * cookie we don't have. History starts accumulating from when an item is
 * first tracked, so it may be sparse for freshly added items.
 */
export function PriceChart({ appid, marketHashName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<SnapshotPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data: item } = await supabase
        .from("items")
        .select("id")
        .eq("appid", appid)
        .eq("market_hash_name", marketHashName)
        .maybeSingle();

      if (!item) {
        if (!cancelled) setPoints([]);
        return;
      }

      const { data: snapshots } = await supabase
        .from("price_snapshots")
        .select("lowest_sell, captured_at")
        .eq("item_id", item.id)
        .not("lowest_sell", "is", null)
        .order("captured_at", { ascending: true })
        .limit(500);

      if (cancelled) return;

      const seen = new Set<number>();
      const parsed: SnapshotPoint[] = [];
      for (const s of snapshots ?? []) {
        const time = Math.floor(
          new Date(s.captured_at).getTime() / 1000,
        ) as UTCTimestamp;
        // lightweight-charts requires strictly increasing/unique timestamps.
        if (seen.has(time)) continue;
        seen.add(time);
        parsed.push({ time, value: s.lowest_sell as number });
      }
      setPoints(parsed);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [appid, marketHashName]);

  useEffect(() => {
    if (!containerRef.current || !points || points.length < 2) return;

    const chart = createChart(containerRef.current, {
      height: 120,
      layout: {
        background: { color: "transparent" },
        textColor: "#71717a",
        fontSize: 10,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#27272a" },
      },
      timeScale: { timeVisible: true, borderColor: "#27272a" },
      rightPriceScale: { borderColor: "#27272a" },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(LineSeries, {
      color: "#34d399",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    series.setData(points);
    chart.timeScale().fitContent();

    // clientWidth can be 0 on first paint (layout not settled yet), so use
    // a ResizeObserver instead of measuring once synchronously.
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) chart.applyOptions({ width });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [points]);

  if (points && points.length < 2) {
    return (
      <p className="text-xs text-zinc-600">
        Not enough history yet to draw a chart — check back after this item
        has been tracked for a while.
      </p>
    );
  }

  return <div ref={containerRef} className="w-full" />;
}
