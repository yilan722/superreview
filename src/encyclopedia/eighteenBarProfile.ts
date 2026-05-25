import { extractBarSeries, type BarColumn } from "./barSeries";
import { isEmaLine } from "./chartPixels";
import { detectPatternsFromImageData } from "./patternDetect";
import {
  analyzeSlideStructure,
  type OpeningBarsBrooksAnalysis,
} from "./openingBarsBrooks";
import {
  extractFixedChunkPhases,
  phaseSequenceScore,
  phaseSignature,
  type NarrativePhase,
} from "./narrativePhases";

/** 阿布式开盘/波段分析常用 18 根棒 */
export const BAR_WINDOW = 18;

export interface EighteenBarProfile {
  /** 匹配窗口大小（18/80等） */
  window: number;
  /** 实际棒数（≤window） */
  barCount: number;
  bars: BarColumn[];
  phases: NarrativePhase[];
  phaseSig: string;
  /** 收盘价路径，归一化 0–1 */
  shape: number[];
  /** 每棒 -1空 / 0震荡 / 1多 */
  polarity: number[];
  bullCount: number;
  bearCount: number;
  overlap: number;
  netSlope: number;
  earlySlope: number;
  lateSlope: number;
  direction: "up" | "down" | "sideways";
  startDirection: "up" | "down" | "sideways";
  openingSetup: "bull_from_open" | "bear_from_open" | "tr_open" | "unclear";
  setup:
    | "bull_trend"
    | "bear_trend"
    | "trading_range"
    | "bull_spike_then_tr"
    | "bear_spike_then_tr"
    | "mixed";
  emaByBar: EmaBarRelation[];
  emaSummary: string;
  patternTags: string[];
  summary: string;
  /** Al Brooks 开盘 18 棒叙事（OHLC 或 price-like 重建） */
  brooks?: OpeningBarsBrooksAnalysis;
}

export type EmaBarRelation = "above" | "below" | "cross" | "unknown";

function linregSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
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

function overlapRate(bars: BarColumn[]): number {
  if (bars.length < 2) return 0;
  let o = 0;
  for (let i = 1; i < bars.length; i++) {
    if (Math.abs(bars[i].close - bars[i - 1].close) < bars[i].range * 0.35) o++;
  }
  return o / (bars.length - 1);
}

function detectDirectionFromCloses(
  closes: number[],
  avgRange: number,
): "up" | "down" | "sideways" {
  if (closes.length < 3) return "sideways";
  const s = linregSlope(closes);
  const gate = Math.max(0.6, avgRange * 0.08);
  if (Math.abs(s) < gate) return "sideways";
  return s > 0 ? "down" : "up";
}

