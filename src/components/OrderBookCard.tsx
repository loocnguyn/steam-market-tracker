"use client";

import { useQuery } from "@tanstack/react-query";
import type { ItemInfo, ItemOrders } from "@/lib/steam/types";
import { buildMarketUrl } from "@/lib/steam/steam";
import { PriceChart } from "@/components/PriceChart";

interface Props {
  appid: number;
  marketHashName: string;
  onRemove: (appid: number, marketHashName: string) => void;
  /** Captured at add-time from a search result, if available — lets the
   *  icon render immediately instead of depending on the order-book fetch. */
  initialIconUrl?: string | null;
  initialType?: string | null;
}

const numberFmt = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

// Steam serves prices in whatever currency it GeoIP-detects for the
// requesting server, not a fixed one — so amounts must always be formatted
// with the currency symbol Steam actually returned (data.currencySymbol),
// never a hardcoded one. A few symbols are conventionally prefixed.
const PREFIX_SYMBOLS = new Set(["$", "£", "€"]);

function formatAmount(value: number, symbol: string | null): string {
  const formatted = numberFmt.format(value);
  if (!symbol) return formatted;
  return PREFIX_SYMBOLS.has(symbol)
    ? `${symbol}${formatted}`
    : `${formatted} ${symbol}`;
}

type OrdersResponse = ItemOrders & { info: ItemInfo | null };

async function fetchOrders(appid: number, name: string): Promise<OrdersResponse> {
  const res = await fetch(
    `/api/steam/orders?appid=${appid}&name=${encodeURIComponent(name)}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Fetch failed");
  return data;
}

export function OrderBookCard({
  appid,
  marketHashName,
  onRemove,
  initialIconUrl,
  initialType,
}: Props) {
  const url = buildMarketUrl(appid, marketHashName);
  const { data, error, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["orders", appid, marketHashName],
    queryFn: () => fetchOrders(appid, marketHashName),
  });

  // Prefer the freshest icon/type from the server, fall back to what we
  // already had at add-time (from a search result) so the icon shows
  // instantly instead of a spinner that never resolves if the server-side
  // lookup ever comes back empty.
  const iconUrl = data?.info?.iconUrl ?? initialIconUrl ?? null;
  const typeText = data?.info?.type ?? initialType ?? null;

  return (
    <div className="group flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 p-5 shadow-lg shadow-black/20 backdrop-blur transition-all hover:border-white/[0.12] hover:shadow-xl hover:shadow-black/30">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/60">
            {iconUrl ? (
              <img
                src={iconUrl}
                alt={marketHashName}
                className="h-full w-full object-contain p-1"
              />
            ) : isLoading ? (
              <div className="h-6 w-6 animate-pulse rounded bg-zinc-800" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-zinc-700" fill="none">
                <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 16l4-4 3 3 5-5 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-zinc-50">
              {marketHashName}
            </h3>
            {typeText && (
              <p className="truncate text-xs text-zinc-500">{typeText}</p>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-zinc-600 transition-colors hover:text-emerald-400"
            >
              View on Steam
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                <path
                  d="M3 9L9 3M9 3H4M9 3V8"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
        </div>
        <button
          onClick={() => onRemove(appid, marketHashName)}
          className="rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
          title="Remove from watchlist"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
            <path
              d="M4 4L12 12M12 4L4 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-800/60" />
          <div className="h-20 animate-pulse rounded-lg bg-zinc-800/40" />
        </div>
      )}
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-400/70">
                Lowest sell
              </p>
              <p className="text-lg font-semibold text-emerald-400">
                {data.lowestSell != null
                  ? formatAmount(data.lowestSell, data.currencySymbol)
                  : "—"}
              </p>
            </div>
            <div className="flex-1 rounded-xl border border-sky-500/10 bg-sky-500/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-sky-400/70">
                Highest buy
              </p>
              <p className="text-lg font-semibold text-sky-400">
                {data.highestBuy != null
                  ? formatAmount(data.highestBuy, data.currencySymbol)
                  : "—"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="mb-1.5 font-medium text-zinc-500">Sell orders</p>
              <OrderTable
                rows={data.sell.slice(0, 6)}
                tone="sell"
                currencySymbol={data.currencySymbol}
              />
            </div>
            <div>
              <p className="mb-1.5 font-medium text-zinc-500">Buy orders</p>
              <OrderTable
                rows={data.buy.slice(0, 6)}
                tone="buy"
                currencySymbol={data.currencySymbol}
              />
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-3">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Price history
            </p>
            <PriceChart appid={appid} marketHashName={marketHashName} />
          </div>

          <p className="flex items-center gap-1.5 text-right text-[10px] text-zinc-600">
            {isFetching && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            )}
            <span className="ml-auto">
              {isFetching
                ? "Updating…"
                : `Updated at ${new Date(dataUpdatedAt).toLocaleTimeString("en-US")}`}
            </span>
          </p>
        </>
      )}
    </div>
  );
}

function OrderTable({
  rows,
  tone,
  currencySymbol,
}: {
  rows: { price: number; quantity: number }[];
  tone: "sell" | "buy";
  currencySymbol: string | null;
}) {
  if (rows.length === 0) {
    return <p className="text-zinc-700">No data</p>;
  }
  return (
    <table className="w-full">
      <thead>
        <tr className="text-zinc-600">
          <th className="text-left font-normal">Price</th>
          <th className="text-right font-normal">Qty</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="[&>td]:py-0.5">
            <td
              className={
                tone === "sell" ? "text-emerald-400" : "text-sky-400"
              }
            >
              {formatAmount(r.price, currencySymbol)}
            </td>
            <td className="text-right text-zinc-500">{r.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
