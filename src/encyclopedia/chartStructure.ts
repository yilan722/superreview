import {
  classifyPixel,
  detectTheme,
  isEmaLine,
  type ChartTheme,
} from "./chartPixels";
import { resolveQueryChartRegion } from "./detectChartRegion";
import { detectPatternsFromImageData, type DetectedPattern } from "./patternDetect";
import { detectSlideScale, SCALE_LABEL, type SlideScale } from "./slideScale";
import { CHART_CROP, loadImage } from "./phash";

export type MarketPhase =
  | "bull_trend"
  | "bear_trend"
  | "trading_range"
  | "bull_breakout"
  | "bear_breakout"
  | "mixed";

export type EmaRelation = "mostly_above" | "mostly_below" | "crossing" | "unclear";

export interface ChartStructure {
  phase: MarketPhase;
  phaseLabel: string;
  emaRelation: EmaRelation;
  emaLabel: string;
  barCharacter: "trend_bars" | "overlap" | "mixed";
  barLabel: string;
  direction: "up" | "down" | "sideways";
  /** 0–1 bullish body dominance in chart area */
  bullRatio: number;
  bearRatio: number;
  /** Summary tags for UI chips */
  tags: string[];
  /** Brooks 形态：MTR / wedge / big bar / doji / ioi / ii / oo 等 */
  patterns: DetectedPattern[];
  patternTags: string[];
  scale: SlideScale;
  scaleLabel: string;
}

type CropRect = { x: number; y: number; w: number; h: number };

const ANALYSIS_WIDTH = 200;

