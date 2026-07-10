import { NextRequest, NextResponse } from "next/server";
import {
  getItemOrders,
  convertOrdersToVnd,
  parseMarketUrl,
  SteamRateLimitError,
} from "@/lib/steam/steam";
import { recordSnapshot } from "@/lib/snapshots";
import { getCachedItemInfo } from "@/lib/itemInfoCache";
import { getCachedOrders, setCachedOrders } from "@/lib/ordersCache";
import { getCachedVndAnchor } from "@/lib/vndCache";

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

    const [rawOrders, info, vndAnchor] = await Promise.all([
      getItemOrders(appid, name),
      getCachedItemInfo(appid, name),
      getCachedVndAnchor(appid, name).catch(() => null),
    ]);

    const orders = await convertOrdersToVnd(rawOrders, appid, name, vndAnchor).catch(
      (err) => {
        // VND conversion is best-effort; native currency is a fine fallback,
        // but log so a persistent conversion failure isn't invisible.
        console.error("convertOrdersToVnd failed:", (err as Error).message);
        return rawOrders;
      },
    );

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
