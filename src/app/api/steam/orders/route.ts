import { NextRequest, NextResponse } from "next/server";
import {
  getItemOrders,
  convertOrdersToVnd,
  parseMarketUrl,
  SteamRateLimitError,
} from "@/lib/steam/steam";
import { recordSnapshot } from "@/lib/snapshots";
import { getCachedItemInfo, cacheItemInfo } from "@/lib/itemInfoCache";
import { getCachedOrders, setCachedOrders } from "@/lib/ordersCache";
import { getCachedVndAnchor } from "@/lib/vndCache";
import { getGlobalFxRate, updateGlobalFxRate } from "@/lib/fxRateCache";

// Always run on the server, never statically cached.
export const dynamic = "force-dynamic";

/**
 * GET /api/steam/orders?url=<market listing url>
 *   or ?appid=..&name=..
 *
 * Returns the current buy/sell order book (converted to VND) plus
 * icon/type info. This is the PROXY the browser talks to — the browser
 * must never hit Steam directly (CORS + rate limits).
 *
 * Cached server-side for 20s (see lib/ordersCache.ts) — Steam rate-limits
 * ~20 req/min/IP, and without caching every client poll would count against
 * that budget directly.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  try {
    let appid = Number(sp.get("appid"));
    let name = sp.get("name") ?? "";

    const url = sp.get("url");
    if (url) {
      const parsed = parseMarketUrl(url);
      if (!parsed) {
        return NextResponse.json(
          { error: "Invalid Steam Market URL" },
          { status: 400 },
        );
      }
      appid = parsed.appid;
      name = parsed.marketHashName;
    }

    if (!appid || !name) {
      return NextResponse.json(
        { error: "Provide ?url, or ?appid&name" },
        { status: 400 },
      );
    }

    const cacheKey = `${appid}:${name}`;
    const cached = await getCachedOrders(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const rawOrders = await getItemOrders(appid, name);

    // Icon/type come from the SAME listing-page HTML we just fetched — no
    // extra Steam call. Only fall back to the (rate-limited) search
    // endpoint if that extraction genuinely found nothing.
    let info: { iconUrl: string | null; type: string | null };
    if (rawOrders.iconUrl || rawOrders.itemType) {
      info = { iconUrl: rawOrders.iconUrl, type: rawOrders.itemType };
      cacheItemInfo(appid, name, info).catch(() => {});
    } else {
      info = await getCachedItemInfo(appid, name);
    }

    const orders = await resolveVndOrders(rawOrders, appid, name);

    await recordSnapshot(
      appid,
      name,
      orders.lowestSell,
      orders.highestBuy,
      orders.currencySymbol,
    );

    const payload = { ...orders, info };
    await setCachedOrders(cacheKey, payload);

    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof SteamRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

/**
 * Convert an order book to VND, preferring an exact per-item anchor
 * (cached or freshly fetched from Steam's priceoverview) and falling back
 * to an approximate global exchange rate when Steam's priceoverview
 * endpoint is rate-limited and no per-item anchor has ever been recorded.
 * An approximate VND price is far better UX than showing the wrong
 * currency entirely — it self-corrects to exact once a real anchor lands.
 */
async function resolveVndOrders(
  rawOrders: Awaited<ReturnType<typeof getItemOrders>>,
  appid: number,
  name: string,
) {
  if (rawOrders.currencySymbol === "₫") return rawOrders;

  const anchorNative = rawOrders.sell[0]?.price ?? rawOrders.buy[0]?.price;
  if (!anchorNative) return rawOrders;

  const exactAnchor = await getCachedVndAnchor(appid, name).catch(() => null);

  if (exactAnchor) {
    // Keep the global fallback rate fresh whenever we get a real reading.
    if (rawOrders.currencySymbol) {
      updateGlobalFxRate(rawOrders.currencySymbol, exactAnchor / anchorNative).catch(
        () => {},
      );
    }
    return convertOrdersToVnd(rawOrders, appid, name, exactAnchor);
  }

  if (!rawOrders.currencySymbol) return rawOrders;
  const fallbackRate = await getGlobalFxRate(rawOrders.currencySymbol).catch(() => null);
  if (!fallbackRate) return rawOrders;

  const approxAnchor = Math.round(anchorNative * fallbackRate);
  return convertOrdersToVnd(rawOrders, appid, name, approxAnchor);
}
