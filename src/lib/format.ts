/**
 * Formatting helpers for a trading UI.
 *
 * Rule that matters here: numbers must never change width as they tick, or the
 * whole layout jitters. Everything below returns a fixed number of decimals and
 * is rendered with `tabular-nums`.
 */

const usdFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatUsd(value: number, withSign = false): string {
  if (!Number.isFinite(value)) return "—";
  const sign = withSign && value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${usdFormatter.format(Math.abs(value))}`;
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

export function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toFixed(1);
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

/** Bigint (1e6 collateral units) -> number. */
export function fromCollateral(value: bigint): number {
  return Number(value) / 1e6;
}

/** Number -> bigint in 1e6 collateral units, truncated (never round up funds). */
export function toCollateral(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return 0n;
  return BigInt(Math.floor(value * 1e6));
}

/** Bigint (1e8 price units) -> number. */
export function fromPrice(value: bigint): number {
  return Number(value) / 1e8;
}

/** Number -> bigint in 1e8 price units. */
export function toPrice(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return 0n;
  return BigInt(Math.round(value * 1e8));
}
