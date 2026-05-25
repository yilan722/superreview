import { extractBarSeries, validBars, type BarColumn } from "./barSeries";
import type { ChartTheme } from "./chartPixels";
import { isEmaLine, classifyPixel, detectTheme } from "./chartPixels";
import { detectPatternsFromImageData, type DetectedPattern, type PatternId } from "./patternDetect";
import {
  extractNarrativePhases,
  phaseSignature,
  type NarrativePhase,
} from "./narrativePhases";
import { analyzeSlidePage, type SlidePageKind } from "./slidePageType";
import { detectSlideScale, SCALE_LABEL, type SlideScale } from "./slideScale";

export type BrooksSetup =
  | "bull_trend_ail"
  | "bear_trend"
  | "bear_spike_then_range"
  | "bull_spike_then_range"
  | "bear_breakout"
  | "bull_breakout"
  | "trading_range"
  | "channel"
  | "mixed"
  | "unknown";

export type AlwaysIn = "long" | "short" | "neutral";

export interface BrooksFingerprint {
  setup: BrooksSetup;
  setupLabel: string;
  alwaysIn: AlwaysIn;
  scale: SlideScale;
  scaleLabel: string;
  direction: "up" | "down" | "sideways";
  overlap: number;
  aboveEma: number;
  crossEma: number;
  bearSpike: number;
  bullSpike: number;
  trStrength: number;
  ailStrength: number;
  bullRatio: number;
  bearRatio: number;
  barCount: number;
  patterns: DetectedPattern[];
  patternIds: PatternId[];
  searchTerms: string[];
  /** 分阶段叙事（棒 1–N） */
  phases: NarrativePhase[];
  phaseSig: string;
  chartScore: number;
  slideKind: SlidePageKind;
}

function linregSlope(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function columnEmaPrice(data: ImageData, theme: ChartTheme) {
  const { width, height, data: px } = data;
  const prices: number[] = [];
  const emas: (number | null)[] = [];
  let above = 0;
  let cross = 0;
  let emaN = 0;
  let bull = 0;
  let bear = 0;

  for (let x = 0; x < width; x++) {
    let py = 0;
    let pw = 0;
    let ey = 0;
    let ew = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (isEmaLine(r, g, b)) {
        ey += y;
        ew++;
        continue;
      }
      const kind = classifyPixel(r, g, b, theme);
      if (kind === "bull") bull++;
      else if (kind === "bear") bear++;
      if (kind === "skip") continue;
      py += y;
      pw++;
    }
    if (pw > 0) prices.push(py / pw);
    else prices.push(NaN);
    emas.push(ew > 0 ? ey / ew : null);
    if (pw > 0 && emas[x] != null) {
      emaN++;
      if (prices[x]! > emas[x]!) above++;
      if (Math.abs(prices[x]! - emas[x]!) / height < 0.06) cross++;
    }
  }

  const body = bull + bear + 1e-6;
  return {
    prices: prices.filter((p) => !Number.isNaN(p)),
    aboveEma: emaN > 0 ? above / emaN : 0.5,
    crossEma: emaN > 0 ? cross / emaN : 0,
    bullRatio: bull / body,
    bearRatio: bear / body,
  };
}

function segmentOverlap(bars: BarColumn[], from: number, to: number): number {
  const seg = bars.slice(from, to).filter((b) => b.valid);
  if (seg.length < 2) return 0;
  let o = 0;
  for (let i = 1; i < seg.length; i++) {
    if (Math.abs(seg[i].close - seg[i - 1].close) < seg[i].range * 0.35) o++;
  }
  return o / (seg.length - 1);
}

function bigTrendBarShare(
  bars: BarColumn[],
  medRange: number,
  bull: boolean,
): number {
  const seg = bars.filter((b) => b.valid && b.isBull === bull);
  if (!seg.length) return 0;
  let big = 0;
  for (const b of seg) {
    if (b.range > medRange * 1.4) big++;
  }
  return big / seg.length;
}

