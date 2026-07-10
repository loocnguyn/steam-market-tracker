import { createServiceClient } from "@/lib/supabase/server";

const TTL_MS = 20_000;

/**
 * Server-side cache for order-book responses, keyed by "appid:name".
 *
 * The client polls every ~20s per visible card, and multiple browser
 * sessions can watch the same item simultaneously — without this cache each
 * poll/session would hit Steam directly and blow through its ~20 req/min/IP
 * limit almost immediately (that was the actual cause of "search always
 * rate limited": order-book polling was eating the whole budget).
 */
export async function getCachedOrders(key: string): Promise<unknown | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("orders_cache")
    .select("payload, cached_at")
    .eq("query", key)
    .maybeSingle();

  if (!data) return null;
  if (Date.now() - new Date(data.cached_at).getTime() > TTL_MS) return null;
  return data.payload;
}

export async function setCachedOrders(key: string, payload: unknown): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("orders_cache")
    .upsert(
      { query: key, payload, cached_at: new Date().toISOString() },
      { onConflict: "query" },
    );
}
