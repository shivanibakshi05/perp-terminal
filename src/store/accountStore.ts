import { create } from "zustand";
import { EMPTY_POSITION, type PositionView } from "@/lib/types";
import { fromCollateral, fromPrice } from "@/lib/format";
import { PERP_ADDRESS, CONTRACTS_CONFIGURED } from "@/lib/config";
import { readCollateral, readPerp } from "@/lib/ethereum";

interface AccountState {
  loading: boolean;
  lastSyncAt: number;
  error: string | null;

  walletBalance: number; // mUSDC in wallet
  freeCollateral: number; // deposited, unencumbered
  allowance: number; // mUSDC approved to the vault
  position: PositionView;

  /**
   * Optimistic overlay. Applied immediately on submit so the UI responds at
   * click speed, then discarded once `sync()` reads the confirmed on-chain
   * state back. The chain is always the source of truth — this is a display
   * shortcut with an explicit reconciliation point, not a second state store.
   */
  optimisticPosition: PositionView | null;

  sync: (address: string | null) => Promise<void>;
  setOptimisticPosition: (position: PositionView | null) => void;
  reset: () => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  loading: false,
  lastSyncAt: 0,
  error: null,

  walletBalance: 0,
  freeCollateral: 0,
  allowance: 0,
  position: EMPTY_POSITION,
  optimisticPosition: null,

  sync: async (address) => {
    if (!address || !CONTRACTS_CONFIGURED) return;

    set({ loading: true });
    try {
      const [perp, token] = await Promise.all([readPerp(), readCollateral()]);

      const [rawFree, rawPosition, rawLiq, rawBalance, rawAllowance] = await Promise.all([
        perp.freeCollateral(address) as Promise<bigint>,
        perp.getPosition(address) as Promise<{
          sizeUsd: bigint;
          entryPrice: bigint;
          margin: bigint;
          isLong: boolean;
          isOpen: boolean;
          openedAt: bigint;
        }>,
        perp.liquidationPrice(address) as Promise<bigint>,
        token.balanceOf(address) as Promise<bigint>,
        token.allowance(address, PERP_ADDRESS) as Promise<bigint>,
      ]);

      const position: PositionView = rawPosition.isOpen
        ? {
            isOpen: true,
            isLong: rawPosition.isLong,
            sizeUsd: fromCollateral(rawPosition.sizeUsd),
            entryPrice: fromPrice(rawPosition.entryPrice),
            margin: fromCollateral(rawPosition.margin),
            openedAt: Number(rawPosition.openedAt) * 1000,
            liquidationPrice: fromPrice(rawLiq),
          }
        : EMPTY_POSITION;

      set({
        loading: false,
        lastSyncAt: Date.now(),
        error: null,
        freeCollateral: fromCollateral(rawFree),
        walletBalance: fromCollateral(rawBalance),
        allowance: fromCollateral(rawAllowance),
        position,
        // Confirmed read supersedes the optimistic guess.
        optimisticPosition: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to read account state",
      });
    }
  },

  setOptimisticPosition: (position) => set({ optimisticPosition: position }),

  reset: () =>
    set({
      walletBalance: 0,
      freeCollateral: 0,
      allowance: 0,
      position: EMPTY_POSITION,
      optimisticPosition: null,
      lastSyncAt: 0,
      error: null,
    }),
}));
