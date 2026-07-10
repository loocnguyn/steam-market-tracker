import { createServiceClient } from "@/lib/supabase/server";

/**
 * Upsert the item row and record a price snapshot. Used to build our own
 * price history chart, since Steam's pricehistory endpoint requires a
 * logged-in session cookie we don't have.
 *
 * Best-effort: failures here must never break the order book response.
 */
export async function recordSnapshot(
  appid: number,
  marketHashName: string,
  lowestSell: number | null,
  highestBuy: number | null,
  currencySymbol: string | null,
): Promise<void> {
  try {
    const supabase = createServiceClient();

    const { data: item, error: itemError } = await supabase
      .from("items")
      .upsert(
        { appid, market_hash_name: marketHashName },
        { onConflict: "appid,market_hash_name" },
      )
      .select("id")
      .single();

    if (itemError || !item) {
      console.error("recordSnapshot: upsert item failed", itemError);
      return;
    }

    const { error: snapshotError } = await supabase
      .from("price_snapshots")
      .insert({
        item_id: item.id,
        lowest_sell: lowestSell,
        highest_buy: highestBuy,
        currency_symbol: currencySymbol,
      });

    if (snapshotError) {
      console.error("recordSnapshot: insert snapshot failed", snapshotError);
    }
  } catch (err) {
    console.error("recordSnapshot: unexpected error", err);
  }
}
