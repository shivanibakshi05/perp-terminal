"use client";

import dynamic from "next/dynamic";

/**
 * The terminal is client-only: it owns a WebSocket, a canvas chart, and an
 * injected-wallet provider, none of which have a meaningful server render.
 * Loading it dynamically with `ssr: false` also sidesteps hydration mismatches
 * from wallet detection, which differs between server and browser by definition.
 */
const Terminal = dynamic(() => import("@/components/Terminal").then((m) => m.Terminal), {
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center bg-bg-base">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-accent/20 border border-accent/40 animate-pulse" />
        <p className="text-xs text-text-muted">Loading terminal…</p>
      </div>
    </div>
  ),
});

export default function Page() {
  return <Terminal />;
}
