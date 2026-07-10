import { createServiceClient } from "@/lib/supabase/server";

/**
 * Global (not per-item) VND-per-unit exchange rate, keyed by currency
 * symbol (e.g. "$"). Used as a last-resort approximation for brand-new
 * items that have never had a successful per-item VND anchor fetch —
 * Steam's `priceoverview` endpoint has its own, much stricter rate limit
 * than the order-book listing page, and under sustained load it can stay
 * 429'd for a long time. Showing an approximate VND price (accurate to
 * within a few percent based on observed real ratios) beats showing the
 * wrong currency entirely. The per-item anchor (see vndCache.ts) is always
 * preferred when available — this is purely a fallback.
 */
export async function getGlobalFxRate(currencySymbol: string): Promise<number | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("fx_rate_cache")
    .select("vnd_per_unit")
    .eq("currency_symbol", currencySymbol)
    .maybeSingle();
  return data ? Number(data.vnd_per_unit) : null;
}

/** Called whenever a real per-item anchor succeeds, to keep the fallback fresh. */
export async function updateGlobalFxRate(
  currencySymbol: string,
  vndPerUnit: number,
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("fx_rate_cache").upsert(
    { currency_symbol: currencySymbol, vnd_per_unit: vndPerUnit, updated_at: new Date().toISOString() },
    { onConflict: "currency_symbol" },
  );
}