/** 从有效 K 线列构建 18 棒画像（取最近 18 根，即屏幕上最靠右、时间上最新的棒） */
export function profileFromBars(
  allBars: BarColumn[],
  height: number,
  window = BAR_WINDOW,
  emaAll?: EmaBarRelation[],
): EighteenBarProfile {
  const validAll = allBars.filter((b) => b.valid);
  const startIdx = Math.max(0, validAll.length - window);
  const bars = validAll.slice(startIdx);
  const emaByBar =
    emaAll && emaAll.length >= startIdx + bars.length
      ? emaAll.slice(startIdx, startIdx + bars.length)
      : new Array(bars.length).fill("unknown");
  const n = bars.length;
  const closes = bars.map((b) => b.close);
  const minC = Math.min(...closes);
  const maxC = Math.max(...closes);
  const span = Math.max(1, maxC - minC);

  const shape = closes.map((c) => (c - minC) / span);
  const polarity = bars.map((b) => {
    const bodyRatio = b.body / Math.max(1, b.range);
    if (bodyRatio < 0.22) return 0;
    return b.isBull ? 1 : -1;
  });

  const third = Math.max(1, Math.floor(n / 3));
  const early = bars.slice(0, third);
  const late = bars.slice(-third);

  const { patternTags } = detectPatternsFromImageData(
    barsToImageData(bars, height),
    { aboveEma: 0.5, earlyAbove: 0.5, lateAbove: 0.5 },
  );

  const chunkSize = window >= 18 ? 18 : Math.max(6, Math.floor(window / 2));
  const phases = extractFixedChunkPhases(bars, height, chunkSize).map((p) => {
    const rel = dominantEma(emaByBar.slice(p.barStart - 1, p.barEnd));
    const relText =
      rel === "above"
        ? "EMA上方"
        : rel === "below"
          ? "EMA下方"
          : rel === "cross"
            ? "穿越EMA"
            : "EMA不明";
    return {
      ...p,
      summary: `${p.summary} · ${relText}`,
    };
  });
  const bullCount = bars.filter((b) => b.isBull).length;
  const bearCount = n - bullCount;

  const netSlope = linregSlope(closes);
  const avgRange =
    bars.reduce((s, b) => s + b.range, 0) / Math.max(1, bars.length);
  const direction = detectDirectionFromCloses(closes, avgRange);
  const startN = Math.max(4, Math.min(6, bars.length));
  const startDirection = detectDirectionFromCloses(
    closes.slice(0, startN),
    avgRange,
  );
  const openingSetup: EighteenBarProfile["openingSetup"] =
    startDirection === "up"
      ? "bull_from_open"
      : startDirection === "down"
        ? "bear_from_open"
        : bars.length >= 6
          ? "tr_open"
          : "unclear";

  const phaseKinds = phases.map((p) => p.kind);
  const hasTR = phaseKinds.some(
    (k) => k === "tr" || k === "tr_lower_highs" || k === "tr_higher_lows",
  );
  const hasBearSpike = phaseKinds.includes("bear_spike");
  const hasBullSpike = phaseKinds.includes("bull_spike");
  const hasBearBreakout = phaseKinds.includes("bear_breakout");
  const hasBullBreakout = phaseKinds.includes("bull_breakout");

  let setup: EighteenBarProfile["setup"] = "mixed";
  if (direction === "up" && !hasTR) setup = "bull_trend";
  else if (direction === "down" && !hasTR) setup = "bear_trend";
  else if (hasTR && hasBearSpike) setup = "bear_spike_then_tr";
  else if (hasTR && hasBullSpike) setup = "bull_spike_then_tr";
  else if (hasTR && !hasBearBreakout && !hasBullBreakout) setup = "trading_range";

  const summary =
    n < window
      ? `仅识别 ${n} 根 K 线（目标窗口 ${window} 根）`
      : `最近 ${window} 根 · ${setup} · 开局 ${openingSetup} · 阳${bullCount}/阴${bearCount} · ${phaseSignature(phases) || "混合"}`;

  const emaSummary = emaSummaryText(emaByBar);
  // slide/图片路径：用 shape 相对结构，不用像素 Y 反算伪价格
  const brooks =
    shape.length >= 6 ? analyzeSlideStructure(shape, polarity) : undefined;

  return {
    window,
    barCount: n,
    bars,
    phases,
    phaseSig: phaseSignature(phases),
    shape,
    polarity,
    bullCount,
    bearCount,
    overlap: overlapRate(bars),
    netSlope,
    earlySlope: early.length ? linregSlope(early.map((b) => b.close)) : 0,
    lateSlope: late.length ? linregSlope(late.map((b) => b.close)) : 0,
    direction,
    startDirection,
    openingSetup,
    setup,
    emaByBar,
    emaSummary,
    patternTags,
    summary,
    brooks,
  };
}

function barsToImageData(
  bars: BarColumn[],
  height: number,
  window = BAR_WINDOW,
): ImageData {
  const w = Math.max(bars.length, window);
  const data = new ImageData(w, height);
  for (let x = 0; x < bars.length; x++) {
    const b = bars[x];
    for (let y = Math.floor(b.high); y <= Math.floor(b.low); y++) {
      if (y < 0 || y >= height) continue;
      const i = (y * w + x) * 4;
      if (b.isBull) {
        data.data[i] = 40;
        data.data[i + 1] = 180;
        data.data[i + 2] = 80;
      } else {
        data.data[i] = 220;
        data.data[i + 1] = 60;
        data.data[i + 2] = 60;
      }
      data.data[i + 3] = 255;
    }
  }
  return data;
}

export function profileFromImageData(data: ImageData): EighteenBarProfile {
  const series = extractBarSeries(data);
  return profileFromBars(series.bars, series.height);
}

export function profileFromImageDataWithWindow(
  data: ImageData,
  window: number,
): EighteenBarProfile {
  const series = extractBarSeries(data);
  const emaAll = detectEmaRelationByValidBars(data, series.bars, series.height);
  return profileFromBars(series.bars, series.height, window, emaAll);
}

function shapeSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return Math.max(0, 1 - sum / n);
}

function polaritySimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let match = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) match += 1;
    else if (a[i] * b[i] > 0) match += 0.5;
  }
  return match / n;
}

/** 0–100：两根 18 棒画像有多像 */
export function compareEighteenBarProfiles(
  query: EighteenBarProfile,
  slide: EighteenBarProfile,
): {
  score: number;
  phaseScore: number;
  shapeScore: number;
  polarityScore: number;
  trendScore: number;
  openingScore: number;
  emaScore: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  const phaseScore = phaseSequenceScore(query.phases, slide.phases);
  const shapeScore = shapeSimilarity(query.shape, slide.shape);
  const polarityScore = polaritySimilarity(query.polarity, slide.polarity);
  const emaScore = emaSimilarity(query.emaByBar, slide.emaByBar);

  let trendScore = 0.2;
  if (query.direction === slide.direction) trendScore = 1;
  else if (query.direction === "sideways" || slide.direction === "sideways") trendScore = 0.45;
  else trendScore = 0;

  let openingScore = 0.2;
  if (query.openingSetup === slide.openingSetup) openingScore = 1;
  else if (
    query.openingSetup === "tr_open" ||
    slide.openingSetup === "tr_open"
  ) {
    openingScore = 0.55;
  } else if (
    query.openingSetup === "unclear" ||
    slide.openingSetup === "unclear"
  ) {
    openingScore = 0.4;
  } else {
    openingScore = 0;
  }

  let setupBonus = 0;
  if (query.setup === slide.setup) setupBonus = 8;
  else if (
    (query.setup === "bull_spike_then_tr" && slide.setup === "trading_range") ||
    (query.setup === "bear_spike_then_tr" && slide.setup === "trading_range") ||
    (slide.setup === "bull_spike_then_tr" && query.setup === "trading_range") ||
    (slide.setup === "bear_spike_then_tr" && query.setup === "trading_range")
  ) {
    setupBonus = 4;
  }

  let score = 0;
  score += phaseScore * 42;
  score += shapeScore * 26;
  score += polarityScore * 16;
  score += trendScore * 16;
  score += openingScore * 10;
  score += emaScore * 8;
  score += setupBonus;

  if (Math.abs(query.bullCount - slide.bullCount) <= 3) score += 4;
  if (Math.abs(query.overlap - slide.overlap) < 0.22) score += 4;

  if (phaseScore >= 0.5) {
    reasons.push(`18棒阶段一致 ${(phaseScore * 100).toFixed(0)}%：${query.phaseSig}`);
  }
  if (query.direction === slide.direction && query.direction !== "sideways") {
    reasons.push(`趋势方向一致：${query.direction === "up" ? "上行" : "下行"}`);
  }
  if (query.openingSetup === slide.openingSetup && query.openingSetup !== "unclear") {
    reasons.push(`开局一致：${query.openingSetup}`);
  }
  if (query.setup === slide.setup) {
    reasons.push(`Setup一致：${query.setup}`);
  }
  if (emaScore >= 0.55) {
    reasons.push(`EMA20关系相似 ${(emaScore * 100).toFixed(0)}%（${query.emaSummary}）`);
  }
  if (shapeScore >= 0.55) {
    reasons.push(`价格路径相似 ${(shapeScore * 100).toFixed(0)}%`);
  }
  if (polarityScore >= 0.55) {
    reasons.push(`阴阳序列相似 ${(polarityScore * 100).toFixed(0)}%`);
  }

  if (trendScore === 0 || openingScore === 0) {
    score = Math.min(score, 30);
  }

  return {
    score: Math.min(100, Math.round(score)),
    phaseScore,
    shapeScore,
    polarityScore,
    trendScore,
    openingScore,
    emaScore,
    reasons,
  };
}

