"use client";

import { useEffect, useMemo, useState } from "react";
import { CONTRACTS_CONFIGURED, MAX_LEVERAGE, getMarket } from "@/lib/config";
import { formatPrice, formatUsd } from "@/lib/format";
import { useMarketStore } from "@/store/marketStore";
import type { TradingAccount } from "@/hooks/useTradingAccount";

const LEVERAGE_STEPS = [1, 2, 5, 10, 20];
const SIZE_PRESETS = [0.25, 0.5, 0.75, 1];

export function OrderEntry({
  account,
  markPrice,
  limitPrice,
}: {
  account: TradingAccount;
  markPrice: number;
  limitPrice: number | null;
}) {
  const symbol = useMarketStore((s) => s.symbol);
  const market = getMarket(symbol);

  const [side, setSide] = useState<"long" | "short">("long");
  const [leverage, setLeverage] = useState(5);
  const [marginInput, setMarginInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Clicking the book pre-fills an entry price; mark price is the fallback.
  const entryPrice = limitPrice ?? markPrice;

  const margin = Number(marginInput) || 0;
  const sizeUsd = margin * leverage;
  const positionQty = entryPrice > 0 ? sizeUsd / entryPrice : 0;

  const needsApproval =
    account.source === "chain" && CONTRACTS_CONFIGURED && account.allowance < margin;

  const liquidationPreview = useMemo(() => {
    if (margin <= 0 || sizeUsd <= 0 || entryPrice <= 0) return 0;
    const delta = (margin * 0.9 * entryPrice) / sizeUsd;
    return side === "long" ? Math.max(0, entryPrice - delta) : entryPrice + delta;
  }, [margin, sizeUsd, entryPrice, side]);

  const validation = useMemo(() => {
    if (account.blockedReason) return account.blockedReason;
    if (account.position.isOpen) return "Close your open position first";
    if (entryPrice <= 0) return "Waiting for a price";
    if (margin <= 0) return null;
    if (margin > account.freeCollateral) return "Not enough free collateral";
    return null;
  }, [account.blockedReason, account.position.isOpen, account.freeCollateral, margin, entryPrice]);

  const canSubmit = margin > 0 && !validation && !submitting;

  // Keyboard: B/S switch side, Enter submits. Trading UIs live on the keyboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.isContentEditable;

      if (!typing && (e.key === "b" || e.key === "B")) setSide("long");
      if (!typing && (e.key === "s" || e.key === "S")) setSide("short");
      if (e.key === "Enter" && canSubmit) {
        void submit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSubmit, margin, leverage, side, entryPrice]);

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const error = await account.open({
        isLong: side === "long",
        sizeUsd,
        margin,
        entryPrice,
      });
      if (error) setLocalError(error);
      else setMarginInput("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove() {
    setSubmitting(true);
    try {
      await account.approve();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel flex flex-col">
      <div className="panel-header">
        <span>Order Entry</span>
        <span className="normal-case tracking-normal text-text-muted">
          {account.source === "demo" ? "Simulated" : "On-chain"}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* Side */}
        <div className="grid grid-cols-2 gap-2">
          <button
            className={`btn h-9 border ${
              side === "long"
                ? "bg-long/90 text-white border-long"
                : "bg-bg-raised text-text-secondary border-line hover:bg-bg-hover"
            }`}
            onClick={() => setSide("long")}
          >
            Long <kbd className="ml-1 text-[9px] opacity-60">B</kbd>
          </button>
          <button
            className={`btn h-9 border ${
              side === "short"
                ? "bg-short/90 text-white border-short"
                : "bg-bg-raised text-text-secondary border-line hover:bg-bg-hover"
            }`}
            onClick={() => setSide("short")}
          >
            Short <kbd className="ml-1 text-[9px] opacity-60">S</kbd>
          </button>
        </div>

        {/* Entry price */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="label">Entry price</span>
            {limitPrice !== null && (
              <span className="text-2xs text-accent">from book</span>
            )}
          </div>
          <div className="field flex items-center justify-between cursor-default">
            <span>{entryPrice > 0 ? formatPrice(entryPrice, market.priceDecimals) : "—"}</span>
            <span className="text-2xs text-text-muted">USD</span>
          </div>
        </div>

        {/* Margin */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="label">Margin</span>
            <span className="text-2xs text-text-muted num">
              Free {formatUsd(account.freeCollateral)}
            </span>
          </div>
          <input
            className="field"
            inputMode="decimal"
            placeholder="0.00"
            value={marginInput}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*\.?\d*$/.test(v)) setMarginInput(v);
            }}
          />
          <div className="grid grid-cols-4 gap-1 pt-0.5">
            {SIZE_PRESETS.map((p) => (
              <button
                key={p}
                className="btn-ghost h-6 text-2xs"
                onClick={() =>
                  setMarginInput((account.freeCollateral * p).toFixed(2))
                }
              >
                {p === 1 ? "Max" : `${p * 100}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Leverage */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="label">Leverage</span>
            <span className="num text-xs text-text-primary">{leverage}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={MAX_LEVERAGE}
            step={1}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full accent-accent h-1 cursor-pointer"
            aria-label="Leverage"
          />
          <div className="grid grid-cols-5 gap-1">
            {LEVERAGE_STEPS.map((l) => (
              <button
                key={l}
                className={`btn h-6 text-2xs border ${
                  leverage === l
                    ? "bg-accent/20 border-accent/50 text-accent"
                    : "bg-bg-raised border-line text-text-muted hover:text-text-secondary"
                }`}
                onClick={() => setLeverage(l)}
              >
                {l}x
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-md bg-bg-raised/50 border border-line px-2.5 py-2 space-y-1">
          <Line label="Position size" value={formatUsd(sizeUsd)} />
          <Line
            label="Quantity"
            value={positionQty > 0 ? `${positionQty.toFixed(4)} ${market.label.split("-")[0]}` : "—"}
          />
          <Line
            label="Est. liquidation"
            value={liquidationPreview > 0 ? formatPrice(liquidationPreview, market.priceDecimals) : "—"}
            tone="text-amber-400"
          />
        </div>

        {(validation || localError) && (
          <p className="text-2xs text-amber-400">{localError ?? validation}</p>
        )}

        {needsApproval && margin > 0 ? (
          <button className="btn-primary w-full h-9" onClick={handleApprove} disabled={submitting}>
            Approve mUSDC
          </button>
        ) : (
          <button
            className={side === "long" ? "btn-long w-full" : "btn-short w-full"}
            onClick={submit}
            disabled={!canSubmit}
          >
            {submitting
              ? "Submitting…"
              : `${side === "long" ? "Long" : "Short"} ${market.label}`}
            <kbd className="ml-1 text-[9px] opacity-60">↵</kbd>
          </button>
        )}
      </div>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between text-2xs">
      <span className="text-text-muted">{label}</span>
      <span className={`num ${tone ?? "text-text-secondary"}`}>{value}</span>
    </div>
  );
}
