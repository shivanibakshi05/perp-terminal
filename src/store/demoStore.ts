import { create } from "zustand";
import { EMPTY_POSITION, type PositionView } from "@/lib/types";
import { MAX_LEVERAGE } from "@/lib/config";

interface DemoState {
  freeCollateral: number;
  position: PositionView;
  realizedPnl: number;
  history: {
    id: number;
    side: "long" | "short";
    sizeUsd: number;
    entry: number;
    exit: number;
    pnl: number;
    closedAt: number;
  }[];

  deposit: (amount: number) => void;
  open: (isLong: boolean, sizeUsd: number, margin: number, entryPrice: number) => string | null;
  close: (exitPrice: number) => void;
  reset: () => void;
}

const STARTING_BALANCE = 10_000;

/**
 * Demo mode mirrors the contract's arithmetic exactly (same PnL formula, same
 * 20x cap, same 90% maintenance threshold) so the simulated experience and the
 * on-chain one behave identically. If the numbers ever diverge, one of the two
 * is wrong — which makes this a cheap sanity check on the Solidity.
 */
function computeLiquidationPrice(p: PositionView): number {
  if (!p.isOpen || p.sizeUsd === 0) return 0;
  const delta = (p.margin * 0.9 * p.entryPrice) / p.sizeUsd;
  return p.isLong ? Math.max(0, p.entryPrice - delta) : p.entryPrice + delta;
}

export function computePnl(p: PositionView, markPrice: number): number {
  if (!p.isOpen || p.entryPrice === 0) return 0;
  const diff = markPrice - p.entryPrice;
  const signed = p.isLong ? diff : -diff;
  return (p.sizeUsd * signed) / p.entryPrice;
}

let historyId = 0;

export const useDemoStore = create<DemoState>((set, get) => ({
  freeCollateral: STARTING_BALANCE,
  position: EMPTY_POSITION,
  realizedPnl: 0,
  history: [],

  deposit: (amount) => set((s) => ({ freeCollateral: s.freeCollateral + amount })),

  open: (isLong, sizeUsd, margin, entryPrice) => {
    const state = get();
    if (state.position.isOpen) return "You already have an open position";
    if (margin <= 0 || sizeUsd <= 0) return "Enter a size";
    if (margin > state.freeCollateral) return "Not enough free collateral";
    if (sizeUsd > margin * MAX_LEVERAGE) return `Leverage exceeds ${MAX_LEVERAGE}x`;
    if (entryPrice <= 0) return "Waiting for a price";

    const position: PositionView = {
      isOpen: true,
      isLong,
      sizeUsd,
      entryPrice,
      margin,
      openedAt: Date.now(),
      liquidationPrice: 0,
    };
    position.liquidationPrice = computeLiquidationPrice(position);

    set({ freeCollateral: state.freeCollateral - margin, position });
    return null;
  },

  close: (exitPrice) => {
    const state = get();
    const p = state.position;
    if (!p.isOpen) return;

    const pnl = computePnl(p, exitPrice);
    const payout = Math.max(0, p.margin + pnl);

    historyId += 1;
    set({
      freeCollateral: state.freeCollateral + payout,
      position: EMPTY_POSITION,
      realizedPnl: state.realizedPnl + pnl,
      history: [
        {
          id: historyId,
          side: (p.isLong ? "long" : "short") as "long" | "short",
          sizeUsd: p.sizeUsd,
          entry: p.entryPrice,
          exit: exitPrice,
          pnl,
          closedAt: Date.now(),
        },
        ...state.history,
      ].slice(0, 20),
    });
  },

  reset: () =>
    set({
      freeCollateral: STARTING_BALANCE,
      position: EMPTY_POSITION,
      realizedPnl: 0,
      history: [],
    }),
}));
