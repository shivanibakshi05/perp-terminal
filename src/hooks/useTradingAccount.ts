"use client";

import { useCallback, useMemo } from "react";
import { CONTRACTS_CONFIGURED } from "@/lib/config";
import { EMPTY_POSITION, type PositionView } from "@/lib/types";
import { computePnl, useDemoStore } from "@/store/demoStore";
import { useAccountStore } from "@/store/accountStore";
import { useWalletStore, selectWrongNetwork } from "@/store/walletStore";
import {
  approveCollateral,
  claimFaucet,
  closePositionOnChain,
  depositCollateral,
  openPositionOnChain,
  withdrawCollateral,
} from "@/lib/actions";

export interface TradingAccount {
  source: "demo" | "chain";
  ready: boolean;
  blockedReason: string | null;

  walletBalance: number;
  freeCollateral: number;
  allowance: number;
  position: PositionView;
  realizedPnl: number;

  unrealizedPnl: (markPrice: number) => number;
  accountValue: (markPrice: number) => number;

  deposit: (amount: number) => Promise<void>;
  withdraw: (amount: number) => Promise<void>;
  approve: (amount?: number) => Promise<void>;
  faucet: () => Promise<void>;
  open: (params: {
    isLong: boolean;
    sizeUsd: number;
    margin: number;
    entryPrice: number;
  }) => Promise<string | null>;
  close: (exitPrice: number) => Promise<void>;
}

/**
 * One interface over two very different backends — a simulated demo account and
 * a real contract. Components never branch on which is active, which is what
 * keeps demo mode from becoming a second, drifting implementation of the UI.
 */
export function useTradingAccount(): TradingAccount {
  const demoMode = useWalletStore((s) => s.demoMode);
  const status = useWalletStore((s) => s.status);
  const wrongNetwork = useWalletStore(selectWrongNetwork);

  const demo = useDemoStore();

  const chainFree = useAccountStore((s) => s.freeCollateral);
  const chainWallet = useAccountStore((s) => s.walletBalance);
  const chainAllowance = useAccountStore((s) => s.allowance);
  const chainPosition = useAccountStore((s) => s.position);
  const optimistic = useAccountStore((s) => s.optimisticPosition);

  const isDemo = demoMode || !CONTRACTS_CONFIGURED;

  const position = isDemo ? demo.position : (optimistic ?? chainPosition);

  const blockedReason = useMemo(() => {
    if (isDemo) return null;
    if (status !== "connected") return "Connect a wallet to trade";
    if (wrongNetwork) return "Wrong network";
    return null;
  }, [isDemo, status, wrongNetwork]);

  const unrealizedPnl = useCallback(
    (markPrice: number) => computePnl(position, markPrice),
    [position]
  );

  const accountValue = useCallback(
    (markPrice: number) => {
      const free = isDemo ? demo.freeCollateral : chainFree;
      if (!position.isOpen) return free;
      return Math.max(0, free + position.margin + computePnl(position, markPrice));
    },
    [isDemo, demo.freeCollateral, chainFree, position]
  );

  const deposit = useCallback(
    async (amount: number) => {
      if (isDemo) {
        demo.deposit(amount);
        return;
      }
      await depositCollateral(amount);
    },
    [isDemo, demo]
  );

  const withdraw = useCallback(
    async (amount: number) => {
      if (isDemo) return;
      await withdrawCollateral(amount);
    },
    [isDemo]
  );

  const approve = useCallback(
    async (amount?: number) => {
      if (isDemo) return;
      await approveCollateral(amount);
    },
    [isDemo]
  );

  const faucet = useCallback(async () => {
    if (isDemo) {
      demo.deposit(10_000);
      return;
    }
    await claimFaucet();
  }, [isDemo, demo]);

  const open = useCallback(
    async (params: { isLong: boolean; sizeUsd: number; margin: number; entryPrice: number }) => {
      if (isDemo) {
        return demo.open(params.isLong, params.sizeUsd, params.margin, params.entryPrice);
      }
      const ok = await openPositionOnChain(params);
      return ok ? null : "Transaction failed";
    },
    [isDemo, demo]
  );

  const close = useCallback(
    async (exitPrice: number) => {
      if (isDemo) {
        demo.close(exitPrice);
        return;
      }
      await closePositionOnChain(exitPrice);
    },
    [isDemo, demo]
  );

  return {
    source: isDemo ? "demo" : "chain",
    ready: blockedReason === null,
    blockedReason,

    walletBalance: isDemo ? 0 : chainWallet,
    freeCollateral: isDemo ? demo.freeCollateral : chainFree,
    allowance: isDemo ? Number.MAX_SAFE_INTEGER : chainAllowance,
    position: position ?? EMPTY_POSITION,
    realizedPnl: isDemo ? demo.realizedPnl : 0,

    unrealizedPnl,
    accountValue,

    deposit,
    withdraw,
    approve,
    faucet,
    open,
    close,
  };
}
