import type { ItemOrders, OrderLevel, PriceOverview, PricePoint } from "./types";

/**
 * Steam Market scraper.
 *
 * IMPORTANT: These are unofficial endpoints. Steam rate-limits aggressively
 * (~20 req/min/IP). ALL calls must go through the server (never the browser)
 * and results MUST be cached. See README for the throttling strategy.
 *
 * Steam rolled out a redesigned (React SSR) market listing page that no
 * longer exposes the classic `item_nameid` / itemordershistogram flow — the
 * order book table is now rendered directly as HTML in the listing page
 * response. So we parse that HTML instead of resolving item_nameid.
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

/** Steam currency codes (subset). VND is 15, not 20 — easy to get wrong. */
export const CURRENCY = { USD: 1, VND: 15 } as const;

function encodeName(name: string): string {
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

/** Parse Steam's "1.500₫" / "15,995" style strings into a number. */
function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  // VND formatting uses '.' as a thousands separator and no decimals.
  const normalized = cleaned.replace(/[.,]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Extract Price/Quantity rows from one rendered order-book `<table>`. */
function parseOrderTable(tableHtml: string): OrderLevel[] {
  const rows: OrderLevel[] = [];
  const rowRe = /<tr><td><span[^>]*>([^<]+)<\/span><\/td><td><span[^>]*>([^<]+)<\/span><\/td><\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(tableHtml))) {
    rows.push({ price: parseNumber(m[1]), quantity: parseNumber(m[2]) });
  }
  return rows;
}

/**
 * Extract the `<table class="...">...</table>` immediately following the
 * given anchor phrase (e.g. "for sale starting at" or "requests to buy at").
 */
function extractTableAfter(html: string, anchor: string): string | null {
  const idx = html.indexOf(anchor);
  if (idx === -1) return null;
  const tableStart = html.indexOf("<table", idx);
  const tableEnd = html.indexOf("</table>", tableStart);
  if (tableStart === -1 || tableEnd === -1) return null;
  return html.slice(tableStart, tableEnd + "</table>".length);
}

/**
 * Fetch and parse the buy/sell order book directly from the listing page's
 * server-rendered HTML (the "lệnh mua / lệnh bán" table).
 *
 * NOTE: currency is NOT controllable via query param on the new page — it
 * follows Steam's own GeoIP/locale detection. For Vietnamese users this
 * reliably renders in VND (₫), which is what this app targets.
 */
export async function getItemOrders(
  appid: number,
  marketHashName: string,
): Promise<ItemOrders> {
  const url = `${BASE}/listings/${appid}/${encodeName(marketHashName)}`;
  const res = await steamFetch(url);
  const html = await res.text();

  const sellTable = extractTableAfter(html, "for sale starting at");
  const buyTable = extractTableAfter(html, "requests to buy at");

  const sell = sellTable ? parseOrderTable(sellTable) : [];
  const buy = buyTable ? parseOrderTable(buyTable) : [];

  if (!sellTable && !buyTable) {
    if (html.includes("This item is a commodity")) {
      // Page structure changed but we know it should have an order book.
      throw new Error(
        `Order book layout for ${marketHashName} changed unexpectedly.`,
      );
    }
    throw new Error(
      `${marketHashName} không có order book gộp (không phải commodity item — ` +
        `mỗi item có giá trị riêng, ví dụ skin CS2 theo float). ` +
        `Chỉ item dạng commodity (TF2, Dota 2, v.v.) mới có bảng lệnh mua/bán.`,
    );
  }

  return {
    lowestSell: sell[0]?.price ?? null,
    highestBuy: buy[0]?.price ?? null,
    sell,
    buy,
    capturedAt: Date.now(),
  };
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