const SETUP_LABEL: Record<BrooksSetup, string> = {
  bull_trend_ail: "多头趋势 / Always In Long",
  bear_trend: "空头趋势 / Always In Short",
  bear_spike_then_range: "熊市尖峰 → 交易区间",
  bull_spike_then_range: "牛市尖峰 → 交易区间",
  bear_breakout: "熊市突破",
  bull_breakout: "牛市突破",
  trading_range: "交易区间",
  channel: "通道",
  mixed: "混合行情",
  unknown: "未识别 setup",
};

const SETUP_SEARCH: Record<BrooksSetup, string[]> = {
  bull_trend_ail: ["Always In Long", "Bull trend", "Buy pullback"],
  bear_trend: ["Always In Short", "Bear trend", "Sell rally"],
  bear_spike_then_range: [
    "Bear spike",
    "Trading range",
    "Bear breakout",
    "Sell climax",
    "Tight TR",
  ],
  bull_spike_then_range: ["Bull spike", "Trading range", "Bull breakout"],
  bear_breakout: ["Bear breakout", "Bear trend from the open"],
  bull_breakout: ["Bull breakout", "Bull trend from the open"],
  trading_range: ["Trading range", "Tight TR", "Barb wire"],
  channel: ["Channel", "Spike and channel"],
  mixed: ["Trading range", "Breakout"],
  unknown: [],
};

export function extractBrooksFingerprint(data: ImageData): BrooksFingerprint {
  const theme = detectTheme(data);
  const series = extractBarSeries(data);
  const bars = validBars(series);
  const n = bars.length;
  const scale = detectSlideScale(data);
  const scaleLabel = SCALE_LABEL[scale];

  const { prices, aboveEma, crossEma, bullRatio, bearRatio } = columnEmaPrice(
    data,
    theme,
  );

  let overlap = 0;
  for (let i = 1; i < prices.length; i++) {
    if (Math.abs(prices[i] - prices[i - 1]) < series.height * 0.018) overlap++;
  }
  overlap /= Math.max(1, prices.length - 1);

  const slope = linregSlope(prices);
  const third = Math.max(1, Math.floor(n / 3));
  const early = bars.slice(0, third * 2);
  const late = bars.slice(-third * 2);
  const medRange =
    bars.filter((b) => b.valid).reduce((s, b) => s + b.range, 0) /
      Math.max(1, bars.filter((b) => b.valid).length) || series.height * 0.05;

  const earlySlope = linregSlope(early.map((b) => b.close));
  const lateSlope = linregSlope(late.map((b) => b.close));
  const lateOverlap = segmentOverlap(bars, n - third * 2, n);
  const earlyBigBear = bigTrendBarShare(early, medRange, false);
  const earlyBigBull = bigTrendBarShare(early, medRange, true);

  const norm = medRange;
  const bearSpike = Math.min(
    1,
    earlyBigBear * 2 + (earlySlope > norm * 0.12 ? 0.45 : 0),
  );
  const bullSpike = Math.min(
    1,
    earlyBigBull * 2 + (earlySlope < -norm * 0.12 ? 0.45 : 0),
  );
  const trStrength = Math.min(
    1,
    lateOverlap * 1.2 + crossEma * 0.8 + (Math.abs(lateSlope) < norm * 0.08 ? 0.25 : 0),
  );

  const bearTrendLike =
    slope > norm * 0.06 &&
    aboveEma < 0.42 &&
    overlap < 0.5 &&
    bearRatio > 0.52;
  const bullTrendLike =
    slope < -norm * 0.06 &&
    aboveEma > 0.58 &&
    overlap < 0.5 &&
    bullRatio > 0.52;

  const ailStrength = Math.min(
    1,
    (scale === "macro" ? 0.5 : 0) +
      (aboveEma > 0.68 && overlap < 0.42 && bullRatio > 0.5 ? 0.55 : 0) +
      (bullTrendLike ? 0.35 : 0) +
      (slope < -norm * 0.05 && crossEma < 0.25 ? 0.2 : 0),
  );

  let earlyAbove = aboveEma;
  let lateAbove = aboveEma;
  const { patterns } = detectPatternsFromImageData(data, {
    aboveEma,
    earlyAbove,
    lateAbove,
  });
  const patternIds = patterns
    .filter((p) => p.strength >= 0.45)
    .map((p) => p.id);

  let setup: BrooksSetup = "unknown";
  if (scale === "macro" && ailStrength > 0.45) {
    setup = "bull_trend_ail";
  } else if (ailStrength > 0.65 && crossEma < 0.28) {
    setup = "bull_trend_ail";
  } else if (bearSpike > 0.55 && trStrength > 0.45) {
    setup = "bear_spike_then_range";
  } else if (bullSpike > 0.55 && trStrength > 0.45) {
    setup = "bull_spike_then_range";
  } else if (
    crossEma > 0.35 &&
    overlap > 0.52 &&
    trStrength > 0.4
  ) {
    setup = "trading_range";
  } else if (bearTrendLike && lateSlope > norm * 0.08 && aboveEma < 0.4) {
    setup = "bear_breakout";
  } else if (bullTrendLike && lateSlope < -norm * 0.08 && aboveEma > 0.6) {
    setup = "bull_breakout";
  } else if (bearTrendLike) {
    setup = "bear_trend";
  } else if (bullTrendLike) {
    setup = "bull_trend_ail";
  } else {
    setup = "mixed";
  }

  let alwaysIn: AlwaysIn = "neutral";
  if (setup === "bull_trend_ail" || setup === "bull_breakout") alwaysIn = "long";
  else if (
    setup === "bear_trend" ||
    setup === "bear_breakout" ||
    setup === "bear_spike_then_range"
  ) {
    alwaysIn = "short";
  } else if (aboveEma > 0.58 && bullRatio > 0.54) alwaysIn = "long";
  else if (aboveEma < 0.42 && bearRatio > 0.54) alwaysIn = "short";

  let direction: BrooksFingerprint["direction"] = "sideways";
  if (slope > norm * 0.08) direction = "down";
  else if (slope < -norm * 0.08) direction = "up";

  const phases = extractNarrativePhases(bars, series.height);
  const phaseSig = phaseSignature(phases);
  const page = analyzeSlidePage(data);

  if (
    phases.some((p) => p.kind === "bear_spike") &&
    phases.some((p) => p.kind === "tr" || p.kind === "tr_lower_highs") &&
    setup === "mixed"
  ) {
    setup = "bear_spike_then_range";
  }

  return {
    setup,
    setupLabel: SETUP_LABEL[setup],
    alwaysIn,
    scale,
    scaleLabel,
    direction,
    overlap,
    aboveEma,
    crossEma,
    bearSpike,
    bullSpike,
    trStrength,
    ailStrength,
    bullRatio,
    bearRatio,
    barCount: n,
    patterns,
    patternIds,
    searchTerms: SETUP_SEARCH[setup],
    phases,
    phaseSig,
    chartScore: page.chartScore,
    slideKind: page.kind,
  };
}

