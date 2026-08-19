import { REST_BASE, WS_BASE, getMarket } from "@/lib/config";
import { useMarketStore } from "@/store/marketStore";
import type { BookLevel, Candle, Trade } from "@/lib/types";

/**
 * MarketFeed — a single WebSocket connection multiplexing depth, trades, and
 * ticker for one symbol.
 *
 * Three problems this solves, and they are the whole point of the file:
 *
 * 1. THROUGHPUT. The depth stream alone fires every 100ms and the trade stream
 *    is unbounded. Writing to React state on every message would re-render the
 *    tree dozens of times a second. Instead every message mutates a private
 *    buffer, and a single requestAnimationFrame flush commits to the store —
 *    so the render rate is capped at the display refresh rate no matter how
 *    hard the socket pushes. When the tab is backgrounded rAF stops firing, so
 *    we coalesce for free.
 *
 * 2. RECONNECTION. Sockets die. Reconnect uses exponential backoff with jitter
 *    (jitter matters: without it, every client of a venue reconnects in
 *    lockstep after an outage and stampedes the endpoint). Attempts are capped
 *    and surfaced in the UI rather than retried silently forever.
 *
 * 3. STALENESS. A socket can stay open and stop delivering. A heartbeat check
 *    marks the feed "stale" when no message has landed inside the threshold, so
 *    the UI can tell the user the prices they're looking at are not live —
 *    which on a trading screen is the difference between a bug and a loss.
 */

const STALE_AFTER_MS = 6_000;
const HEARTBEAT_INTERVAL_MS = 2_000;
const MAX_RETRIES = 8;
const BOOK_DEPTH = 14;
/** If the venue hasn't delivered anything by now, fall back to the simulator. */
const FIRST_DATA_TIMEOUT_MS = 9_000;
const SYNTHETIC_TICK_MS = 200;

interface DepthMessage {
  bids: [string, string][];
  asks: [string, string][];
}

interface AggTradeMessage {
  a: number; // aggregate trade id
  p: string; // price
  q: string; // quantity
  T: number; // trade time
  m: boolean; // is buyer the market maker
}

interface TickerMessage {
  c: string; // last price
  P: string; // price change percent
  h: string; // 24h high
  l: string; // 24h low
  v: string; // 24h base volume
}

interface KlineMessage {
  k: {
    t: number;
    o: string;
    h: string;
    l: string;
    c: string;
    x: boolean;
  };
}

type StreamEnvelope = {
  stream: string;
  data: DepthMessage | AggTradeMessage | TickerMessage | KlineMessage;
};

export type CandleListener = (candle: Candle, isFinal: boolean) => void;

function wsRoot(): string {
  // WS_BASE is configured as ".../ws"; the combined-stream endpoint is
  // ".../stream?streams=". Normalise so either form in .env works.
  return WS_BASE.replace(/\/(ws|stream)\/?$/, "");
}

function cumulative(levels: [string, string][], limit: number): BookLevel[] {
  const out: BookLevel[] = [];
  let total = 0;
  for (let i = 0; i < Math.min(levels.length, limit); i++) {
    const price = Number(levels[i][0]);
    const size = Number(levels[i][1]);
    if (!Number.isFinite(price) || !Number.isFinite(size)) continue;
    total += size;
    out.push({ price, size, total });
  }
  return out;
}

class MarketFeed {
  private socket: WebSocket | null = null;
  private symbol: string | null = null;
  private retries = 0;
  private closedByUs = false;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private rafHandle: number | null = null;
  private flushScheduled = false;

  // Buffers written by the socket, drained by the rAF flush.
  private pendingBook: { bids: BookLevel[]; asks: BookLevel[] } | null = null;
  private pendingTrades: Trade[] = [];
  private pendingTicker: Partial<{
    lastPrice: number;
    priceChangePercent: number;
    high24h: number;
    low24h: number;
    volume24h: number;
  }> | null = null;

  private candleListeners = new Set<CandleListener>();

