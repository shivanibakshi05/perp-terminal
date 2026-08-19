import { create } from "zustand";
import { DEFAULT_MARKET, type MarketSymbol } from "@/lib/config";
import type { BookLevel, ConnectionStatus, Ticker, Trade } from "@/lib/types";

interface MarketState {
  symbol: MarketSymbol;
  status: ConnectionStatus;
  /** Consecutive failed connection attempts — surfaced in the UI. */
  retryCount: number;
  lastUpdateAt: number;
  /** True when prices come from the local simulator, not a real venue. */
  synthetic: boolean;

  bids: BookLevel[];
  asks: BookLevel[];
  trades: Trade[];
  ticker: Ticker;

  /** Direction of the most recent price change, for tick colouring. */
  tickDirection: "up" | "down" | "flat";

  setSymbol: (symbol: MarketSymbol) => void;
  setStatus: (status: ConnectionStatus, retryCount?: number) => void;
  setSynthetic: (synthetic: boolean) => void;
  applyBook: (bids: BookLevel[], asks: BookLevel[]) => void;
  applyTrades: (trades: Trade[]) => void;
  applyTicker: (ticker: Partial<Ticker>) => void;
  reset: () => void;
}

const EMPTY_TICKER: Ticker = {
  lastPrice: 0,
  priceChangePercent: 0,
  high24h: 0,
  low24h: 0,
  volume24h: 0,
};

export const useMarketStore = create<MarketState>((set, get) => ({
  symbol: DEFAULT_MARKET,
  status: "idle",
  retryCount: 0,
  lastUpdateAt: 0,
  synthetic: false,

  bids: [],
  asks: [],
  trades: [],
  ticker: EMPTY_TICKER,
  tickDirection: "flat",

  setSymbol: (symbol) => set({ symbol }),

  setStatus: (status, retryCount) =>
    set((s) => ({ status, retryCount: retryCount ?? s.retryCount })),

  setSynthetic: (synthetic) => set({ synthetic }),

  applyBook: (bids, asks) => set({ bids, asks, lastUpdateAt: Date.now() }),

  applyTrades: (incoming) => {
    if (incoming.length === 0) return;
    const merged = [...incoming, ...get().trades].slice(0, 40);
    set({ trades: merged, lastUpdateAt: Date.now() });
  },

  applyTicker: (partial) => {
    const prev = get().ticker;
    const next = { ...prev, ...partial };
    let tickDirection: "up" | "down" | "flat" = get().tickDirection;
    if (partial.lastPrice !== undefined && prev.lastPrice > 0) {
      if (partial.lastPrice > prev.lastPrice) tickDirection = "up";
      else if (partial.lastPrice < prev.lastPrice) tickDirection = "down";
    }
    set({ ticker: next, tickDirection, lastUpdateAt: Date.now() });
  },

  reset: () =>
    set({
      bids: [],
      asks: [],
      trades: [],
      ticker: EMPTY_TICKER,
      tickDirection: "flat",
      lastUpdateAt: 0,
    }),
}));

/** Mid price, falling back to last trade when the book is empty. */
export function selectMarkPrice(state: MarketState): number {
  const bestBid = state.bids[0]?.price ?? 0;
  const bestAsk = state.asks[0]?.price ?? 0;
  if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2;
  return state.ticker.lastPrice;
}
