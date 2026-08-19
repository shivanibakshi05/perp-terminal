"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { marketFeed } from "@/lib/marketFeed";
import { useMarketStore } from "@/store/marketStore";
import { getMarket } from "@/lib/config";

/**
 * The chart owns its own canvas and never re-renders through React.
 *
 * Candle updates arrive straight from the feed via `marketFeed.onCandle` and go
 * into `series.update()`. Routing 1/sec candle ticks through component state
 * would re-render the whole panel for a pixel change — this is the same
 * "keep the hot path out of React" idea as the rAF batching in the feed, just
 * applied to a library that already has its own render loop.
 */
export function PriceChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const symbol = useMarketStore((s) => s.symbol);
  const market = getMarket(symbol);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#5F6D82",
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      },
      grid: {
        vertLines: { color: "rgba(34, 43, 56, 0.6)" },
        horzLines: { color: "rgba(34, 43, 56, 0.6)" },
      },
      rightPriceScale: { borderColor: "#222B38" },
      timeScale: { borderColor: "#222B38", timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#3A4757", width: 1, style: 3, labelBackgroundColor: "#1D2430" },
        horzLine: { color: "#3A4757", width: 1, style: 3, labelBackgroundColor: "#1D2430" },
      },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
      autoSize: true,
    });

    const series = chart.addCandlestickSeries({
      upColor: "#12B981",
      downColor: "#F2555A",
      borderUpColor: "#12B981",
      borderDownColor: "#F2555A",
      wickUpColor: "#12B981",
      wickDownColor: "#F2555A",
      priceFormat: {
        type: "price",
        precision: market.priceDecimals,
        minMove: market.tickSize,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    let cancelled = false;

    marketFeed.fetchCandles(symbol).then((candles) => {
      if (cancelled || candles.length === 0) return;
      series.setData(
        candles.map((c) => ({
          time: c.time as never,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
      chart.timeScale().fitContent();
    });

    const unsubscribe = marketFeed.onCandle((candle) => {
      seriesRef.current?.update({
        time: candle.time as never,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [symbol, market.priceDecimals, market.tickSize]);

  return (
    <div className="panel flex-1 flex flex-col min-h-0">
      <div className="panel-header">
        <span>{market.label} · 1m</span>
      </div>
      <div ref={containerRef} className="flex-1 min-h-[240px]" />
    </div>
  );
}
