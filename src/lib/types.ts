export type ConnectionStatus = "idle" | "connecting" | "live" | "stale" | "reconnecting" | "error";

export interface BookLevel {
  price: number;
  size: number;
  /** Cumulative size from the top of book, used for the depth bars. */
  total: number;
}

export interface Trade {
  id: number;
  price: number;
  qty: number;
  time: number;
  isBuyerMaker: boolean;
}

export interface Candle {
  time: number; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Ticker {
  lastPrice: number;
  priceChangePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

export type TxStage = "idle" | "signing" | "pending" | "confirmed" | "failed";

export interface TxState {
  id: string;
  label: string;
  stage: TxStage;
  hash?: string;
  error?: string;
  createdAt: number;
}

export interface PositionView {
  isOpen: boolean;
  isLong: boolean;
  sizeUsd: number;
  entryPrice: number;
  margin: number;
  openedAt: number;
  liquidationPrice: number;
}

export const EMPTY_POSITION: PositionView = {
  isOpen: false,
  isLong: true,
  sizeUsd: 0,
  entryPrice: 0,
  margin: 0,
  openedAt: 0,
  liquidationPrice: 0,
};
