import type { UTCTimestamp } from "lightweight-charts";

/** FMP intraday chart interval query param */
export type FmpChartInterval = "1min" | "5min" | "15min" | "30min" | "1hour" | "4hour";

export type FmpIntradayRow = {
  date: string;
  open: number;
  low: number;
  high: number;
  close: number;
  volume: number;
};

export type FmpQuote = {
  symbol: string;
  name: string;
  price: number;
  changePercentage: number;
  change: number;
  volume: number;
  dayLow: number;
  dayHigh: number;
  open: number;
  previousClose: number;
  timestamp: number;
};

export type LwCandle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type StreamStatus =
  | "idle"
  | "connecting"
  | "live"
  | "polling"
  | "paused"
  | "error"
  | "closed";

export type FmpTradeTick = {
  symbol: string;
  price: number;
  size: number;
  /** Unix seconds */
  time: number;
};

export const INTERVAL_MINUTES: Record<FmpChartInterval, number> = {
  "1min": 1,
  "5min": 5,
  "15min": 15,
  "30min": 30,
  "1hour": 60,
  "4hour": 240,
};

export const CHART_INTERVAL_OPTIONS: { value: FmpChartInterval; label: string }[] = [
  { value: "1min", label: "1 分钟" },
  { value: "5min", label: "5 分钟" },
  { value: "15min", label: "15 分钟" },
  { value: "30min", label: "30 分钟" },
  { value: "1hour", label: "1 小时" },
  { value: "4hour", label: "4 小时" },
];
