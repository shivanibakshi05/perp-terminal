"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { PriceChart } from "@/components/PriceChart";
import { OrderBook } from "@/components/OrderBook";
import { TradeTape } from "@/components/TradeTape";
import { OrderEntry } from "@/components/OrderEntry";
import { PositionPanel } from "@/components/PositionPanel";
import { AccountPanel } from "@/components/AccountPanel";
import { TxNotifications } from "@/components/TxNotifications";
import { useMarketFeed } from "@/hooks/useMarketFeed";
import { useWalletEvents } from "@/hooks/useWalletEvents";
import { useAccountSync } from "@/hooks/useAccountSync";
import { useTradingAccount } from "@/hooks/useTradingAccount";
import { selectMarkPrice, useMarketStore } from "@/store/marketStore";
import { useWalletStore } from "@/store/walletStore";
import { CONTRACTS_CONFIGURED } from "@/lib/config";

export function Terminal() {
  useMarketFeed();
  useWalletEvents();
  useAccountSync();

  const account = useTradingAccount();
  const markPrice = useMarketStore(selectMarkPrice);
  const symbol = useMarketStore((s) => s.symbol);
  const synthetic = useMarketStore((s) => s.synthetic);

  const walletStatus = useWalletStore((s) => s.status);
  const demoMode = useWalletStore((s) => s.demoMode);
  const setDemoMode = useWalletStore((s) => s.setDemoMode);

  const [limitPrice, setLimitPrice] = useState<number | null>(null);

  // A price picked from the book belongs to that book — clear it on switch.
  useEffect(() => setLimitPrice(null), [symbol]);

  // No wallet and no contracts? Start in demo mode so the page is never a
  // dead-end "Connect wallet" screen for someone just looking.
  useEffect(() => {
    if (!CONTRACTS_CONFIGURED && !demoMode) setDemoMode(true);
  }, [demoMode, setDemoMode]);

  return (
    <div className="h-screen flex flex-col bg-bg-base">
      <Header />

      {account.source === "demo" && (
        <div className="px-4 py-1.5 bg-accent/10 border-b border-accent/20 flex items-center justify-between gap-3">
          <p className="text-2xs text-accent">
            Demo mode — simulated account, no wallet or gas required.
            {synthetic
              ? " Exchange feed unreachable, so prices are generated locally."
              : " Market data is live."}
          </p>
          {walletStatus !== "connected" && CONTRACTS_CONFIGURED && (
            <button
              className="text-2xs text-accent hover:underline shrink-0"
              onClick={() => setDemoMode(false)}
            >
              Trade on-chain instead
            </button>
          )}
        </div>
      )}

      <main className="flex-1 min-h-0 p-2 grid gap-2 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px_300px] grid-rows-[minmax(0,1fr)_auto] lg:grid-rows-[minmax(0,1fr)_240px]">
        {/* Chart */}
        <div className="flex flex-col min-h-0 lg:row-span-1">
          <PriceChart />
        </div>

        {/* Book */}
        <div className="flex flex-col min-h-0 lg:row-span-2">
          <OrderBook onPriceClick={setLimitPrice} />
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-2 min-h-0 lg:row-span-2 overflow-y-auto">
          <OrderEntry account={account} markPrice={markPrice} limitPrice={limitPrice} />
          <AccountPanel account={account} markPrice={markPrice} />
        </div>

        {/* Bottom left: position + tape */}
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] gap-2 min-h-0">
          <PositionPanel account={account} markPrice={markPrice} />
          <TradeTape />
        </div>
      </main>

      <TxNotifications />
    </div>
  );
}
