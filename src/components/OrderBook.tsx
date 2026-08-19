"use client";

import { useMemo } from "react";
import { getMarket } from "@/lib/config";
import { formatPrice, formatQty } from "@/lib/format";
import { useMarketStore } from "@/store/marketStore";
import type { BookLevel } from "@/lib/types";

const ROWS = 12;

function Row({
  level,
  maxTotal,
  side,
  decimals,
  onClick,
}: {
  level: BookLevel | undefined;
  maxTotal: number;
  side: "bid" | "ask";
  decimals: number;
  onClick: (price: number) => void;
}) {
  if (!level) {
    return <div className="h-[19px]" />;
  }

  const pct = maxTotal > 0 ? (level.total / maxTotal) * 100 : 0;
  const priceTone = side === "bid" ? "text-long" : "text-short";
  const barTone = side === "bid" ? "bg-long-dim" : "bg-short-dim";

  return (
    <button
      type="button"
      onClick={() => onClick(level.price)}
      className="relative w-full h-[19px] grid grid-cols-[1fr_1fr_1fr] items-center px-2
                 text-2xs num hover:bg-bg-hover transition-colors group"
      title={`Click to use ${formatPrice(level.price, decimals)} as the limit price`}
    >
      {/* Depth bar renders from the outside edge, like every real venue. */}
      <span
        className={`absolute inset-y-0 right-0 ${barTone} pointer-events-none`}
        style={{ width: `${pct}%` }}
        aria-hidden
      />
      <span className={`relative text-left ${priceTone}`}>
        {formatPrice(level.price, decimals)}
      </span>
      <span className="relative text-right text-text-secondary">{formatQty(level.size)}</span>
      <span className="relative text-right text-text-muted">{formatQty(level.total)}</span>
    </button>
  );
}

export function OrderBook({ onPriceClick }: { onPriceClick: (price: number) => void }) {
  const bids = useMarketStore((s) => s.bids);
  const asks = useMarketStore((s) => s.asks);
  const symbol = useMarketStore((s) => s.symbol);
  const tickDirection = useMarketStore((s) => s.tickDirection);
  const market = getMarket(symbol);

  const { topBids, topAsks, maxTotal, spread, spreadBps, mid } = useMemo(() => {
    const b = bids.slice(0, ROWS);
    const a = asks.slice(0, ROWS);
    const max = Math.max(b[b.length - 1]?.total ?? 0, a[a.length - 1]?.total ?? 0);
    const bestBid = b[0]?.price ?? 0;
    const bestAsk = a[0]?.price ?? 0;
    const s = bestBid && bestAsk ? bestAsk - bestBid : 0;
    const m = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;
    return {
      topBids: b,
      topAsks: a,
      maxTotal: max,
      spread: s,
      spreadBps: m > 0 ? (s / m) * 10_000 : 0,
      mid: m,
    };
  }, [bids, asks]);

  const loading = bids.length === 0 && asks.length === 0;
  const midTone =
    tickDirection === "up" ? "text-long" : tickDirection === "down" ? "text-short" : "text-text-primary";

  return (
    <div className="panel flex flex-col min-h-0">
      <div className="panel-header">
        <span>Order Book</span>
        <span className="normal-case tracking-normal">
          {spread > 0 ? `${formatPrice(spread, market.priceDecimals)} · ${spreadBps.toFixed(1)}bps` : ""}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_1fr_1fr] px-2 py-1 text-2xs text-text-muted border-b border-line">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {loading ? (
        <div className="flex-1 p-2 space-y-1">
          {Array.from({ length: ROWS * 2 + 1 }).map((_, i) => (
            <div key={i} className="skeleton h-[15px] w-full" />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center py-1">
          {/* Asks descend toward the spread, so the best ask sits adjacent to mid. */}
          <div className="flex flex-col-reverse">
            {Array.from({ length: ROWS }).map((_, i) => (
              <Row
                key={`ask-${i}`}
                level={topAsks[i]}
                maxTotal={maxTotal}
                side="ask"
                decimals={market.priceDecimals}
                onClick={onPriceClick}
              />
            ))}
          </div>

          <div className="flex items-center justify-between px-2 py-1.5 my-0.5 border-y border-line bg-bg-raised/40">
            <span className={`num text-sm font-semibold ${midTone}`}>
              {mid > 0 ? formatPrice(mid, market.priceDecimals) : "—"}
            </span>
            <span className="label">Mid</span>
          </div>

          <div className="flex flex-col">
            {Array.from({ length: ROWS }).map((_, i) => (
              <Row
                key={`bid-${i}`}
                level={topBids[i]}
                maxTotal={maxTotal}
                side="bid"
                decimals={market.priceDecimals}
                onClick={onPriceClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
