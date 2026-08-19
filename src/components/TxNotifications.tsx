"use client";

import { useEffect } from "react";
import { explorerTxUrl } from "@/lib/config";
import { shortenAddress } from "@/lib/format";
import { useTxStore } from "@/store/txStore";
import type { TxStage } from "@/lib/types";

const STAGE_COPY: Record<TxStage, { label: string; tone: string; dot: string }> = {
  idle: { label: "Idle", tone: "text-text-muted", dot: "bg-text-muted" },
  signing: { label: "Waiting for signature", tone: "text-amber-400", dot: "bg-amber-400 animate-pulse" },
  pending: { label: "Pending", tone: "text-accent", dot: "bg-accent animate-pulse" },
  confirmed: { label: "Confirmed", tone: "text-long", dot: "bg-long" },
  failed: { label: "Failed", tone: "text-short", dot: "bg-short" },
};

/**
 * Every transaction gets a card that distinguishes "your wallet is asking you
 * to sign" from "it's on the network, waiting for a block". The explorer link
 * appears as soon as a hash exists rather than after confirmation.
 */
export function TxNotifications() {
  const items = useTxStore((s) => s.items);
  const dismiss = useTxStore((s) => s.dismiss);

  // Auto-dismiss settled transactions; leave failures up until acknowledged.
  useEffect(() => {
    const confirmed = items.filter((t) => t.stage === "confirmed");
    if (confirmed.length === 0) return;
    const timers = confirmed.map((t) => setTimeout(() => dismiss(t.id), 6_000));
    return () => timers.forEach(clearTimeout);
  }, [items, dismiss]);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[280px]">
      {items.map((t) => {
        const copy = STAGE_COPY[t.stage];
        const url = t.hash ? explorerTxUrl(t.hash) : "";
        return (
          <div
            key={t.id}
            className="panel bg-bg-raised px-3 py-2.5 shadow-lg shadow-black/40"
            role="status"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${copy.dot}`} />
                <span className="text-xs font-medium truncate">{t.label}</span>
              </div>
              <button
                className="text-text-muted hover:text-text-primary text-xs leading-none shrink-0"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>

            <div className="mt-1 flex items-center justify-between gap-2 pl-3.5">
              <span className={`text-2xs ${copy.tone}`}>
                {t.stage === "failed" && t.error ? t.error : copy.label}
              </span>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-2xs num text-accent hover:underline shrink-0"
                >
                  {shortenAddress(t.hash!, 4)} ↗
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