/** 在 slide 全序列上滑动找与 query 最像的连续 18 棒 */
export function best18BarWindow(
  query: EighteenBarProfile,
  allBars: BarColumn[],
  height: number,
  window = query.window || BAR_WINDOW,
  emaAll?: EmaBarRelation[],
): { profile: EighteenBarProfile; score: number; barStart: number; reasons: string[] } {
  const valid = allBars.filter((b) => b.valid);
  const win = Math.min(window, valid.length);
  if (valid.length < 6) {
    const p = profileFromBars(valid, height, win, emaAll);
    const c = compareEighteenBarProfiles(query, p);
    return { profile: p, score: c.score, barStart: 1, reasons: c.reasons };
  }

  let bestScore = 0;
  let bestStart = 0;
  let bestProfile = profileFromBars(valid.slice(0, win), height, win, emaAll?.slice(0, win));
  let bestReasons: string[] = [];

  const step = valid.length > 40 ? 3 : 1;
  const maxStart = Math.max(0, valid.length - win);

  for (let s = 0; s <= maxStart; s += step) {
    const chunk = valid.slice(s, s + win);
    const prof = profileFromBars(
      chunk,
      height,
      win,
      emaAll?.slice(s, s + win),
    );
    const { score, reasons } = compareEighteenBarProfiles(query, prof);
    if (score > bestScore) {
      bestScore = score;
      bestStart = s;
      bestProfile = prof;
      bestReasons = reasons;
    }
  }

  return {
    profile: bestProfile,
    score: bestScore,
    barStart: bestStart + 1,
    reasons: bestReasons,
  };
}

export function format18BarReadout(p: EighteenBarProfile): string {
  const lines = [
    p.summary,
    `Setup：${p.setup} · 方向：${p.direction} · EMA20：${p.emaSummary}`,
    `阶段：${p.phaseSig || "—"}`,
  ];
  for (const ph of p.phases) {
    lines.push(`· 棒 ${ph.barStart}–${ph.barEnd}：${ph.label}`);
  }
  if (p.patternTags.length) {
    lines.push(`形态：${p.patternTags.join("、")}`);
  }
  return lines.join("\n");
}

function detectEmaYPerColumn(data: ImageData): Array<number | null> {
  const { width, height, data: px } = data;
  const out: Array<number | null> = new Array(width).fill(null);
  for (let x = 0; x < width; x++) {
    let ey = 0;
    let n = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (isEmaLine(r, g, b)) {
        ey += y;
        n++;
      }
    }
    out[x] = n > 0 ? ey / n : null;
  }
  return out;
}

function nearestEma(emaY: Array<number | null>, x: number): number | null {
  if (emaY[x] != null) return emaY[x];
  for (let d = 1; d <= 3; d++) {
    if (x - d >= 0 && emaY[x - d] != null) return emaY[x - d];
    if (x + d < emaY.length && emaY[x + d] != null) return emaY[x + d];
  }
  return null;
}

function detectEmaRelationByValidBars(
  data: ImageData,
  bars: BarColumn[],
  height: number,
): EmaBarRelation[] {
  const emaY = detectEmaYPerColumn(data);
  const valid = bars.filter((b) => b.valid);
  return valid.map((b) => {
    const e = nearestEma(emaY, b.x);
    if (e == null) return "unknown";
    const diff = b.close - e;
    const crossBand = Math.max(height * 0.015, b.range * 0.14);
    if (Math.abs(diff) <= crossBand) return "cross";
    return diff < 0 ? "above" : "below";
  });
}

function dominantEma(arr: EmaBarRelation[]): EmaBarRelation {
  const cnt: Record<EmaBarRelation, number> = {
    above: 0,
    below: 0,
    cross: 0,
    unknown: 0,
  };
  for (const a of arr) cnt[a] = (cnt[a] ?? 0) + 1;
  if (cnt.above >= cnt.below && cnt.above >= cnt.cross && cnt.above > 0) return "above";
  if (cnt.below >= cnt.cross && cnt.below > 0) return "below";
  if (cnt.cross > 0) return "cross";
  return "unknown";
}

function emaSummaryText(arr: EmaBarRelation[]): string {
  const d = dominantEma(arr);
  if (d === "above") return "多数在EMA上方";
  if (d === "below") return "多数在EMA下方";
  if (d === "cross") return "频繁穿越EMA";
  return "EMA不明显";
}

function emaSimilarity(a: EmaBarRelation[], b: EmaBarRelation[]): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0.3;
  let score = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) score += 1;
    else if (a[i] === "unknown" || b[i] === "unknown") score += 0.4;
    else if (
      (a[i] === "cross" && (b[i] === "above" || b[i] === "below")) ||
      (b[i] === "cross" && (a[i] === "above" || a[i] === "below"))
    ) {
      score += 0.6;
    }
  }
  return score / n;
}
