"use client";

import { useEffect } from "react";
import { marketFeed } from "@/lib/marketFeed";
import { useMarketStore } from "@/store/marketStore";

/** Opens the feed for the active symbol and tears it down on unmount. */
export function useMarketFeed() {
  const symbol = useMarketStore((s) => s.symbol);

  useEffect(() => {
    marketFeed.connect(symbol);
    return () => marketFeed.disconnect();
  }, [symbol]);

  useEffect(() => {
    // A tab returning to the foreground after a long sleep usually has a dead
    // socket that never fired `onclose`. Force a reconnect on visibility.
    function onVisible() {
      if (document.visibilityState === "visible") {
        marketFeed.connect(useMarketStore.getState().symbol);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}
