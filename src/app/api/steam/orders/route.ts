import { NextRequest, NextResponse } from "next/server";
import {
  getItemOrders,
  getItemInfo,
  parseMarketUrl,
  SteamRateLimitError,
} from "@/lib/steam/steam";
import { recordSnapshot } from "@/lib/snapshots";

// Always run on the server, never statically cached.
export const dynamic = "force-dynamic";

/**
 * GET /api/steam/orders?url=<market listing url>
 *   or ?appid=..&name=..
 *
 * Returns the current buy/sell order book plus icon/type info. This is the
 * PROXY the browser talks to — the browser must never hit Steam directly
 * (CORS + rate limits).
 *
 * NOTE: For production this should read from the Supabase cache populated by
 * the background poller instead of hitting Steam on every request.
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

    const [orders, info] = await Promise.all([
      getItemOrders(appid, name),
      getItemInfo(appid, name).catch(() => null),
    ]);

    await recordSnapshot(appid, name, orders.lowestSell, orders.highestBuy);

    return NextResponse.json({ ...orders, info });
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
