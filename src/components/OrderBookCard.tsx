"use client";

import { useQuery } from "@tanstack/react-query";
import type { ItemInfo, ItemOrders } from "@/lib/steam/types";
import { parseMarketUrl } from "@/lib/steam/steam";
import { PriceChart } from "@/components/PriceChart";

interface Props {
  url: string;
  onRemove: (url: string) => void;
}

function itemNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const raw = path.split("/").pop() ?? url;
    return decodeURIComponent(raw).replace(/\+/g, " ");
  } catch {
    return url;
  }
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

async function fetchOrders(url: string): Promise<OrdersResponse> {
  const res = await fetch(`/api/steam/orders?url=${encodeURIComponent(url)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Fetch failed");
  return data;
}

export function OrderBookCard({ url, onRemove }: Props) {
  const name = itemNameFromUrl(url);
  const parsed = parseMarketUrl(url);
  const { data, error, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["orders", url],
    queryFn: () => fetchOrders(url),
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          {data?.info?.iconUrl && (
            <img
              src={data.info.iconUrl}
              alt={name}
              className="h-12 w-12 shrink-0 rounded-md border border-zinc-800 bg-zinc-950 object-contain"
            />
          )}
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{name}</h3>
            {data?.info?.type && (
              <p className="text-xs text-zinc-500">{data.info.type}</p>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 hover:text-emerald-400"
            >
              View on Steam ↗
            </a>
          </div>
        </div>
        <button
          onClick={() => onRemove(url)}
          className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-red-950 hover:text-red-400"
          title="Remove from watchlist"
        >
          ✕
        </button>
      </div>

      {isLoading && <p className="text-sm text-zinc-500">Loading...</p>}
      {error && (
        <p className="text-sm text-red-400">Error: {(error as Error).message}</p>
      )}

      {data && (
        <>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-zinc-500">Lowest sell: </span>
              <span className="font-medium text-emerald-400">
                {data.lowestSell != null
                  ? formatAmount(data.lowestSell, data.currencySymbol)
                  : "—"}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Highest buy: </span>
              <span className="font-medium text-sky-400">
                {data.highestBuy != null
                  ? formatAmount(data.highestBuy, data.currencySymbol)
                  : "—"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="mb-1 font-medium text-zinc-400">Sell orders</p>
              <OrderTable
                rows={data.sell.slice(0, 6)}
                tone="sell"
                currencySymbol={data.currencySymbol}
              />
            </div>
            <div>
              <p className="mb-1 font-medium text-zinc-400">Buy orders</p>
              <OrderTable
                rows={data.buy.slice(0, 6)}
                tone="buy"
                currencySymbol={data.currencySymbol}
              />
            </div>
          </div>

          {parsed && (
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-400">
                Price history
              </p>
              <PriceChart
                appid={parsed.appid}
                marketHashName={parsed.marketHashName}
              />
            </div>
          )}

          <p className="text-right text-[10px] text-zinc-600">
            {isFetching
              ? "Updating…"
              : `Updated at ${new Date(dataUpdatedAt).toLocaleTimeString("en-US")}`}
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
    return <p className="text-zinc-600">No data</p>;
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
          <tr key={i}>
            <td
              className={
                tone === "sell" ? "text-emerald-400" : "text-sky-400"
              }
            >
              {formatAmount(r.price, currencySymbol)}
            </td>
            <td className="text-right text-zinc-400">{r.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
