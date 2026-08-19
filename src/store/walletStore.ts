import { create } from "zustand";
import { CHAIN_ID } from "@/lib/config";
import { getBrowserProvider, hasInjectedWallet, humanizeError, switchToActiveChain } from "@/lib/ethereum";

type WalletStatus = "disconnected" | "connecting" | "connected";

interface WalletState {
  status: WalletStatus;
  address: string | null;
  chainId: number | null;
  error: string | null;

  /**
   * Demo mode renders the full terminal with a simulated account and no wallet.
   * A recruiter opening the deploy link should see a working product, not a
   * connect button — but nothing in demo mode ever touches the chain.
   */
  demoMode: boolean;

  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
  setDemoMode: (on: boolean) => void;
  hydrate: () => Promise<void>;
  _setAccount: (address: string | null) => void;
  _setChain: (chainId: number | null) => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  status: "disconnected",
  address: null,
  chainId: null,
  error: null,
  demoMode: false,

  connect: async () => {
    if (!hasInjectedWallet()) {
      set({
        error: "No wallet detected. Install MetaMask, or explore in demo mode.",
        demoMode: true,
      });
      return;
    }

    set({ status: "connecting", error: null });

    try {
      const provider = getBrowserProvider();
      const accounts: string[] = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();

      if (accounts.length === 0) {
        set({ status: "disconnected", error: "No accounts returned by wallet." });
        return;
      }

      set({
        status: "connected",
        address: accounts[0],
        chainId: Number(network.chainId),
        demoMode: false,
        error: null,
      });
    } catch (err) {
      set({ status: "disconnected", error: humanizeError(err) });
    }
  },

  disconnect: () => {
    // EIP-1193 has no programmatic disconnect; the app simply forgets the
    // account. The user revokes access from the wallet itself.
    set({ status: "disconnected", address: null, chainId: null, error: null });
  },

  switchChain: async () => {
    try {
      await switchToActiveChain();
      set({ chainId: CHAIN_ID, error: null });
    } catch (err) {
      set({ error: humanizeError(err) });
    }
  },

  setDemoMode: (on) => set({ demoMode: on, error: null }),

  /** Reconnect silently if the wallet is already authorised for this origin. */
  hydrate: async () => {
    if (!hasInjectedWallet()) return;
    try {
      const provider = getBrowserProvider();
      const accounts: string[] = await provider.send("eth_accounts", []);
      if (accounts.length === 0) return;
      const network = await provider.getNetwork();
      set({
        status: "connected",
        address: accounts[0],
        chainId: Number(network.chainId),
      });
    } catch {
      // A silent hydrate failure is not worth surfacing.
    }
  },

  _setAccount: (address) => {
    if (!address) {
      set({ status: "disconnected", address: null });
      return;
    }
    set({ status: "connected", address });
  },

  _setChain: (chainId) => set({ chainId }),
}));

export function selectWrongNetwork(state: WalletState): boolean {
  return state.status === "connected" && state.chainId !== null && state.chainId !== CHAIN_ID;
}
