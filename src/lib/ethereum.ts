import { BrowserProvider, Contract, JsonRpcProvider, type Eip1193Provider } from "ethers";
import { ACTIVE_CHAIN, CHAIN_ID, COLLATERAL_ADDRESS, PERP_ADDRESS, RPC_URL } from "@/lib/config";
import { ERC20_ABI, MINI_PERP_ABI } from "@/lib/abis";

/**
 * ethers v6 access layer.
 *
 * Two provider paths on purpose:
 *  - `getReadProvider()` is a plain JSON-RPC provider. It needs no wallet, which
 *    is what makes read-only demo mode work for a visitor with no extension.
 *  - `getBrowserProvider()` wraps the injected EIP-1193 provider and is only
 *    used when the user has actually connected.
 */

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      on?: (event: string, handler: (...args: never[]) => void) => void;
      removeListener?: (event: string, handler: (...args: never[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

let readProvider: JsonRpcProvider | null = null;

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export function getReadProvider(): JsonRpcProvider {
  if (!readProvider) {
    // staticNetwork avoids an eth_chainId round trip on every single call.
    readProvider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
  }
  return readProvider;
}

export function getBrowserProvider(): BrowserProvider {
  if (!hasInjectedWallet()) {
    throw new Error("No wallet detected. Install MetaMask or use demo mode.");
  }
  return new BrowserProvider(window.ethereum as Eip1193Provider);
}

export async function getSigner() {
  const provider = getBrowserProvider();
  return provider.getSigner();
}

// ---------------------------------------------------------------------------
// Contract factories
// ---------------------------------------------------------------------------

export function perpContract(runner: BrowserProvider | JsonRpcProvider | Awaited<ReturnType<typeof getSigner>>) {
  return new Contract(PERP_ADDRESS, MINI_PERP_ABI as unknown as string[], runner);
}

export function collateralContract(runner: BrowserProvider | JsonRpcProvider | Awaited<ReturnType<typeof getSigner>>) {
  return new Contract(COLLATERAL_ADDRESS, ERC20_ABI as unknown as string[], runner);
}

export async function readPerp() {
  return perpContract(getReadProvider());
}

export async function readCollateral() {
  return collateralContract(getReadProvider());
}

export async function writePerp() {
  return perpContract(await getSigner());
}

export async function writeCollateral() {
  return collateralContract(await getSigner());
}

// ---------------------------------------------------------------------------
// Chain management
// ---------------------------------------------------------------------------

export function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

/**
 * Ask the wallet to switch networks, adding the chain first if the wallet has
 * never seen it (error 4902).
 */
export async function switchToActiveChain(): Promise<void> {
  if (!hasInjectedWallet()) throw new Error("No wallet detected.");
  const ethereum = window.ethereum!;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHexChainId(CHAIN_ID) }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: toHexChainId(CHAIN_ID),
            chainName: ACTIVE_CHAIN.name,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [ACTIVE_CHAIN.rpc],
            blockExplorerUrls: ACTIVE_CHAIN.explorer ? [ACTIVE_CHAIN.explorer] : [],
          },
        ],
      });
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Error normalisation
// ---------------------------------------------------------------------------

const USER_REJECTED = new Set([4001, "ACTION_REJECTED"]);

/**
 * Wallet errors are wildly inconsistent between providers. Normalise them into
 * something a person can read, because "could not coalesce error" on a trading
 * screen is worse than useless.
 */
export function humanizeError(err: unknown): string {
  if (!err) return "Unknown error";

  const e = err as {
    code?: number | string;
    shortMessage?: string;
    reason?: string;
    message?: string;
    info?: { error?: { message?: string } };
  };

  if (e.code !== undefined && USER_REJECTED.has(e.code)) {
    return "Rejected in wallet";
  }

  const revert = e.reason ?? e.shortMessage;
  if (revert) {
    // Map contract custom errors to plain language.
    if (revert.includes("InsufficientFreeCollateral")) return "Not enough free collateral";
    if (revert.includes("PositionAlreadyOpen")) return "You already have an open position";
    if (revert.includes("NoOpenPosition")) return "No open position to close";
    if (revert.includes("LeverageTooHigh")) return "Leverage exceeds the 20x maximum";
    if (revert.includes("InsufficientAllowance")) return "Token approval too low";
    if (revert.includes("FaucetCooldown")) return "Faucet is on cooldown — try again in an hour";
    return revert;
  }

  const nested = e.info?.error?.message;
  if (nested) return nested;

  return e.message ?? "Transaction failed";
}
