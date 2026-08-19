export const MARKETS = [
  { symbol: "BTCUSDT", label: "BTC-PERP", tickSize: 0.1, priceDecimals: 1, seedPrice: 68_000, tickVol: 12 },
  { symbol: "ETHUSDT", label: "ETH-PERP", tickSize: 0.01, priceDecimals: 2, seedPrice: 3_500, tickVol: 1.2 },
  { symbol: "SOLUSDT", label: "SOL-PERP", tickSize: 0.01, priceDecimals: 2, seedPrice: 170, tickVol: 0.12 },
] as const;

export type Market = (typeof MARKETS)[number];
export type MarketSymbol = Market["symbol"];

export const DEFAULT_MARKET: MarketSymbol = "BTCUSDT";

export function getMarket(symbol: string): Market {
  return MARKETS.find((m) => m.symbol === symbol) ?? MARKETS[0];
}

/** Chain the contracts are deployed to. */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);

export const CHAIN_METADATA: Record<
  number,
  { name: string; explorer: string; currency: string; rpc: string }
> = {
  84532: {
    name: "Base Sepolia",
    explorer: "https://sepolia.basescan.org",
    currency: "ETH",
    rpc: "https://sepolia.base.org",
  },
  421614: {
    name: "Arbitrum Sepolia",
    explorer: "https://sepolia.arbiscan.io",
    currency: "ETH",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
  },
  31337: {
    name: "Localhost",
    explorer: "",
    currency: "ETH",
    rpc: "http://127.0.0.1:8545",
  },
};

export const ACTIVE_CHAIN = CHAIN_METADATA[CHAIN_ID] ?? CHAIN_METADATA[84532];

export const PERP_ADDRESS = process.env.NEXT_PUBLIC_PERP_ADDRESS ?? "";
export const COLLATERAL_ADDRESS = process.env.NEXT_PUBLIC_COLLATERAL_ADDRESS ?? "";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? ACTIVE_CHAIN.rpc;

export const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE ?? "wss://stream.binance.com:9443/ws";
export const REST_BASE = process.env.NEXT_PUBLIC_REST_BASE ?? "https://api.binance.com";

/** Contracts deployed? If not, the app runs in demo mode only. */
export const CONTRACTS_CONFIGURED = Boolean(PERP_ADDRESS && COLLATERAL_ADDRESS);

/** On-chain unit scales. Mirrors the constants in MiniPerp.sol. */
export const COLLATERAL_DECIMALS = 6;
export const PRICE_DECIMALS = 8;
export const MAX_LEVERAGE = 20;

export function explorerTxUrl(hash: string): string {
  if (!ACTIVE_CHAIN.explorer) return "";
  return `${ACTIVE_CHAIN.explorer}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  if (!ACTIVE_CHAIN.explorer) return "";
  return `${ACTIVE_CHAIN.explorer}/address/${address}`;
}