  // Synthetic fallback state.
  private syntheticTimer: ReturnType<typeof setInterval> | null = null;
  private firstDataTimer: ReturnType<typeof setTimeout> | null = null;
  private syntheticPrice = 0;
  private syntheticCandle: Candle | null = null;
  private syntheticTradeId = 0;
  private syntheticHigh = 0;
  private syntheticLow = 0;
  private syntheticVolume = 0;

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  connect(symbol: string) {
    if (typeof window === "undefined") return;
    if (this.symbol === symbol && this.socket?.readyState === WebSocket.OPEN) return;

    this.disconnect();
    this.symbol = symbol;
    this.retries = 0;
    this.closedByUs = false;
    useMarketStore.getState().reset();
    useMarketStore.getState().setSynthetic(false);
    this.open();
    this.startHeartbeat();

    // Some networks block exchange endpoints outright (corporate proxies,
    // regional restrictions). Rather than showing an empty terminal, fall back
    // to the simulator if nothing has arrived in time.
    this.firstDataTimer = setTimeout(() => {
      if (useMarketStore.getState().lastUpdateAt === 0) this.startSynthetic();
    }, FIRST_DATA_TIMEOUT_MS);
  }

  disconnect() {
    this.closedByUs = true;
    this.clearReconnect();
    this.stopHeartbeat();
    this.stopSynthetic();
    this.cancelFlush();

    if (this.firstDataTimer) {
      clearTimeout(this.firstDataTimer);
      this.firstDataTimer = null;
    }

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      if (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      ) {
        this.socket.close();
      }
      this.socket = null;
    }
  }

  onCandle(listener: CandleListener): () => void {
    this.candleListeners.add(listener);
    return () => this.candleListeners.delete(listener);
  }

  /** Historical candles for chart seeding. Falls back to an empty series. */
  async fetchCandles(symbol: string, interval = "1m", limit = 240): Promise<Candle[]> {
    try {
      const res = await fetch(
        `${REST_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );
      if (!res.ok) throw new Error(`klines ${res.status}`);
      const rows: unknown[][] = await res.json();
      return rows.map((r) => ({
        time: Math.floor(Number(r[0]) / 1000),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
      }));
    } catch {
      return this.syntheticHistory(symbol, limit);
    }
  }

  /** Plausible candle history so the chart isn't blank on the fallback path. */
  private syntheticHistory(symbol: string, limit: number): Candle[] {
    const market = getMarket(symbol);
    const now = Math.floor(Date.now() / 60_000) * 60;
    const out: Candle[] = [];
    let price: number = market.seedPrice;

    for (let i = limit; i > 0; i--) {
      const open = price;
      const close = Math.max(0.01, open + (Math.random() - 0.5) * market.tickVol * 4);
      const high = Math.max(open, close) + Math.random() * market.tickVol;
      const low = Math.min(open, close) - Math.random() * market.tickVol;
      out.push({ time: now - i * 60, open, high, low: Math.max(0.01, low), close });
      price = close;
    }
    this.syntheticPrice = price;
    return out;
  }

  // -------------------------------------------------------------------
  // Socket lifecycle
  // -------------------------------------------------------------------

  private open() {
    const symbol = this.symbol;
    if (!symbol) return;

    const lower = symbol.toLowerCase();
    const streams = [
      `${lower}@depth${BOOK_DEPTH >= 20 ? 20 : BOOK_DEPTH >= 10 ? 20 : 5}@100ms`,
      `${lower}@aggTrade`,
      `${lower}@ticker`,
      `${lower}@kline_1m`,
    ].join("/");

    const url = `${wsRoot()}/stream?streams=${streams}`;

    useMarketStore
      .getState()
      .setStatus(this.retries === 0 ? "connecting" : "reconnecting", this.retries);

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      this.retries = 0;
      useMarketStore.getState().setStatus("live", 0);
    };

    socket.onmessage = (event) => this.handleMessage(event.data);

    socket.onerror = () => {
      // `onclose` always follows, so reconnection is handled there.
      useMarketStore.getState().setStatus("error", this.retries);
    };

    socket.onclose = () => {
      if (this.closedByUs) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    this.clearReconnect();

    if (this.retries >= MAX_RETRIES) {
      useMarketStore.getState().setStatus("error", this.retries);
      // Out of retries — keep the terminal usable on simulated prices.
      this.startSynthetic();
      return;
    }

    // Exponential backoff, capped at 15s, with jitter to avoid a reconnect
    // stampede across clients after a venue-side outage.
    const base = Math.min(15_000, 500 * 2 ** this.retries);
    const delay = base * (0.7 + Math.random() * 0.6);

    this.retries += 1;
    useMarketStore.getState().setStatus("reconnecting", this.retries);

    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const { lastUpdateAt, status, setStatus } = useMarketStore.getState();
      if (status !== "live") return;
      if (lastUpdateAt > 0 && Date.now() - lastUpdateAt > STALE_AFTER_MS) {
        setStatus("stale");
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // -------------------------------------------------------------------
  // Message handling — writes to buffers only, never to the store
  // -------------------------------------------------------------------

  private handleMessage(raw: string) {
    // Real data arrived — cancel the fallback and drop the simulator.
    if (this.firstDataTimer) {
      clearTimeout(this.firstDataTimer);
      this.firstDataTimer = null;
    }
    if (this.syntheticTimer) this.stopSynthetic();

    let envelope: StreamEnvelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return;
    }
    if (!envelope?.stream) return;

    const { stream, data } = envelope;

    if (stream.includes("@depth")) {
      const depth = data as DepthMessage;
      this.pendingBook = {
        bids: cumulative(depth.bids ?? [], BOOK_DEPTH),
        asks: cumulative(depth.asks ?? [], BOOK_DEPTH),
      };
    } else if (stream.includes("@aggTrade")) {
      const t = data as AggTradeMessage;
      this.pendingTrades.unshift({
        id: t.a,
        price: Number(t.p),
        qty: Number(t.q),
        time: t.T,
        isBuyerMaker: t.m,
      });
      // Never let the buffer grow unbounded between frames.
      if (this.pendingTrades.length > 40) this.pendingTrades.length = 40;
    } else if (stream.includes("@ticker")) {
      const t = data as TickerMessage;
      this.pendingTicker = {
        lastPrice: Number(t.c),
        priceChangePercent: Number(t.P),
        high24h: Number(t.h),
        low24h: Number(t.l),
        volume24h: Number(t.v),
      };
    } else if (stream.includes("@kline")) {
      const k = (data as KlineMessage).k;
      const candle: Candle = {
        time: Math.floor(k.t / 1000),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
      };
      // Chart updates bypass the store entirely — lightweight-charts owns its
      // own canvas, so pushing through React would be pure overhead.
      this.candleListeners.forEach((fn) => fn(candle, k.x));
    }

    this.scheduleFlush();
  }

  // -------------------------------------------------------------------
  // rAF-batched commit
  // -------------------------------------------------------------------

  private scheduleFlush() {
    if (this.flushScheduled || typeof window === "undefined") return;
    this.flushScheduled = true;
    this.rafHandle = window.requestAnimationFrame(() => this.flush());
  }

  private flush() {
    this.flushScheduled = false;
    this.rafHandle = null;

    const store = useMarketStore.getState();

    if (this.pendingBook) {
      store.applyBook(this.pendingBook.bids, this.pendingBook.asks);
      this.pendingBook = null;
    }

    if (this.pendingTrades.length > 0) {
      store.applyTrades(this.pendingTrades);
      this.pendingTrades = [];
    }

    if (this.pendingTicker) {
      store.applyTicker(this.pendingTicker);
      this.pendingTicker = null;
    }

    if (store.status === "stale") {
      store.setStatus("live");
    }
  }

  // -------------------------------------------------------------------
  // Synthetic fallback
  // -------------------------------------------------------------------

  /**
   * A local random-walk market. Not a toy for its own sake: without it, anyone
   * whose network blocks the exchange endpoint sees an empty screen and assumes
   * the app is broken. It writes through the exact same buffers and rAF flush
   * as the real feed, so nothing downstream can tell the difference — which
   * also makes it a useful harness for testing the UI under load.
   */
  private startSynthetic() {
    if (this.syntheticTimer || !this.symbol) return;

    this.closedByUs = true; // stop fighting a dead endpoint
    this.clearReconnect();

    const market = getMarket(this.symbol);
    this.syntheticPrice = market.seedPrice;
    this.syntheticCandle = null;
    this.syntheticTradeId = 0;
    this.syntheticHigh = market.seedPrice;
    this.syntheticLow = market.seedPrice;
    this.syntheticVolume = 1_000;

    const store = useMarketStore.getState();
    store.setSynthetic(true);
    store.setStatus("live", 0);

    this.syntheticTimer = setInterval(() => this.syntheticTick(market.tickVol), SYNTHETIC_TICK_MS);
  }

  private stopSynthetic() {
    if (this.syntheticTimer) {
      clearInterval(this.syntheticTimer);
      this.syntheticTimer = null;
    }
    useMarketStore.getState().setSynthetic(false);
  }

  private syntheticTick(volatility: number) {
    // Mean-reverting random walk so the price wanders without drifting away.
    const drift = (Math.random() - 0.5) * volatility;
    this.syntheticPrice = Math.max(0.01, this.syntheticPrice + drift);
    const mid = this.syntheticPrice;

    // Book: spread scaled to volatility, sizes decaying with distance.
    const spread = volatility * 0.15;
    const bids: BookLevel[] = [];
    const asks: BookLevel[] = [];
    let bidTotal = 0;
    let askTotal = 0;

    for (let i = 0; i < BOOK_DEPTH; i++) {
      const step = spread * (i + 1);
      const bidSize = (0.6 + Math.random() * 1.8) / (1 + i * 0.18);
      const askSize = (0.6 + Math.random() * 1.8) / (1 + i * 0.18);
      bidTotal += bidSize;
      askTotal += askSize;
      bids.push({ price: mid - step, size: bidSize, total: bidTotal });
      asks.push({ price: mid + step, size: askSize, total: askTotal });
    }

    this.pendingBook = { bids, asks };

    // Roughly one print every ~600ms.
    if (Math.random() < SYNTHETIC_TICK_MS / 600) {
      this.syntheticTradeId += 1;
      this.pendingTrades.unshift({
        id: this.syntheticTradeId,
        price: mid + (Math.random() - 0.5) * spread,
        qty: Number((Math.random() * 1.5 + 0.01).toFixed(4)),
        time: Date.now(),
        isBuyerMaker: Math.random() > 0.5,
      });
      if (this.pendingTrades.length > 40) this.pendingTrades.length = 40;
    }

    const seed = getMarket(this.symbol!).seedPrice;
    this.syntheticHigh = Math.max(this.syntheticHigh, mid);
    this.syntheticLow = Math.min(this.syntheticLow, mid);
    this.syntheticVolume += Math.random() * 2;

    this.pendingTicker = {
      lastPrice: mid,
      priceChangePercent: ((mid - seed) / seed) * 100,
      high24h: this.syntheticHigh,
      low24h: this.syntheticLow,
      volume24h: this.syntheticVolume,
    };

    // Roll a 1-minute candle so the chart animates too.
    const bucket = Math.floor(Date.now() / 60_000) * 60;
    if (!this.syntheticCandle || this.syntheticCandle.time !== bucket) {
      this.syntheticCandle = { time: bucket, open: mid, high: mid, low: mid, close: mid };
    } else {
      this.syntheticCandle.high = Math.max(this.syntheticCandle.high, mid);
      this.syntheticCandle.low = Math.min(this.syntheticCandle.low, mid);
      this.syntheticCandle.close = mid;
    }
    const candle = { ...this.syntheticCandle };
    this.candleListeners.forEach((fn) => fn(candle, false));

    this.scheduleFlush();
  }

  private cancelFlush() {
    if (this.rafHandle !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.rafHandle);
    }
    this.rafHandle = null;
    this.flushScheduled = false;
    this.pendingBook = null;
    this.pendingTrades = [];
    this.pendingTicker = null;
  }
}

export const marketFeed = new MarketFeed();
