"use client";

import { useState } from "react";
import { CONTRACTS_CONFIGURED } from "@/lib/config";
import { formatUsd } from "@/lib/format";
import type { TradingAccount } from "@/hooks/useTradingAccount";

export function AccountPanel({
  account,
  markPrice,
}: {
  account: TradingAccount;
  markPrice: number;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const value = account.accountValue(markPrice);
  const parsed = Number(amount) || 0;
  const needsApproval = account.source === "chain" && account.allowance < parsed;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      setAmount("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel flex flex-col">
      <div className="panel-header">
        <span>Account</span>
        <span className="normal-case tracking-normal text-text-muted">
          {account.source === "demo" ? "Simulated" : "On-chain"}
        </span>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Cell label="Account value" value={formatUsd(value)} />
          <Cell label="Free collateral" value={formatUsd(account.freeCollateral)} />
          {account.source === "chain" && (
            <Cell label="Wallet mUSDC" value={formatUsd(account.walletBalance)} />
          )}
          {account.source === "demo" && (
            <Cell
              label="Realized PnL"
              value={formatUsd(account.realizedPnl, true)}
              tone={account.realizedPnl >= 0 ? "text-long" : "text-short"}
            />
          )}
        </div>

        {account.source === "demo" ? (
          <button className="btn-ghost w-full" onClick={() => run(async () => account.faucet())}>
            Add 10,000 simulated mUSDC
          </button>
        ) : !CONTRACTS_CONFIGURED ? (
          <p className="text-2xs text-text-muted">
            No contract addresses configured. Deploy with{" "}
            <code className="text-accent">npm run deploy:baseSepolia</code> and fill in
            .env.local.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                className="field flex-1"
                inputMode="decimal"
                placeholder="Amount"
                value={amount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
                }}
              />
              {needsApproval && parsed > 0 ? (
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => run(async () => account.approve())}
                >
                  Approve
                </button>
              ) : (
                <button
                  className="btn-primary"
                  disabled={busy || parsed <= 0}
                  onClick={() => run(async () => account.deposit(parsed))}
                >
                  Deposit
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-ghost"
                disabled={busy}
                onClick={() => run(async () => account.faucet())}
              >
                Faucet
              </button>
              <button
                className="btn-ghost"
                disabled={busy || parsed <= 0}
                onClick={() => run(async () => account.withdraw(parsed))}
              >
                Withdraw
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className={`num text-xs ${tone ?? "text-text-primary"}`}>{value}</span>
    </div>
  );
}