export async function fingerprintFromDataUrl(
  dataUrl: string,
  crop?: { x: number; y: number; w: number; h: number } | null,
): Promise<BrooksFingerprint> {
  const img = await import("./phash").then((m) => m.loadImage(dataUrl));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 不可用");

  if (crop && crop.w > 20 && crop.h > 20) {
    canvas.width = crop.w;
    canvas.height = crop.h;
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  } else {
    const { CHART_CROP } = await import("./phash");
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const left = Math.floor(w * CHART_CROP.left);
    const top = Math.floor(h * CHART_CROP.top);
    const cw = Math.floor(w * (CHART_CROP.right - CHART_CROP.left));
    const ch = Math.floor(h * (CHART_CROP.bottom - CHART_CROP.top));
    canvas.width = cw;
    canvas.height = ch;
    ctx.drawImage(img, left, top, cw, ch, 0, 0, cw, ch);
  }

  const scaled = document.createElement("canvas");
  scaled.width = 200;
  scaled.height = Math.max(32, Math.round(canvas.height * (200 / canvas.width)));
  const sctx = scaled.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  return extractBrooksFingerprint(sctx.getImageData(0, 0, scaled.width, scaled.height));
}

export async function fingerprintFromThumbUrl(url: string): Promise<BrooksFingerprint> {
  const img = await import("./phash").then((m) => m.loadImage(url));
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = Math.max(32, Math.round(img.naturalHeight * (200 / img.naturalWidth)));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return extractBrooksFingerprint(ctx.getImageData(0, 0, canvas.width, canvas.height));
}
