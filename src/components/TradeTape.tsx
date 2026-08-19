"use client";

import { getMarket } from "@/lib/config";
import { formatPrice, formatQty, formatTime } from "@/lib/format";
import { useMarketStore } from "@/store/marketStore";

export function TradeTape() {
  const trades = useMarketStore((s) => s.trades);
  const symbol = useMarketStore((s) => s.symbol);
  const market = getMarket(symbol);

  return (
    <div className="panel flex flex-col min-h-0">
      <div className="panel-header">
        <span>Trades</span>
      </div>

      <div className="grid grid-cols-3 px-2 py-1 text-2xs text-text-muted border-b border-line">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {trades.length === 0
          ? Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="px-2 py-[3px]">
                <div className="skeleton h-[13px] w-full" />
              </div>
            ))
          : trades.map((t) => (
              <div
                key={t.id}
                className={`grid grid-cols-3 px-2 h-[19px] items-center text-2xs num ${
                  t.isBuyerMaker ? "flash-down" : "flash-up"
                }`}
              >
                <span className={t.isBuyerMaker ? "text-short" : "text-long"}>
                  {formatPrice(t.price, market.tradeDecimals)}
                </span>
                <span className="text-right text-text-secondary">{formatQty(t.qty)}</span>
                <span className="text-right text-text-muted">{formatTime(t.time)}</span>
              </div>
            ))}
      </div>
    </div>
  );
}
