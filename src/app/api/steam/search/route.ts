import { NextRequest, NextResponse } from "next/server";
import { searchItems, SteamRateLimitError } from "@/lib/steam/steam";

export const dynamic = "force-dynamic";

/** GET /api/steam/search?q=<query> — search Steam Market items by name. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }
  try {
    const results = await searchItems(q);
    return NextResponse.json({ results });
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
