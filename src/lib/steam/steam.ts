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

/**
 * Parse a Steam-formatted amount string into a number, WITHOUT assuming a
 * fixed currency.
 *
 * Steam's price display currency depends on GeoIP of the requesting IP (not
 * controllable via query param — verified empirically), so the same code can
 * see "11.500₫" (VND, '.' = thousands sep, no decimals) from one server
 * region and "$0.40" (USD, '.' = decimal point) from another. Blindly
 * stripping separators breaks USD-style amounts ("$0.40" -> wrongly parsed
 * as 40). Instead: inspect how many digits follow the LAST separator — 1-2
 * digits means it's a decimal point (keep it), 3 means it's a thousands
 * separator (strip it).
 */
function parseAmount(raw: string): number {
  const noSuffix = raw.replace(/\s*(or more|or less)\s*$/i, "");
  const numeric = noSuffix.replace(/[^\d.,]/g, "");
  const lastSepIdx = Math.max(numeric.lastIndexOf("."), numeric.lastIndexOf(","));
  if (lastSepIdx === -1) {
    const n = Number(numeric);
    return Number.isFinite(n) ? n : 0;
  }
  const decimalDigits = numeric.length - lastSepIdx - 1;
  if (decimalDigits === 1 || decimalDigits === 2) {
    const intPart = numeric.slice(0, lastSepIdx).replace(/[.,]/g, "");
    const fracPart = numeric.slice(lastSepIdx + 1);
    const n = Number(`${intPart}.${fracPart}`);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(numeric.replace(/[.,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Extract the currency symbol (e.g. "₫", "$") from a Steam amount string. */
function extractCurrencySymbol(raw: string): string | null {
  const noSuffix = raw.replace(/\s*(or more|or less)\s*$/i, "");
  const match = noSuffix.match(/[^\d.,\s]+/g);
  return match ? match.join("") : null;
}

/** Extract Price/Quantity rows from one rendered order-book `<table>`. */
function parseOrderTable(
  tableHtml: string,
): { rows: OrderLevel[]; currencySymbol: string | null } {
  const rows: OrderLevel[] = [];
  let currencySymbol: string | null = null;
  const rowRe = /<tr><td><span[^>]*>([^<]+)<\/span><\/td><td><span[^>]*>([^<]+)<\/span><\/td><\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(tableHtml))) {
    if (currencySymbol === null) currencySymbol = extractCurrencySymbol(m[1]);
    rows.push({ price: parseAmount(m[1]), quantity: parseAmount(m[2]) });
  }
  return { rows, currencySymbol };
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
 * follows Steam's own GeoIP detection of the requesting server's IP
 * (verified empirically), so it can vary between deployments/regions. The
 * returned `currencySymbol` reflects whatever Steam actually served —
 * callers MUST display prices using it rather than assuming a fixed
 * currency, or numbers will be mislabeled (e.g. USD "$0.40" shown as "40₫").
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

  if (!sellTable && !buyTable) {
    if (html.includes("This item is a commodity")) {
      // Page structure changed but we know it should have an order book.
      throw new Error(
        `Order book layout for ${marketHashName} changed unexpectedly.`,
      );
    }
    throw new Error(
      `${marketHashName} has no aggregate order book (not a commodity item — ` +
        `each unit has a unique value, e.g. float-based CS2 skins). ` +
        `Only commodity items (TF2, Dota 2, etc.) have a buy/sell order book.`,
    );
  }

  const sellParsed = sellTable ? parseOrderTable(sellTable) : null;
  const buyParsed = buyTable ? parseOrderTable(buyTable) : null;

  return {
    lowestSell: sellParsed?.rows[0]?.price ?? null,
    highestBuy: buyParsed?.rows[0]?.price ?? null,
    currencySymbol: sellParsed?.currencySymbol ?? buyParsed?.currencySymbol ?? null,
    sell: sellParsed?.rows ?? [],
    buy: buyParsed?.rows ?? [],
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

/** Base URL for Steam economy item icons; combine with an `icon_url`. */
const ICON_BASE = "https://community.cloudflare.steamstatic.com/economy/image";

/**
 * Look up an item's icon and short type/description via the market search
 * endpoint (returns clean JSON, no HTML scraping needed). Matches by exact
 * `hash_name` since search is fuzzy.
 */
export async function getItemInfo(
  appid: number,
  marketHashName: string,
): Promise<{ iconUrl: string | null; type: string | null } | null> {
  const url =
    `${BASE}/search/render/?query=${encodeName(marketHashName)}` +
    `&appid=${appid}&start=0&count=10&norender=1`;
  const res = await steamFetch(url);
  const data = (await res.json()) as {
    success: boolean;
    results?: {
      hash_name: string;
      asset_description?: { icon_url?: string; type?: string };
    }[];
  };
  const hit = data.results?.find((r) => r.hash_name === marketHashName);
  if (!hit) return null;
  const iconUrl = hit.asset_description?.icon_url
    ? `${ICON_BASE}/${hit.asset_description.icon_url}`
    : null;
  return { iconUrl, type: hit.asset_description?.type ?? null };
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
