import type { BarColumn } from "./barSeries";
import {
  BAR_WINDOW,
  profileFromBars,
  type EighteenBarProfile,
  type EmaBarRelation,
} from "./eighteenBarProfile";
import { analyzeOpeningBars, type OhlcBar } from "./openingBarsBrooks";
import type { AssetKind } from "../fmp/symbols";
import type { LwCandle } from "../fmp/types";

export type OhlcCandle = LwCandle;

const CHART_HEIGHT = 100;

function priceToY(price: number, minP: number, maxP: number): number {
  const span = Math.max(1e-9, maxP - minP);
  return ((maxP - price) / span) * CHART_HEIGHT;
}

/** Map real OHLC → image-style BarColumn (y grows down, up-trend = falling y). */
export function ohlcToBarColumns(candles: OhlcCandle[]): BarColumn[] {
  if (!candles.length) return [];
  const minP = Math.min(...candles.map((c) => c.low));
  const maxP = Math.max(...candles.map((c) => c.high));

  return candles.map((c, i) => {
    const highY = priceToY(c.high, minP, maxP);
    const lowY = priceToY(c.low, minP, maxP);
    const openY = priceToY(c.open, minP, maxP);
    const closeY = priceToY(c.close, minP, maxP);
    const isBull = c.close >= c.open;
    const bodyTop = Math.min(openY, closeY);
    const bodyBot = Math.max(openY, closeY);
    const range = Math.max(0.5, lowY - highY);
    const body = Math.max(0.1, bodyBot - bodyTop);
    return {
      x: i,
      high: highY,
      low: lowY,
      open: openY,
      close: closeY,
      isBull,
      range,
      body,
      upperTail: Math.max(0, bodyTop - highY),
      lowerTail: Math.max(0, lowY - bodyBot),
      valid: true,
    };
  });
}

export function ema20(closes: number[]): number[] {
  if (!closes.length) return [];
  const k = 2 / 21;
  let prev = closes[0]!;
  return closes.map((c, i) => {
    prev = i === 0 ? c : c * k + prev * (1 - k);
    return prev;
  });
}

export function emaRelationsFromOhlc(candles: OhlcCandle[]): EmaBarRelation[] {
  const closes = candles.map((c) => c.close);
  const ema = ema20(closes);
  return candles.map((c, i) => {
    const range = Math.max(1e-9, c.high - c.low);
    const diff = c.close - ema[i]!;
    if (Math.abs(diff) <= range * 0.08) return "cross";
    return c.close > ema[i]! ? "above" : "below";
  });
}

/** Real FMP OHLC — never normalized chart Y. */
export function candlesToOhlc(candles: OhlcCandle[]): OhlcBar[] {
  return candles.map((c) => ({
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

export function profileFromOhlc(
  candles: OhlcCandle[],
  window = BAR_WINDOW,
): EighteenBarProfile {
  const bars = ohlcToBarColumns(candles);
  const ema = emaRelationsFromOhlc(candles);
  const profile = profileFromBars(bars, CHART_HEIGHT, window, ema);
  // Brooks 指标/叙事必须用真实价格；BarColumn 只是 0–100 像素 Y，不能反算报价
  if (candles.length >= 6) {
    profile.brooks = analyzeOpeningBars(candlesToOhlc(candles), { mode: "live_ohlc" });
  }
  return profile;
}

export function etDateKey(unixSec: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unixSec * 1000));
}

function etMinutesOfDay(unixSec: number): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(unixSec * 1000));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

export type SessionDay = {
  dateKey: string;
  label: string;
  candles: OhlcCandle[];
};

export function groupCandlesByEtDay(candles: OhlcCandle[]): SessionDay[] {
  const map = new Map<string, OhlcCandle[]>();
  for (const c of candles) {
    const k = etDateKey(c.time as number);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(c);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateKey, cs]) => ({
      dateKey,
      label: dateKey,
      candles: [...cs].sort((a, b) => (a.time as number) - (b.time as number)),
    }));
}

export type SessionPickMode = "day_open" | "rth_open" | "custom";

/** Pick N consecutive bars from a session day (1-based startBar). */
export function pickSessionBars(
  day: SessionDay,
  count: number,
  mode: SessionPickMode,
  assetKind: AssetKind,
  startBar = 1,
): OhlcCandle[] {
  let bars = day.candles;
  if (mode === "rth_open" || (mode === "day_open" && assetKind === "stock")) {
    const rthMin = 9 * 60 + 30;
    const rth = bars.filter((c) => etMinutesOfDay(c.time as number) >= rthMin);
    if (rth.length >= Math.min(count, 6)) bars = rth;
  }
  const idx = mode === "custom" ? Math.max(0, startBar - 1) : 0;
  return bars.slice(idx, idx + count);
}

export function formatOhlcExport(candles: OhlcCandle[]): string {
  return JSON.stringify(
    candles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })),
    null,
    2,
  );
}
