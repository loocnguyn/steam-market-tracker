import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieValue, SESSION_COOKIE } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getSteamId(req: NextRequest): string | null {
  const session = verifySessionCookieValue(req.cookies.get(SESSION_COOKIE.name)?.value);
  return session?.steamid ?? null;
}

export async function GET(req: NextRequest) {
  const steamid = getSteamId(req);
  if (!steamid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_watchlist")
    .select("appid, market_hash_name, icon_url, item_type, added_at")
    .eq("steamid", steamid)
    .order("added_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: NextRequest) {
  const steamid = getSteamId(req);
  if (!steamid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const appid = Number(body?.appid);
  const marketHashName = String(body?.marketHashName ?? "");
  if (!appid || !marketHashName) {
    return NextResponse.json({ error: "appid and marketHashName are required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("user_watchlist").upsert(
    {
      steamid,
      appid,
      market_hash_name: marketHashName,
      icon_url: body?.iconUrl ?? null,
      item_type: body?.type ?? null,
    },
    { onConflict: "steamid,appid,market_hash_name" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const steamid = getSteamId(req);
  if (!steamid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const appid = Number(searchParams.get("appid"));
  const marketHashName = searchParams.get("marketHashName") ?? "";
  if (!appid || !marketHashName) {
    return NextResponse.json({ error: "appid and marketHashName are required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("user_watchlist")
    .delete()
    .eq("steamid", steamid)
    .eq("appid", appid)
    .eq("market_hash_name", marketHashName);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
