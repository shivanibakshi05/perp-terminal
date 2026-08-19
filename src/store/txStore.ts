import { create } from "zustand";
import type { TxStage, TxState } from "@/lib/types";

interface TxStore {
  items: TxState[];
  start: (id: string, label: string) => void;
  update: (id: string, patch: Partial<Omit<TxState, "id">>) => void;
  dismiss: (id: string) => void;
  clearSettled: () => void;
}

/**
 * Transaction lifecycle: idle -> signing -> pending -> confirmed | failed.
 *
 * Keeping this as an explicit state machine (rather than a boolean `isLoading`)
 * is what lets the UI distinguish "waiting for the user to sign" from "sent,
 * waiting for a block" — two very different things to a trader, and the
 * distinction most portfolio dApps collapse into one spinner.
 */
export const useTxStore = create<TxStore>((set) => ({
  items: [],

  start: (id, label) =>
    set((s) => ({
      items: [
        { id, label, stage: "signing" as TxStage, createdAt: Date.now() },
        ...s.items.filter((t) => t.id !== id),
      ].slice(0, 6),
    })),

  update: (id, patch) =>
    set((s) => ({
      items: s.items.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),

  clearSettled: () =>
    set((s) => ({
      items: s.items.filter((t) => t.stage === "signing" || t.stage === "pending"),
    })),
}));

let counter = 0;
export function nextTxId(): string {
  counter += 1;
  return `tx-${counter}`;
}
