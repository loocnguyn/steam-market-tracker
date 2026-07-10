import { createServiceClient } from "@/lib/supabase/server";
import { getPriceOverview, CURRENCY } from "@/lib/steam/steam";

const TTL_MS = 5 * 60 * 1000; // 5 minutes — FX/price barely moves that fast

/**
 * Cached VND anchor price (from `priceoverview`) used to convert order-book
 * prices into VND. Cached because fetching it fresh on every order-book
 * request was an extra Steam call per poll, contributing to rate limiting.
 */
export async function getCachedVndAnchor(
  appid: number,
  marketHashName: string,
): Promise<number | null> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("items")
    .select("vnd_lowest_price, vnd_cached_at")
    .eq("appid", appid)
    .eq("market_hash_name", marketHashName)
    .maybeSingle();

  if (
    existing?.vnd_lowest_price != null &&
    existing.vnd_cached_at &&
    Date.now() - new Date(existing.vnd_cached_at).getTime() < TTL_MS
  ) {
    return Number(existing.vnd_lowest_price);
  }

  const overview = await getPriceOverview(appid, marketHashName, CURRENCY.VND).catch(
    () => null,
  );
  const value = overview?.lowestPrice
    ? Number(overview.lowestPrice.replace(/[^\d]/g, "")) || null
    : null;
  if (value == null) return existing?.vnd_lowest_price != null ? Number(existing.vnd_lowest_price) : null;

  await supabase.from("items").upsert(
    {
      appid,
      market_hash_name: marketHashName,
      vnd_lowest_price: value,
      vnd_cached_at: new Date().toISOString(),
    },
    { onConflict: "appid,market_hash_name" },
  );

  return value;
}