function extractChartPixels(
  img: HTMLImageElement,
  crop?: CropRect | null,
): ImageData {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 不可用");

  if (crop && crop.w > 20 && crop.h > 20) {
    canvas.width = crop.w;
    canvas.height = crop.h;
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  } else {
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

  const cw = canvas.width;
  const ch = canvas.height;
  const outW = ANALYSIS_WIDTH;
  const outH = Math.max(32, Math.round(ch * (ANALYSIS_WIDTH / cw)));
  const scaled = document.createElement("canvas");
  scaled.width = outW;
  scaled.height = outH;
  const sctx = scaled.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("Canvas 不可用");
  sctx.drawImage(canvas, 0, 0, outW, outH);
  return sctx.getImageData(0, 0, outW, outH);
}

function columnStats(data: ImageData, col: number, theme: ChartTheme) {
  const { width, height, data: px } = data;
  let priceY = 0;
  let priceW = 0;
  let emaY = 0;
  let emaW = 0;
  let bull = 0;
  let bear = 0;

  for (let y = 0; y < height; y++) {
    const i = (y * width + col) * 4;
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];

    if (isEmaLine(r, g, b)) {
      emaY += y;
      emaW++;
      continue;
    }

    const kind = classifyPixel(r, g, b, theme);
    if (kind === "skip") continue;

    priceY += y;
    priceW++;
    if (kind === "bull") bull++;
    else if (kind === "bear") bear++;
    else if (kind === "candle") {
      if (g > r) bull++;
      else bear++;
    }
  }

  return {
    price: priceW > 0 ? priceY / priceW : null,
    ema: emaW > 0 ? emaY / emaW : null,
    bull,
    bear,
  };
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
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function classify(struct: {
  slope: number;
  lateSlope: number;
  overlap: number;
  aboveEma: number;
  crossEma: number;
  bullRatio: number;
  bearRatio: number;
  rangeCompress: number;
  patterns: DetectedPattern[];
  patternTags: string[];
  scale: SlideScale;
}): ChartStructure {
  const {
    slope,
    lateSlope,
    overlap,
    aboveEma,
    crossEma,
    bullRatio,
    bearRatio,
    rangeCompress,
    patterns,
    patternTags,
    scale,
  } = struct;

  let phase: MarketPhase = "mixed";
  let phaseLabel = "混合/过渡";
  const tags: string[] = [...patternTags];

  const normSlope = slope / 40;
  const normLate = lateSlope / 40;

  if (crossEma > 0.38 && overlap > 0.55) {
    phase = "trading_range";
    phaseLabel = "交易区间";
    tags.push("重叠 K 线", "频繁穿越 EMA20");
  } else if (normLate < -0.35 && aboveEma < 0.35 && overlap < 0.5) {
    phase = "bear_breakout";
    phaseLabel = "熊市突破";
    tags.push("末期下破", "Bear breakout");
  } else if (normLate > 0.35 && aboveEma > 0.65 && overlap < 0.5) {
    phase = "bull_breakout";
    phaseLabel = "牛市突破";
    tags.push("末期上破", "Bull breakout");
  } else if (normSlope < -0.2 && aboveEma < 0.45) {
    phase = "bear_trend";
    phaseLabel = "空头趋势";
    tags.push("价格多在 EMA 下方");
  } else if (normSlope > 0.2 && aboveEma > 0.55) {
    phase = "bull_trend";
    phaseLabel = "多头趋势";
    tags.push("价格多在 EMA 上方");
  }

  if (overlap > 0.62 && phase !== "trading_range") {
    tags.push("重叠增多");
  }
  if (rangeCompress > 0.55) {
    tags.push("末期收窄");
  }
  if (bullRatio > 0.58) tags.push("阳线偏多");
  if (bearRatio > 0.58) tags.push("阴线偏多");

  let emaRelation: EmaRelation = "unclear";
  let emaLabel = "EMA 不明显";
  if (crossEma > 0.32) {
    emaRelation = "crossing";
    emaLabel = "频繁穿越 EMA20";
  } else if (aboveEma > 0.58) {
    emaRelation = "mostly_above";
    emaLabel = "多数在 EMA20 上方";
  } else if (aboveEma < 0.42) {
    emaRelation = "mostly_below";
    emaLabel = "多数在 EMA20 下方";
  }

  let barCharacter: ChartStructure["barCharacter"] = "mixed";
  let barLabel = "趋势棒与重叠混合";
  if (overlap > 0.58) {
    barCharacter = "overlap";
    barLabel = "重叠/震荡棒为主";
  } else if (overlap < 0.38) {
    barCharacter = "trend_bars";
    barLabel = "趋势棒为主（实体大、重叠少）";
  }

  let direction: ChartStructure["direction"] = "sideways";
  if (normSlope > 0.15) direction = "up";
  else if (normSlope < -0.15) direction = "down";

  const scaleLabel = SCALE_LABEL[scale];

  return {
    phase,
    phaseLabel,
    emaRelation,
    emaLabel,
    barCharacter,
    barLabel,
    direction,
    bullRatio,
    bearRatio,
    tags: [...new Set(tags)],
    patterns,
    patternTags,
    scale,
    scaleLabel,
  };
}

export async function analyzeChartFromDataUrl(
  dataUrl: string,
  crop?: CropRect | null,
): Promise<ChartStructure> {
  const region = await resolveQueryChartRegion(dataUrl, crop ?? undefined);
  const img = await loadImage(dataUrl);
  const data = extractChartPixels(img, region);
  const { width, height } = data;
  const theme = detectTheme(data);

  const prices: number[] = [];
  const emas: (number | null)[] = [];
  let bullTotal = 0;
  let bearTotal = 0;
  let above = 0;
  let cross = 0;
  let emaSamples = 0;

  for (let x = 0; x < width; x++) {
    const s = columnStats(data, x, theme);
    bullTotal += s.bull;
    bearTotal += s.bear;
    if (s.price != null) prices.push(s.price);
    emas.push(s.ema);
    if (s.price != null && s.ema != null) {
      emaSamples++;
      if (s.price < s.ema) above++;
      const rel = Math.abs(s.price - s.ema) / height;
      if (rel < 0.06) cross++;
    }
  }

  const bodyTotal = bullTotal + bearTotal + 1e-6;
  const bullRatio = bullTotal / bodyTotal;
  const bearRatio = bearTotal / bodyTotal;

  const slope = linregSlope(prices);
  const third = Math.floor(prices.length / 3);
  const lateSlope =
    prices.length > 6
      ? linregSlope(prices.slice(-third * 2))
      : slope;

  let overlap = 0;
  for (let i = 1; i < prices.length; i++) {
    if (Math.abs(prices[i] - prices[i - 1]) < height * 0.018) overlap++;
  }
  overlap /= Math.max(1, prices.length - 1);

  const earlyRange = Math.max(...prices.slice(0, third * 2)) - Math.min(...prices.slice(0, third * 2));
  const lateRange = Math.max(...prices.slice(-third * 2)) - Math.min(...prices.slice(-third * 2));
  const rangeCompress =
    earlyRange > 1 ? 1 - Math.min(1, lateRange / earlyRange) : 0;

  const aboveEma = emaSamples > 0 ? above / emaSamples : 0.5;
  const crossEma = emaSamples > 0 ? cross / emaSamples : 0;

  let earlyAbove = 0;
  let lateAbove = 0;
  let earlyN = 0;
  let lateN = 0;
  for (let i = 0; i < width; i++) {
    const s = columnStats(data, i, theme);
    if (s.price == null || s.ema == null) continue;
    const isAbove = s.price < s.ema;
    if (i < width / 3) {
      earlyAbove += isAbove ? 1 : 0;
      earlyN++;
    } else if (i > (width * 2) / 3) {
      lateAbove += isAbove ? 1 : 0;
      lateN++;
    }
  }
  earlyAbove = earlyN > 0 ? earlyAbove / earlyN : aboveEma;
  lateAbove = lateN > 0 ? lateAbove / lateN : aboveEma;

  const { patterns, patternTags } = detectPatternsFromImageData(data, {
    aboveEma,
    earlyAbove,
    lateAbove,
  });

  const scale = detectSlideScale(data);

  return classify({
    slope,
    lateSlope,
    overlap,
    aboveEma,
    crossEma,
    bullRatio,
    bearRatio,
    rangeCompress,
    patterns,
    patternTags,
    scale,
  });
}

export async function analyzeChartFromUrl(
  url: string,
): Promise<ChartStructure> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.drawImage(img, 0, 0);
  return analyzeChartFromDataUrl(canvas.toDataURL("image/jpeg", 0.92));
}
