import type {
  ItemOrders,
  OrderLevel,
  PriceOverview,
  PricePoint,
  ResolvedItem,
} from "./types";

/**
 * Steam Market scraper.
 *
 * IMPORTANT: These are unofficial endpoints. Steam rate-limits aggressively
 * (~20 req/min/IP). ALL calls must go through the server (never the browser)
 * and results MUST be cached. See README for the throttling strategy.
 */

const BASE = "https://steamcommunity.com/market";

// Pretend to be a normal browser; Steam blocks obvious bots.
const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Steam currency codes. 1 = USD, 20 = VND. */
export const CURRENCY = { USD: 1, VND: 20 } as const;

function encodeName(name: string): string {
  // Steam expects the hash name URL-encoded, but keeps some chars readable.
  return encodeURIComponent(name);
}

async function steamFetch(url: string, extraHeaders?: Record<string, string>) {
  const res = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...extraHeaders },
    // Never cache at the fetch layer; we control caching ourselves.
    cache: "no-store",
  });
  if (res.status === 429) {
    throw new SteamRateLimitError();
  }
  if (!res.ok) {
    throw new Error(`Steam responded ${res.status} for ${url}`);
  }
  return res;
}

export class SteamRateLimitError extends Error {
  constructor() {
    super("Steam rate limit hit (429). Back off and retry later.");
    this.name = "SteamRateLimitError";
  }
}

/**
 * Resolve the internal `item_nameid` required by the order-book endpoint.
 *
 * This ID only appears embedded in the listing page HTML, so we scrape it
 * once and the caller should persist it (it never changes for an item).
 */
export async function resolveItemNameId(
  appid: number,
  marketHashName: string,
): Promise<ResolvedItem> {
  const url = `${BASE}/listings/${appid}/${encodeName(marketHashName)}`;
  const res = await steamFetch(url);
  const html = await res.text();

  // The page contains: Market_LoadOrderSpread( 176321926 );
  const match = html.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
  if (!match) {
    throw new Error(
      `Could not find item_nameid for ${marketHashName}. ` +
        `Item may not exist or the page structure changed.`,
    );
  }
  return { appid, marketHashName, itemNameId: match[1] };
}

/** Parse Steam's "1.500₫" style strings into a number. */
function parsePrice(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  // Vietnamese/EU format uses '.' as thousands sep and ',' as decimal.
  // Steam order histograms return integers for VND, so drop separators.
  const normalized = cleaned.replace(/[.,]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetch the buy/sell order book (the "lệnh mua / lệnh bán" table).
 * Requires the item_nameid from {@link resolveItemNameId}.
 */
export async function getItemOrders(
  itemNameId: string,
  currency: number = CURRENCY.VND,
  country = "VN",
): Promise<ItemOrders> {
  const url =
    `${BASE}/itemordershistogram?country=${country}&language=english` +
    `&currency=${currency}&item_nameid=${itemNameId}&two_factor=0`;
  const res = await steamFetch(url, { Referer: `${BASE}/` });
  const data = (await res.json()) as SteamHistogramResponse;

  const sell: OrderLevel[] = (data.sell_order_graph ?? []).map(
    ([price, quantity]) => ({ price, quantity }),
  );
  const buy: OrderLevel[] = (data.buy_order_graph ?? []).map(
    ([price, quantity]) => ({ price, quantity }),
  );

  return {
    lowestSell: data.lowest_sell_order
      ? parsePrice(data.lowest_sell_order)
      : (sell[0]?.price ?? null),
    highestBuy: data.highest_buy_order
      ? parsePrice(data.highest_buy_order)
      : (buy[0]?.price ?? null),
    sell,
    buy,
    capturedAt: Date.now(),
  };
}

interface SteamHistogramResponse {
  success: number;
  sell_order_graph?: [number, number, string][];
  buy_order_graph?: [number, number, string][];
  lowest_sell_order?: string;
  highest_buy_order?: string;
}

/** Lightweight price overview (lowest/median/volume). */
export async function getPriceOverview(
  appid: number,
  marketHashName: string,
  currency: number = CURRENCY.VND,
): Promise<PriceOverview> {
  const url =
    `${BASE}/priceoverview/?appid=${appid}&currency=${currency}` +
    `&market_hash_name=${encodeName(marketHashName)}`;
  const res = await steamFetch(url);
  const data = (await res.json()) as {
    success: boolean;
    lowest_price?: string;
    median_price?: string;
    volume?: string;
  };
  return {
    lowestPrice: data.lowest_price ?? null,
    medianPrice: data.median_price ?? null,
    volume: data.volume ? Number(data.volume.replace(/[^\d]/g, "")) : null,
  };
}

/**
 * Price history chart data.
 *
 * REQUIRES a logged-in Steam session cookie (`steamLoginSecure`) passed via
 * the STEAM_LOGIN_COOKIE env var. Without it Steam returns 400. Falls back to
 * an empty array so callers can degrade to snapshot-built charts.
 */
export async function getPriceHistory(
  appid: number,
  marketHashName: string,
  cookie: string | undefined = process.env.STEAM_LOGIN_COOKIE,
): Promise<PricePoint[]> {
  if (!cookie) return [];
  const url =
    `${BASE}/pricehistory/?appid=${appid}` +
    `&market_hash_name=${encodeName(marketHashName)}`;
  const res = await steamFetch(url, {
    Cookie: `steamLoginSecure=${cookie}`,
  });
  const data = (await res.json()) as {
    success: boolean;
    prices?: [string, number, string][];
  };
  if (!data.success || !data.prices) return [];

  return data.prices.map(([dateStr, price, volumeStr]) => ({
    time: new Date(dateStr).getTime(),
    price,
    volume: Number(volumeStr),
  }));
}

/**
 * Parse a Steam Market listing URL into { appid, marketHashName }.
 * Accepts e.g. https://steamcommunity.com/market/listings/3678970/Limitless%20Bow...
 */
export function parseMarketUrl(
  input: string,
): { appid: number; marketHashName: string } | null {
  try {
    const url = new URL(input.trim());
    const m = url.pathname.match(/\/market\/listings\/(\d+)\/(.+)$/);
    if (!m) return null;
    return {
      appid: Number(m[1]),
      marketHashName: decodeURIComponent(m[2]),
    };
  } catch {
    return null;
  }
}
