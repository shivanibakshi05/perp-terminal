"use client";

import { useMarketStore } from "@/store/marketStore";
import type { ConnectionStatus } from "@/lib/types";

const COPY: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
  idle: { label: "Idle", dot: "bg-text-muted", text: "text-text-muted" },
  connecting: { label: "Connecting", dot: "bg-amber-400 animate-pulse", text: "text-amber-400" },
  live: { label: "Live", dot: "bg-long", text: "text-long" },
  stale: { label: "Stale", dot: "bg-amber-400 animate-pulse", text: "text-amber-400" },
  reconnecting: { label: "Reconnecting", dot: "bg-amber-400 animate-pulse", text: "text-amber-400" },
  error: { label: "Disconnected", dot: "bg-short", text: "text-short" },
};

/**
 * Feed state is a first-class piece of UI, not a debug affordance. A trader
 * acting on a frozen book is the failure mode this component exists to prevent.
 */
export function ConnectionBadge() {
  const status = useMarketStore((s) => s.status);
  const retryCount = useMarketStore((s) => s.retryCount);
  const synthetic = useMarketStore((s) => s.synthetic);

  const copy = COPY[status];
  const suffix =
    status === "reconnecting" && retryCount > 0 ? ` (${retryCount})` : "";

  // Never let a simulated price masquerade as a live one.
  if (synthetic) {
    return (
      <div
        className="flex items-center gap-1.5 text-2xs font-medium"
        title="The exchange feed is unreachable from this network. Prices are generated locally."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <span className="text-amber-400">Simulated feed</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 text-2xs font-medium"
      title={
        status === "stale"
          ? "The socket is open but has not delivered data recently."
          : "Market data feed status"
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${copy.dot}`} />
      <span className={copy.text}>
        {copy.label}
        {suffix}
      </span>
    </div>
  );
}
