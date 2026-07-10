import { NextRequest, NextResponse } from "next/server";
import { searchItems, SteamRateLimitError, type SearchResult } from "@/lib/steam/steam";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/steam/search?q=<query> — search Steam Market items by name.
 *
 * Cached in Supabase per normalized query string. Steam rate-limits
 * aggressively (~20 req/min/IP shared across the whole deployment), so
 * repeated searches for the same term (typos being corrected, multiple
 * users, re-renders) would otherwise burn through that budget fast and
 * make search look broken ("no results") for an item that clearly exists.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (raw.length < 2) {
    return NextResponse.json({ results: [] });
  }
  const cacheKey = raw.toLowerCase();

  try {
    const supabase = createServiceClient();

    const { data: cached } = await supabase
      .from("search_cache")
      .select("results, cached_at")
      .eq("query", cacheKey)
      .maybeSingle();

    if (cached && Date.now() - new Date(cached.cached_at).getTime() < CACHE_TTL_MS) {
      return NextResponse.json({ results: cached.results as SearchResult[] });
    }

    const results = await searchItems(raw);

    await supabase
      .from("search_cache")
      .upsert(
        { query: cacheKey, results, cached_at: new Date().toISOString() },
        { onConflict: "query" },
      );

    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof SteamRateLimitError) {
      // Serve stale cache rather than a hard failure if we have anything,
      // even if past TTL — better than "no items found" for a real item.
      const supabase = createServiceClient();
      const { data: stale } = await supabase
        .from("search_cache")
        .select("results")
        .eq("query", cacheKey)
        .maybeSingle();
      if (stale) {
        return NextResponse.json({ results: stale.results as SearchResult[] });
      }
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
