"use client";

import { useEffect } from "react";
import { CONTRACTS_CONFIGURED } from "@/lib/config";
import { useAccountStore } from "@/store/accountStore";
import { useWalletStore } from "@/store/walletStore";
import { useTxStore } from "@/store/txStore";

const POLL_INTERVAL_MS = 12_000;

/**
 * Keeps on-chain account state fresh.
 *
 * Polling rather than event subscriptions on purpose: public testnet RPCs
 * throttle or drop `eth_subscribe`, and a 12s poll on four view calls is
 * cheaper than a filter that silently stops firing. Transactions trigger an
 * immediate resync so the UI never waits a full interval after a confirmation.
 */
export function useAccountSync() {
  const address = useWalletStore((s) => s.address);
  const demoMode = useWalletStore((s) => s.demoMode);
  const sync = useAccountStore((s) => s.sync);

  useEffect(() => {
    if (demoMode || !address || !CONTRACTS_CONFIGURED) return;

    sync(address);
    const id = setInterval(() => sync(address), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [address, demoMode, sync]);

  // Resync the moment anything confirms.
  useEffect(() => {
    if (demoMode || !address) return;
    return useTxStore.subscribe((state, prev) => {
      const justConfirmed = state.items.some(
        (t) =>
          t.stage === "confirmed" &&
          prev.items.find((p) => p.id === t.id)?.stage !== "confirmed"
      );
      if (justConfirmed) sync(address);
    });
  }, [address, demoMode, sync]);
}
