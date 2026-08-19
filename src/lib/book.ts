import type { BookLevel } from "@/lib/types";

/**
 * Aggregate raw exchange levels into display buckets of `tickSize`.
 *
 * Why this exists: Binance quotes BTCUSDT in $0.01 increments. Rendering those
 * raw at one decimal produces rows that all read "65,470.0" — visually
 * identical prices with different sizes, and a spread that rounds to zero.
 *
 * Real venues solve this by aggregating, not by rounding the label: adjacent
 * levels are merged into a bucket and their sizes are SUMMED, so the depth
 * shown at a price is the true depth available at or better than that price.
 *
 * Rounding direction is deliberate and asymmetric — bids floor, asks ceil — so
 * a bucket never claims liquidity at a better price than actually exists, and
 * the two sides can never collapse onto the same bucket and fake a zero spread.
 */
export function aggregateLevels(
  raw: [string, string][],
  tickSize: number,
  side: "bid" | "ask",
  limit: number
): BookLevel[] {
  if (tickSize <= 0) tickSize = 0.01;

  // Integer bucket keys avoid float drift (65470.1 / 0.1 = 654700.9999…).
  const inverse = 1 / tickSize;
  const round = side === "bid" ? Math.floor : Math.ceil;

  const buckets = new Map<number, number>();
  const order: number[] = [];

  for (const [priceStr, sizeStr] of raw) {
    const price = Number(priceStr);
    const size = Number(sizeStr);
    if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) continue;

    const key = round(price * inverse + (side === "bid" ? 1e-9 : -1e-9));
    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, size);
      order.push(key);
    } else {
      buckets.set(key, existing + size);
    }
  }

  // Best price first: bids descend, asks ascend.
  order.sort((a, b) => (side === "bid" ? b - a : a - b));

  const out: BookLevel[] = [];
  let total = 0;
  for (let i = 0; i < Math.min(order.length, limit); i++) {
    const key = order[i];
    const size = buckets.get(key)!;
    total += size;
    out.push({ price: key / inverse, size, total });
  }
  return out;
}
