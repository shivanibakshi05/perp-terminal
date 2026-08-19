"use client";

import { ACTIVE_CHAIN, CONTRACTS_CONFIGURED, MARKETS, getMarket, type MarketSymbol } from "@/lib/config";
import { formatCompact, formatPercent, formatPrice, shortenAddress } from "@/lib/format";
import { useMarketStore } from "@/store/marketStore";
import { selectWrongNetwork, useWalletStore } from "@/store/walletStore";
import { ConnectionBadge } from "@/components/ConnectionBadge";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="hidden md:flex flex-col justify-center px-3 border-l border-line">
      <span className="label">{label}</span>
      <span className={`num text-xs ${tone ?? "text-text-primary"}`}>{value}</span>
    </div>
  );
}

export function Header() {
  const symbol = useMarketStore((s) => s.symbol);
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const ticker = useMarketStore((s) => s.ticker);
  const tickDirection = useMarketStore((s) => s.tickDirection);

  const status = useWalletStore((s) => s.status);
  const address = useWalletStore((s) => s.address);
  const demoMode = useWalletStore((s) => s.demoMode);
  const connect = useWalletStore((s) => s.connect);
  const disconnect = useWalletStore((s) => s.disconnect);
  const setDemoMode = useWalletStore((s) => s.setDemoMode);
  const switchChain = useWalletStore((s) => s.switchChain);
  const wrongNetwork = useWalletStore(selectWrongNetwork);

  const market = getMarket(symbol);
  const priceTone =
    tickDirection === "up" ? "text-long" : tickDirection === "down" ? "text-short" : "text-text-primary";
  const changeTone = ticker.priceChangePercent >= 0 ? "text-long" : "text-short";

  return (
    <header className="border-b border-line bg-bg-panel">
      <div className="flex items-stretch h-14">
        <div className="flex items-center gap-3 px-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-accent/20 border border-accent/40 flex items-center justify-center">
              <span className="text-accent text-[11px] font-bold">P</span>
            </div>
            <span className="text-sm font-semibold tracking-tight hidden sm:block">
              Perp Terminal
            </span>
          </div>

          <select
            aria-label="Select market"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as MarketSymbol)}
            className="bg-bg-raised border border-line rounded-md h-8 px-2 text-xs font-medium
                       text-text-primary focus:outline-none focus:border-accent/70 cursor-pointer"
          >
            {MARKETS.map((m) => (
              <option key={m.symbol} value={m.symbol}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center px-3 border-l border-line min-w-[140px]">
          <div className="flex flex-col justify-center">
            <span className="label">Mark</span>
            <span className={`num text-sm font-semibold ${priceTone}`}>
              {ticker.lastPrice > 0 ? formatPrice(ticker.lastPrice, market.priceDecimals) : "—"}
            </span>
          </div>
        </div>

        <Stat
          label="24h Change"
          value={ticker.lastPrice > 0 ? formatPercent(ticker.priceChangePercent) : "—"}
          tone={changeTone}
        />
        <Stat
          label="24h High"
          value={ticker.high24h > 0 ? formatPrice(ticker.high24h, market.priceDecimals) : "—"}
        />
        <Stat
          label="24h Low"
          value={ticker.low24h > 0 ? formatPrice(ticker.low24h, market.priceDecimals) : "—"}
        />
        <Stat
          label="24h Volume"
          value={ticker.volume24h > 0 ? formatCompact(ticker.volume24h) : "—"}
        />

        <div className="flex-1" />

        <div className="flex items-center gap-2 px-4">
          <ConnectionBadge />

          {demoMode && (
            <span className="hidden sm:inline-flex items-center h-6 px-2 rounded border border-accent/40 bg-accent/10 text-accent text-2xs font-medium">
              Demo
            </span>
          )}

          {wrongNetwork ? (
            <button className="btn bg-amber-500/90 text-black hover:bg-amber-400" onClick={switchChain}>
              Switch to {ACTIVE_CHAIN.name}
            </button>
          ) : status === "connected" ? (
            <button
              className="btn-ghost num"
              onClick={disconnect}
              title="Forget this account in the app. Revoke access from your wallet to fully disconnect."
            >
              {shortenAddress(address ?? "")}
            </button>
          ) : (
            <>
              {CONTRACTS_CONFIGURED && (
                <button
                  className="btn-ghost hidden sm:inline-flex"
                  onClick={() => setDemoMode(!demoMode)}
                >
                  {demoMode ? "Exit demo" : "Demo mode"}
                </button>
              )}
              <button className="btn-primary" onClick={connect} disabled={status === "connecting"}>
                {status === "connecting" ? "Connecting…" : "Connect wallet"}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
