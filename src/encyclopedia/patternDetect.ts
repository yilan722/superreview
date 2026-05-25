import type { BarColumn } from "./barSeries";
import { extractBarSeries, validBars } from "./barSeries";

export type PatternId =
  | "mtr_bull"
  | "mtr_bear"
  | "wedge_rising"
  | "wedge_falling"
  | "triangle"
  | "big_bull_bar"
  | "big_bear_bar"
  | "doji"
  | "ioi"
  | "ii"
  | "oo";

export interface DetectedPattern {
  id: PatternId;
  label: string;
  labelEn: string;
  /** 0–1 confidence */
  strength: number;
  /** bar index range in analysis grid */
  at?: string;
}

export interface PatternAnalysis {
  patterns: DetectedPattern[];
  /** Short labels for chips */
  patternTags: string[];
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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

function isInside(inside: BarColumn, mother: BarColumn): boolean {
  return inside.high >= mother.high && inside.low <= mother.low && inside.range < mother.range * 0.95;
}

function isOutside(outer: BarColumn, inner: BarColumn): boolean {
  return outer.high < inner.high && outer.low > inner.low && outer.range > inner.range * 1.05;
}

function isDoji(bar: BarColumn, medRange: number): boolean {
  if (bar.range < 1) return false;
  const bodyRatio = bar.body / bar.range;
  const tailMin = Math.min(bar.upperTail, bar.lowerTail);
  return bodyRatio < 0.28 && bar.range < medRange * 1.4 && tailMin > bar.body * 0.4;
}

function isBigBar(bar: BarColumn, medRange: number, medBody: number): boolean {
  return bar.range > medRange * 1.65 || bar.body > medBody * 1.75;
}

function detectBarPatterns(bars: BarColumn[], height: number): DetectedPattern[] {
  const found: DetectedPattern[] = [];
  const ranges = bars.map((b) => b.range);
  const bodies = bars.map((b) => b.body);
  const medRange = median(ranges.filter((r) => r > 0)) || height * 0.05;
  const medBody = median(bodies.filter((b) => b > 0)) || height * 0.02;

  let dojiCount = 0;
  let bigBull = 0;
  let bigBear = 0;
  for (const b of bars) {
    if (!b.valid) continue;
    if (isDoji(b, medRange)) dojiCount++;
    if (isBigBar(b, medRange, medBody)) {
      if (b.isBull) bigBull++;
      else bigBear++;
    }
  }

  if (dojiCount >= Math.max(2, bars.length * 0.08)) {
    found.push({
      id: "doji",
      label: "十字星 / Doji",
      labelEn: "Doji",
      strength: Math.min(1, dojiCount / (bars.length * 0.15)),
    });
  }
  if (bigBull >= 1) {
    found.push({
      id: "big_bull_bar",
      label: "大阳线 / Big bull bar",
      labelEn: "Big bull bar",
      strength: Math.min(1, bigBull / 3),
      at: "近期",
    });
  }
  if (bigBear >= 1) {
    found.push({
      id: "big_bear_bar",
      label: "大阴线 / Big bear bar",
      labelEn: "Big bear bar",
      strength: Math.min(1, bigBear / 3),
      at: "近期",
    });
  }

  for (let i = 2; i < bars.length; i++) {
    const a = bars[i - 2];
    const b = bars[i - 1];
    const c = bars[i];
    if (!a.valid || !b.valid || !c.valid) continue;

    if (isInside(b, a) && isInside(c, b)) {
      found.push({
        id: "ii",
        label: "内包-内包 (ii)",
        labelEn: "ii (inside-inside)",
        strength: 0.75,
        at: `棒 ${i - 1}–${i}`,
      });
    }
    if (isOutside(b, a) && isOutside(c, b)) {
      found.push({
        id: "oo",
        label: "外包-外包 (oo)",
        labelEn: "oo (outside-outside)",
        strength: 0.75,
        at: `棒 ${i - 1}–${i}`,
      });
    }
    if (isInside(b, a) && isOutside(c, b) && i + 1 < bars.length) {
      const d = bars[i + 1];
      if (d.valid && isInside(d, c)) {
        found.push({
          id: "ioi",
          label: "内-外-内 (ioi)",
          labelEn: "ioi (inside-outside-inside)",
          strength: 0.8,
          at: `棒 ${i - 1}–${i + 1}`,
        });
      }
    }
  }

  return found;
}

function detectWedgeTriangle(bars: BarColumn[]): DetectedPattern[] {
  const found: DetectedPattern[] = [];
  const n = bars.length;
  if (n < 12) return found;

  const seg = bars.slice(Math.floor(n * 0.45));
  const highs = seg.map((b) => b.high);
  const lows = seg.map((b) => b.low);
  const highSlope = linregSlope(highs);
  const lowSlope = linregSlope(lows);

  const earlyW = Math.max(...seg.slice(0, Math.floor(seg.length / 2)).map((b) => b.range));
  const lateW = Math.max(...seg.slice(-Math.floor(seg.length / 2)).map((b) => b.range));
  const compress = earlyW > 1 ? 1 - lateW / earlyW : 0;

  const converging = compress > 0.25 && Math.abs(highSlope) > 0.02 && Math.abs(lowSlope) > 0.02;
  const highDown = highSlope > 0.08;
  const lowUp = lowSlope < -0.08;
  const highUp = highSlope < -0.08;
  const lowDown = lowSlope > 0.08;

  if (converging && highDown && lowUp) {
    found.push({
      id: "wedge_rising",
      label: "楔形上行 (Rising wedge)",
      labelEn: "Rising wedge",
      strength: Math.min(1, compress + 0.3),
    });
  }
  if (converging && highUp && lowDown) {
    found.push({
      id: "wedge_falling",
      label: "楔形下行 (Falling wedge)",
      labelEn: "Falling wedge",
      strength: Math.min(1, compress + 0.3),
    });
  }

  const flatHigh = Math.abs(highSlope) < 0.06;
  const flatLow = Math.abs(lowSlope) < 0.06;
  if (converging && (flatHigh || flatLow)) {
    found.push({
      id: "triangle",
      label: "三角收敛 (Triangle)",
      labelEn: "Triangle",
      strength: Math.min(1, compress + 0.25),
    });
  }

  return found;
}

function detectMtr(
  bars: BarColumn[],
  earlyAbove: number,
  lateAbove: number,
): DetectedPattern[] {
  const found: DetectedPattern[] = [];
  const n = bars.length;
  if (n < 15) return found;

  const closes = bars.map((b) => b.close);
  const third = Math.floor(n / 3);
  const earlySlope = linregSlope(closes.slice(0, third * 2));
  const lateSlope = linregSlope(closes.slice(-third * 2));

  const earlyLows = bars.slice(0, third * 2).map((b) => b.low);
  const lateLows = bars.slice(-third * 2).map((b) => b.low);
  const earlyHighs = bars.slice(0, third * 2).map((b) => b.high);
  const lateHighs = bars.slice(-third * 2).map((b) => b.high);
  const minEarlyLow = Math.min(...earlyLows);
  const minLateLow = Math.min(...lateLows);
  const maxEarlyHigh = Math.max(...earlyHighs);
  const maxLateHigh = Math.max(...lateHighs);

  const norm = bars[0]?.range || 1;

  // Bull MTR: was bearish, higher low, late turn up, reclaim EMA
  if (
    earlySlope > 0.15 * norm &&
    lateSlope < -0.12 * norm &&
    minLateLow > minEarlyLow + norm * 0.15 &&
    lateAbove > earlyAbove + 0.12 &&
    lateAbove > 0.48
  ) {
    found.push({
      id: "mtr_bull",
      label: "主要趋势反转·看多 (Bull MTR)",
      labelEn: "Bull Major Trend Reversal",
      strength: 0.7,
      at: "后半段",
    });
  }

  // Bear MTR: was bullish, lower high, late turn down, lose EMA
  if (
    earlySlope < -0.15 * norm &&
    lateSlope > 0.12 * norm &&
    maxLateHigh < maxEarlyHigh - norm * 0.15 &&
    lateAbove < earlyAbove - 0.12 &&
    lateAbove < 0.52
  ) {
    found.push({
      id: "mtr_bear",
      label: "主要趋势反转·看空 (Bear MTR)",
      labelEn: "Bear Major Trend Reversal",
      strength: 0.7,
      at: "后半段",
    });
  }

  return found;
}

function dedupePatterns(patterns: DetectedPattern[]): DetectedPattern[] {
  const byId = new Map<PatternId, DetectedPattern>();
  for (const p of patterns) {
    const prev = byId.get(p.id);
    if (!prev || p.strength > prev.strength) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => b.strength - a.strength);
}

export function detectPatternsFromImageData(
  data: ImageData,
  ctx: { aboveEma: number; earlyAbove: number; lateAbove: number },
): PatternAnalysis {
  const series = extractBarSeries(data);
  const bars = validBars(series);
  if (bars.length < 8) {
    return { patterns: [], patternTags: [] };
  }

  const all = dedupePatterns([
    ...detectBarPatterns(bars, series.height),
    ...detectWedgeTriangle(bars),
    ...detectMtr(bars, ctx.earlyAbove, ctx.lateAbove),
  ]);

  const patternTags = all
    .filter((p) => p.strength >= 0.45)
    .slice(0, 6)
    .map((p) => p.label);

  return { patterns: all, patternTags };
}

export { extractBarSeries };
