import { createServiceClient } from "@/lib/supabase/server";
import { getItemInfo } from "@/lib/steam/steam";

/**
 * Icon/type barely ever change for a given item, so cache them permanently
 * in the `items` row instead of re-fetching from Steam on every order-book
 * request (that was an extra Steam call per poll, contributing to rate
 * limiting).
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

  await supabase.from("items").upsert(
    {
      appid,
      market_hash_name: marketHashName,
      icon_url: info?.iconUrl ?? null,
      item_type: info?.type ?? null,
    },
    { onConflict: "appid,market_hash_name" },
  );

  return { iconUrl: info?.iconUrl ?? null, type: info?.type ?? null };
}
