"use client";

import { useState } from "react";
import { getMarket } from "@/lib/config";
import { formatPercent, formatPrice, formatUsd } from "@/lib/format";
import { useMarketStore } from "@/store/marketStore";
import { useDemoStore } from "@/store/demoStore";
import { useAccountStore } from "@/store/accountStore";
import type { TradingAccount } from "@/hooks/useTradingAccount";

export function PositionPanel({
  account,
  markPrice,
}: {
  account: TradingAccount;
  markPrice: number;
}) {
  const symbol = useMarketStore((s) => s.symbol);
  const market = getMarket(symbol);
  const history = useDemoStore((s) => s.history);
  const isOptimistic = useAccountStore((s) => s.optimisticPosition !== null);

  const [tab, setTab] = useState<"position" | "history">("position");
  const [closing, setClosing] = useState(false);

  const p = account.position;
  const pnl = account.unrealizedPnl(markPrice);
  const pnlPct = p.margin > 0 ? (pnl / p.margin) * 100 : 0;
  const pnlTone = pnl > 0 ? "text-long" : pnl < 0 ? "text-short" : "text-text-secondary";

  const nearLiquidation =
    p.isOpen &&
    p.liquidationPrice > 0 &&
    Math.abs(markPrice - p.liquidationPrice) / markPrice < 0.05;

  async function close() {
    setClosing(true);
    try {
      await account.close(markPrice);
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="panel flex flex-col min-h-0">
      <div className="panel-header gap-3">
        <div className="flex items-center gap-3">
          <button
            className={tab === "position" ? "text-text-primary" : "hover:text-text-secondary"}
            onClick={() => setTab("position")}
          >
            Position
          </button>
          <button
            className={tab === "history" ? "text-text-primary" : "hover:text-text-secondary"}
            onClick={() => setTab("history")}
          >
            History
          </button>
        </div>
        {isOptimistic && (
          <span className="normal-case tracking-normal text-accent">confirming…</span>
        )}
      </div>

      {tab === "position" ? (
        !p.isOpen ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <p className="text-xs text-text-muted">No open position</p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`px-1.5 h-5 inline-flex items-center rounded text-2xs font-semibold ${
                    p.isLong ? "bg-long/20 text-long" : "bg-short/20 text-short"
                  }`}
                >
                  {p.isLong ? "LONG" : "SHORT"}
                </span>
                <span className="text-xs font-medium">{market.label}</span>
              </div>
              <button className="btn-ghost h-7" onClick={close} disabled={closing}>
                {closing ? "Closing…" : "Close"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Cell label="Size" value={formatUsd(p.sizeUsd)} />
              <Cell label="Margin" value={formatUsd(p.margin)} />
              <Cell label="Entry" value={formatPrice(p.entryPrice, market.priceDecimals)} />
              <Cell label="Mark" value={formatPrice(markPrice, market.priceDecimals)} />
              <Cell
                label="Liquidation"
                value={p.liquidationPrice > 0 ? formatPrice(p.liquidationPrice, market.priceDecimals) : "—"}
                tone={nearLiquidation ? "text-short" : "text-amber-400"}
              />
              <Cell
                label="Unrealized PnL"
                value={`${formatUsd(pnl, true)} (${formatPercent(pnlPct)})`}
                tone={pnlTone}
              />
            </div>

            {nearLiquidation && (
              <p className="text-2xs text-short">
                Mark price is within 5% of liquidation.
              </p>
            )}
          </div>
        )
      ) : (
        <div className="flex-1 overflow-y-auto">
          {account.source !== "demo" ? (
            <p className="p-3 text-xs text-text-muted">
              On-chain history reads from PositionClosed events — connect a wallet with past trades.
            </p>
          ) : history.length === 0 ? (
            <p className="p-3 text-xs text-text-muted">No closed trades yet.</p>
          ) : (
            <table className="w-full text-2xs num">
              <thead className="text-text-muted">
                <tr className="border-b border-line">
                  <th className="text-left px-3 py-1.5 font-normal">Side</th>
                  <th className="text-right px-3 py-1.5 font-normal">Size</th>
                  <th className="text-right px-3 py-1.5 font-normal">Entry</th>
                  <th className="text-right px-3 py-1.5 font-normal">Exit</th>
                  <th className="text-right px-3 py-1.5 font-normal">PnL</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-line/50">
                    <td className={`px-3 py-1.5 ${h.side === "long" ? "text-long" : "text-short"}`}>
                      {h.side.toUpperCase()}
                    </td>
                    <td className="text-right px-3 py-1.5 text-text-secondary">
                      {formatUsd(h.sizeUsd)}
                    </td>
                    <td className="text-right px-3 py-1.5 text-text-secondary">
                      {formatPrice(h.entry, market.priceDecimals)}
                    </td>
                    <td className="text-right px-3 py-1.5 text-text-secondary">
                      {formatPrice(h.exit, market.priceDecimals)}
                    </td>
                    <td
                      className={`text-right px-3 py-1.5 ${
                        h.pnl >= 0 ? "text-long" : "text-short"
                      }`}
                    >
                      {formatUsd(h.pnl, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className={`num text-xs ${tone ?? "text-text-primary"}`}>{value}</span>
    </div>
  );
}
