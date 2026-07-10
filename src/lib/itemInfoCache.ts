import { createServiceClient } from "@/lib/supabase/server";
import { getItemInfo } from "@/lib/steam/steam";

/**
 * Persist icon/type once resolved, so a future request can skip re-deriving
 * it. Prefer calling this with data already extracted from the order-book
 * HTML (free — no extra Steam call) rather than the search-endpoint-based
 * getItemInfo fallback below (which has its own, much stricter rate limit).
 */
export async function cacheItemInfo(
  appid: number,
  marketHashName: string,
  info: { iconUrl: string | null; type: string | null },
): Promise<void> {
  if (!info.iconUrl && !info.type) return;
  const supabase = createServiceClient();
  await supabase.from("items").upsert(
    {
      appid,
      market_hash_name: marketHashName,
      icon_url: info.iconUrl,
      item_type: info.type,
    },
    { onConflict: "appid,market_hash_name" },
  );
}

/**
 * Read cached icon/type, falling back to the search-endpoint lookup only
 * when we have nothing cached at all (e.g. HTML extraction failed for this
 * item, such as non-commodity items with a different page layout).
 */
export async function getCachedItemInfo(
  appid: number,
  marketHashName: string,
): Promise<{ iconUrl: string | null; type: string | null }> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("items")
    .select("icon_url, item_type")
    .eq("appid", appid)
    .eq("market_hash_name", marketHashName)
    .maybeSingle();

  if (existing?.icon_url || existing?.item_type) {
    return { iconUrl: existing.icon_url, type: existing.item_type };
  }

  const info = await getItemInfo(appid, marketHashName).catch(() => null);
  if (info?.iconUrl || info?.type) {
    await cacheItemInfo(appid, marketHashName, info);
  }
  return { iconUrl: info?.iconUrl ?? null, type: info?.type ?? null };
}
