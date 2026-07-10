// Steam Market data types

/** A single price level in the buy/sell order book. */
export interface OrderLevel {
  /** Price in the requested currency's major unit (e.g. VND). */
  price: number;
  /** Quantity available at this price level (cumulative as Steam returns it). */
  quantity: number;
}

/** Parsed result of the itemordershistogram endpoint. */
export interface ItemOrders {
  /** Lowest sell (ask) price — what you pay to buy now. */
  lowestSell: number | null;
  /** Highest buy (bid) price — what you get selling now. */
  highestBuy: number | null;
  /** Sell orders, ascending by price. */
  sell: OrderLevel[];
  /** Buy orders, descending by price. */
  buy: OrderLevel[];
  /**
   * The currency symbol Steam actually rendered prices in (e.g. "₫", "$").
   * Steam picks this by GeoIP of the requesting server, not a fixed value —
   * always display prices using this rather than assuming a currency.
   */
  currencySymbol: string | null;
  /**
   * Icon/type extracted from the SAME listing page HTML — no extra Steam
   * call needed, unlike the old search-endpoint-based lookup.
   */
  iconUrl: string | null;
  itemType: string | null;
  /** When this snapshot was captured (ms epoch). */
  capturedAt: number;
}

/** Result of the priceoverview endpoint. */
export interface PriceOverview {
  lowestPrice: string | null;
  medianPrice: string | null;
  volume: number | null;
}

/** A point in the price history chart. */
export interface PricePoint {
  /** ms epoch */
  time: number;
  price: number;
  volume: number;
}

/** Item icon + short description, used for display. */
export interface ItemInfo {
  iconUrl: string | null;
  type: string | null;
}
