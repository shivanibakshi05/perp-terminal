"use client";

import { useEffect } from "react";
import { hasInjectedWallet } from "@/lib/ethereum";
import { useWalletStore } from "@/store/walletStore";
import { useAccountStore } from "@/store/accountStore";

/**
 * EIP-1193 account/chain change handling.
 *
 * Skipping this is the single most common bug in portfolio dApps: the user
 * switches accounts in MetaMask, the UI keeps showing the old account's
 * balances, and the next transaction silently comes from someone else.
 */
export function useWalletEvents() {
  useEffect(() => {
    useWalletStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!hasInjectedWallet()) return;
    const ethereum = window.ethereum!;
    if (!ethereum.on) return;

    const onAccountsChanged = (...args: never[]) => {
      const accounts = args[0] as unknown as string[];
      const next = accounts?.[0] ?? null;
      useAccountStore.getState().reset();
      useWalletStore.getState()._setAccount(next);
    };

    const onChainChanged = (...args: never[]) => {
      const chainIdHex = args[0] as unknown as string;
      useAccountStore.getState().reset();
      useWalletStore.getState()._setChain(Number(chainIdHex));
    };

    ethereum.on("accountsChanged", onAccountsChanged);
    ethereum.on("chainChanged", onChainChanged);

    return () => {
      ethereum.removeListener?.("accountsChanged", onAccountsChanged);
      ethereum.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);
}
