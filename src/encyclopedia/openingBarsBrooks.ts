/**
 * Al Brooks-style opening bars analysis (18-bar narrative, Brooks elements, classification).
 * Works on real OHLC or price-like bars reconstructed from chart geometry.
 */
import type { BarColumn } from "./barSeries";

export type OhlcBar = {
  open: number;
  high: number;
  low: number;
  close: number;
};

export type OpeningClassification =
  | "bull_trend_from_open"
  | "bear_trend_from_open"
  | "two_sided_opening_range"
  | "tr_open_lower_highs"
  | "tr_open_bear_breakout"
  | "tr_open_bull_breakout"
  | "mixed";

export type BrooksOpeningPhaseKind =
  | "opening_drop"
  | "opening_rally"
  | "v_reversal_up"
  | "v_reversal_down"
  | "strong_bull_leg"
  | "strong_bear_leg"
  | "tr_lh"
  | "tr_hl"
  | "tr_neutral"
  | "bear_breakout_tail"
  | "bull_breakout_tail";

export type BrooksOpeningPhase = {
  kind: BrooksOpeningPhaseKind;
  label: string;
  barStart: number;
  barEnd: number;
  pattern: string;
  characteristics: string;
};

export type BrooksElementRow = {
  element: string;
  elementEn: string;
  detail: string;
  matched?: boolean;
};

/** live_ohlc = FMP 真实报价；slide_structure = 百科 thumb 提取的相对结构（0–1 路径） */
export type BrooksDataMode = "live_ohlc" | "slide_structure";

type FormatCtx = {
  mode: BrooksDataMode;
  totalRange: number;
};

function fmtLevel(v: number, ctx: FormatCtx): string {
  if (ctx.mode === "slide_structure") {
    return `${(v * 100).toFixed(0)}%`;
  }
  return v.toFixed(2);
}

function fmtMove(delta: number, ctx: FormatCtx): string {
  if (ctx.mode === "slide_structure") {
    const pct = ctx.totalRange > 0 ? (delta / ctx.totalRange) * 100 : 0;
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(0)}% 波幅`;
  }
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)} pts`;
}

function fmtRangeSpan(totalRange: number, ctx: FormatCtx): string {
  if (ctx.mode === "slide_structure") {
    return "占满 slide 18 棒窗口";
  }
  const sign = totalRange >= 0 ? "+" : "";
  return `${sign}${totalRange.toFixed(2)} pts 波幅`;
}

export type BrooksSignature = {
  classification: OpeningClassification;
  phaseKinds: BrooksOpeningPhaseKind[];
  hasOpeningDrop: boolean;
  hasOpeningRally: boolean;
  hasVReversalUp: boolean;
  hasVReversalDown: boolean;
  hasStrongBullLeg: boolean;
  hasStrongBearLeg: boolean;
  hasTrLowerHighs: boolean;
  hasTrHigherLows: boolean;
  last3CloseLow: boolean;
  last3CloseHigh: boolean;
  closeBelowMidpoint: boolean;
  closeAboveMidpoint: boolean;
  bullBearBalance: number;
  openDropRatio: number;
  vRecoveryRatio: number;
  legExtensionRatio: number;
  trLhScore: number;
  engulfRecovery: boolean;
  closePosition: number;
};

export type OpeningBarsBrooksAnalysis = {
  barCount: number;
  open: number;
  close: number;
  netChange: number;
  netChangePct: number;
  rangeHigh: number;
  rangeLow: number;
  totalRange: number;
  bullCount: number;
  bearCount: number;
  closeNearHighCount: number;
  closeNearLowCount: number;
  largestBullBar: { index: number; points: number } | null;
  largestBearBar: { index: number; points: number } | null;
  closePosition: number;
  classification: OpeningClassification;
  classificationLabel: string;
  phases: BrooksOpeningPhase[];
  brooksElements: BrooksElementRow[];
  phaseSig: string;
  signature: BrooksSignature;
  summary: string;
  /** 数据来源：真实 OHLC 或 slide 相对结构 */
  dataMode: BrooksDataMode;
};

const CLASSIFICATION_LABELS: Record<OpeningClassification, string> = {
  bull_trend_from_open: "开盘即多趋势 (Bull trend from the open)",
  bear_trend_from_open: "开盘即空趋势 (Bear trend from the open)",
  two_sided_opening_range: "双向开盘区间 (Two-sided opening range)",
  tr_open_lower_highs: "开盘 TR + Lower Highs",
  tr_open_bear_breakout: "TR 开盘后熊突破 (Bear breakout from TR open)",
  tr_open_bull_breakout: "TR 开盘后牛突破 (Bull breakout from TR open)",
  mixed: "混合 / 结构不明",
};

function linregSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i]!;
    sumXY += i * values[i]!;
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function barDelta(b: OhlcBar): number {
  return b.close - b.open;
}

function barRange(b: OhlcBar): number {
  return Math.max(1e-9, b.high - b.low);
}

function isBull(b: OhlcBar): boolean {
  return b.close >= b.open;
}

function isBear(b: OhlcBar): boolean {
  return b.close < b.open;
}

function closeNearHigh(b: OhlcBar): boolean {
  const r = barRange(b);
  return (b.close - b.low) / r >= 0.72;
}

function closeNearLow(b: OhlcBar): boolean {
  const r = barRange(b);
  return (b.high - b.close) / r >= 0.72;
}

function overlapRate(bars: OhlcBar[]): number {
  if (bars.length < 2) return 0;
  const avgR = bars.reduce((s, b) => s + barRange(b), 0) / bars.length;
  let o = 0;
  for (let i = 1; i < bars.length; i++) {
    if (Math.abs(bars[i]!.close - bars[i - 1]!.close) < avgR * 0.38) o++;
  }
  return o / (bars.length - 1);
}

function localHighs(bars: OhlcBar[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const left = i > 0 ? bars[i - 1]!.high : -Infinity;
    const right = i < bars.length - 1 ? bars[i + 1]!.high : -Infinity;
    if (bars[i]!.high >= left && bars[i]!.high >= right) out.push(bars[i]!.high);
  }
  return out;
}

function localLows(bars: OhlcBar[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const left = i > 0 ? bars[i - 1]!.low : Infinity;
    const right = i < bars.length - 1 ? bars[i + 1]!.low : Infinity;
    if (bars[i]!.low <= left && bars[i]!.low <= right) out.push(bars[i]!.low);
  }
  return out;
}

function lowerHighsScore(bars: OhlcBar[]): number {
  const highs = localHighs(bars);
  if (highs.length < 2) return 0;
  let lh = 0;
  for (let i = 1; i < highs.length; i++) {
    if (highs[i]! < highs[i - 1]! - barRange(bars[0]!) * 0.05) lh++;
  }
  return lh / (highs.length - 1);
}

function higherLowsScore(bars: OhlcBar[]): number {
  const lows = localLows(bars);
  if (lows.length < 2) return 0;
  let hl = 0;
  for (let i = 1; i < lows.length; i++) {
    if (lows[i]! > lows[i - 1]! + barRange(bars[0]!) * 0.05) hl++;
  }
  return hl / (lows.length - 1);
}

function medianBarRange(bars: OhlcBar[]): number {
  const ranges = bars.map(barRange).sort((a, b) => a - b);
  const m = Math.floor(ranges.length / 2);
  return ranges.length % 2 ? ranges[m]! : (ranges[m - 1]! + ranges[m]!) / 2;
}

type BarStrength = "trend_bull" | "trend_bear" | "doji" | "weak_bull" | "weak_bear";

function classifyBarStrength(b: OhlcBar, medR: number): BarStrength {
  const r = barRange(b);
  const body = Math.abs(barDelta(b));
  const bodyRatio = body / r;
  if (bodyRatio < 0.32) return "doji";
  if (isBull(b)) {
    if (closeNearHigh(b) && body >= medR * 0.45) return "trend_bull";
    return "weak_bull";
  }
  if (closeNearLow(b) && body >= medR * 0.45) return "trend_bear";
  return "weak_bear";
}

type MoveSeverity = "spike" | "strong" | "moderate" | "minor" | "flat";

function moveSeverity(moveAbs: number, totalRange: number, medR: number): MoveSeverity {
  const pct = totalRange > 0 ? moveAbs / totalRange : 0;
  if (pct >= 0.2 || moveAbs >= medR * 1.8) return "spike";
  if (pct >= 0.11 || moveAbs >= medR * 1.15) return "strong";
  if (pct >= 0.06 || moveAbs >= medR * 0.75) return "moderate";
  if (pct >= 0.025 || moveAbs >= medR * 0.4) return "minor";
  return "flat";
}

function severityLabel(sev: MoveSeverity, dir: "down" | "up"): string {
  if (dir === "down") {
    if (sev === "spike") return "抛售尖峰 / 大阴趋势棒";
    if (sev === "strong") return "空头腿 / 明显回落";
    if (sev === "moderate") return "回落测试";
    if (sev === "minor") return "小阴线 / 非趋势棒";
    return "震荡 / 无方向";
  }
  if (sev === "spike") return "买入尖峰 / 大阳趋势棒";
  if (sev === "strong") return "多头腿 / 明显拉升";
  if (sev === "moderate") return "反弹测试";
  if (sev === "minor") return "小阳线 / 非趋势棒";
  return "震荡 / 无方向";
}

function phaseTitleOpening(sev: MoveSeverity, dir: "down" | "up"): string {
  if (sev === "flat" || sev === "minor") {
    return dir === "down" ? "开盘震荡 · 小幅回落" : "开盘震荡 · 小幅走高";
  }
  if (sev === "spike") return dir === "down" ? "⬇ 开盘抛售尖峰" : "⬆ 开盘买入尖峰";
  if (sev === "strong") return dir === "down" ? "⬇ 开盘先跌（空头腿）" : "⬆ 开盘先涨（多头腿）";
  return dir === "down" ? "⬇ 开盘回落" : "⬆ 开盘反弹";
}

function countStrength(bars: OhlcBar[], medR: number) {
  let trendBull = 0;
  let trendBear = 0;
  let doji = 0;
  for (const b of bars) {
    const s = classifyBarStrength(b, medR);
    if (s === "trend_bull") trendBull++;
    else if (s === "trend_bear") trendBear++;
    else if (s === "doji") doji++;
  }
  return { trendBull, trendBear, doji };
}

/** Adaptive 4-phase segmentation — Brooks severity gates all labels. */
function segmentBrooksPhases(bars: OhlcBar[], ctx: FormatCtx): BrooksOpeningPhase[] {
  const n = bars.length;
  if (n < 6) return [];

  const medR = medianBarRange(bars);
  const rangeHigh = Math.max(...bars.map((b) => b.high));
  const rangeLow = Math.min(...bars.map((b) => b.low));
  const totalRange = Math.max(1e-9, rangeHigh - rangeLow);
  const open0 = bars[0]!.open;

  let cursor = 0;
  const phases: BrooksOpeningPhase[] = [];

  // Phase A: opening — only if ≥ moderate (Bar1 小阴不贴「急跌」)
  {
    const scan = Math.min(4, n);
    let p1End = 0;
    let bestDrop = 0;
    let bestRally = 0;
    for (let i = 0; i < scan; i++) {
      const slice = bars.slice(0, i + 1);
      const low = Math.min(...slice.map((b) => b.low));
      const high = Math.max(...slice.map((b) => b.high));
      const drop = open0 - low;
      const rally = high - open0;
      const lastClose = bars[i]!.close;
      const { trendBear, trendBull } = countStrength(slice, medR);
      const dropSev = moveSeverity(drop, totalRange, medR);
      const rallySev = moveSeverity(rally, totalRange, medR);

      if (
        dropSev >= "moderate" &&
        drop >= rally * 0.55 &&
        (trendBear >= 1 || lastClose < open0 - medR * 0.35)
      ) {
        p1End = i + 1;
        bestDrop = drop;
      } else if (
        rallySev >= "moderate" &&
        rally >= drop * 0.55 &&
        (trendBull >= 1 || lastClose > open0 + medR * 0.35)
      ) {
        p1End = i + 1;
        bestRally = rally;
      } else if (p1End > 0) {
        break;
      }
    }

    if (p1End >= 1) {
      const isDrop = bestDrop >= bestRally;
      const mag = isDrop ? bestDrop : bestRally;
      const sev = moveSeverity(mag, totalRange, medR);

      if (sev >= "moderate") {
        let barStart = 1;
        let barEnd = p1End;
        // Bar1 若仅为反向小棒，趋势段从 Bar2 起（阿布：非 trend bar 不算尖峰的一部分）
        const b0 = bars[0]!;
        const b0Sev = moveSeverity(Math.abs(barDelta(b0)), totalRange, medR);
        if (
          p1End >= 2 &&
          b0Sev < "moderate" &&
          ((isDrop && isBull(b0)) || (!isDrop && isBear(b0)))
        ) {
          barStart = 2;
        }
        const segBars = bars.slice(barStart - 1, barEnd);
        const segMove = segBars[segBars.length - 1]!.close - (barStart === 1 ? open0 : segBars[0]!.open);
        const { trendBear, trendBull } = countStrength(segBars, medR);
        phases.push({
          kind: isDrop ? "opening_drop" : "opening_rally",
          label: phaseTitleOpening(sev, isDrop ? "down" : "up"),
          barStart,
          barEnd,
          pattern: severityLabel(sev, isDrop ? "down" : "up"),
          characteristics: `棒 ${barStart}–${barEnd}：${fmtLevel(barStart === 1 ? open0 : segBars[0]!.open, ctx)} → ${fmtLevel(segBars[segBars.length - 1]!.close, ctx)} ${fmtMove(segMove, ctx)} · 趋势阴${trendBear}/阳${trendBull}`,
        });
        cursor = barEnd;
      }
    }
  }

  // Phase B: V reversal — only after meaningful opening leg
  const lastPhase = phases[phases.length - 1];
  if (lastPhase && cursor > 0 && cursor < n) {
    const isDropOpen = lastPhase.kind === "opening_drop";
    const openSlice = bars.slice(0, cursor);
    const phaseExtreme = isDropOpen
      ? Math.min(...openSlice.map((b) => b.low))
      : Math.max(...openSlice.map((b) => b.high));
    const priorMag = isDropOpen ? open0 - phaseExtreme : phaseExtreme - open0;

    let p2End = cursor;
    for (let i = cursor; i < Math.min(cursor + 6, n); i++) {
      const recovered = isDropOpen
        ? bars[i]!.close - phaseExtreme
        : phaseExtreme - bars[i]!.close;
      const str = classifyBarStrength(bars[i]!, medR);
      const trendRecovery =
        (isDropOpen && (str === "trend_bull" || str === "weak_bull")) ||
        (!isDropOpen && (str === "trend_bear" || str === "weak_bear"));
      if (recovered >= priorMag * 0.4 && trendRecovery) {
        p2End = i + 1;
      } else if (p2End > cursor) {
        break;
      }
    }

    if (p2End > cursor && moveSeverity(priorMag, totalRange, medR) >= "moderate") {
      const p2Bars = bars.slice(cursor, p2End);
      const p2Move = p2Bars[p2Bars.length - 1]!.close - p2Bars[0]!.open;
      const recoverPct = priorMag > 0 ? Math.min(100, (Math.abs(p2Move) / priorMag) * 100) : 0;
      phases.push({
        kind: isDropOpen ? "v_reversal_up" : "v_reversal_down",
        label: isDropOpen ? "⬆ V 形反转向上" : "⬇ V 形反转向下",
        barStart: cursor + 1,
        barEnd: p2End,
        pattern:
          recoverPct >= 85
            ? "收复前段跌幅"
            : recoverPct >= 50
              ? "部分收复 · 反弹腿"
              : "弱反弹 / 仍可能 TR",
        characteristics: `棒 ${cursor + 1}–${p2End}：${fmtLevel(p2Bars[0]!.open, ctx)} → ${fmtLevel(p2Bars[p2Bars.length - 1]!.close, ctx)} ${fmtMove(p2Move, ctx)} · 收复约 ${recoverPct.toFixed(0)}%`,
      });
      cursor = p2End;
    }
  }

  // Phase C: trend leg — net + trend bar count, not slope alone
  if (cursor < n - 2) {
    let p3End = cursor;
    const legStart = cursor;
    for (let i = legStart; i < Math.min(legStart + 9, n - 2); i++) {
      const chunk = bars.slice(legStart, i + 1);
      const overlap = overlapRate(chunk);
      const net = chunk[chunk.length - 1]!.close - chunk[0]!.open;
      const { trendBull, trendBear } = countStrength(chunk, medR);
      const netSev = moveSeverity(Math.abs(net), totalRange, medR);
      const trending =
        netSev >= "moderate" &&
        overlap < 0.52 &&
        (Math.abs(trendBull - trendBear) >= 1 || netSev >= "strong");
      if (trending) p3End = i + 1;
      else if (p3End > legStart + 2) break;
    }
    if (p3End <= legStart) {
      p3End = Math.min(legStart + Math.max(3, Math.floor((n - legStart) / 2)), n - 1);
    }

    const p3Bars = bars.slice(legStart, p3End);
    if (p3Bars.length >= 2) {
      const net = p3Bars[p3Bars.length - 1]!.close - p3Bars[0]!.open;
      const { trendBull, trendBear } = countStrength(p3Bars, medR);
      const overlap = overlapRate(p3Bars);
      const netSev = moveSeverity(Math.abs(net), totalRange, medR);
      const bulls = p3Bars.filter(isBull).length;
      const bears = p3Bars.length - bulls;

      let kind: BrooksOpeningPhaseKind = "tr_neutral";
      let label = "↔ 重叠 / 震荡";
      let pattern = "无明显趋势腿";

      if (overlap > 0.48 && netSev < "moderate") {
        kind = "tr_neutral";
        label = "↔ 重叠震荡";
        pattern = "TR 式重叠棒";
      } else if (net > medR * 0.4 || trendBull > trendBear + 1) {
        kind = "strong_bull_leg";
        label = netSev >= "strong" ? "🔥 强牛腿" : "多头腿";
        pattern =
          netSev >= "spike"
            ? "趋势阳线为主 / 尖峰拉升"
            : netSev >= "strong"
              ? "趋势阳线为主 / 清晰上行"
              : "小幅上行 · 混合棒";
      } else if (net < -medR * 0.4 || trendBear > trendBull + 1) {
        kind = "strong_bear_leg";
        label = netSev >= "strong" ? "🔥 强熊腿" : "空头腿";
        pattern =
          netSev >= "spike"
            ? "趋势阴线为主 / 尖峰下压"
            : netSev >= "strong"
              ? "趋势阴线为主 / 清晰下行"
              : "小幅下行 · 混合棒";
      } else {
        kind = "tr_neutral";
        label = "↔ 双向震荡";
        pattern = `${bulls}阳/${bears}阴 · 净变动不大`;
      }

      const legHigh = Math.max(...p3Bars.map((b) => b.high));
      const legLow = Math.min(...p3Bars.map((b) => b.low));
      phases.push({
        kind,
        label,
        barStart: legStart + 1,
        barEnd: p3End,
        pattern,
        characteristics: `棒 ${legStart + 1}–${p3End}：${fmtLevel(legLow, ctx)} → ${fmtLevel(legHigh, ctx)} ${fmtMove(net, ctx)} · ${bulls}阳/${bears}阴 · 趋势阳${trendBull}/阴${trendBear}`,
      });
      cursor = p3End;
    }
  }

  // Phase D: TR tail
  const p4Bars = bars.slice(cursor);
  if (p4Bars.length >= 2) {
    const lh = lowerHighsScore(p4Bars);
    const hl = higherLowsScore(p4Bars);
    const last3 = p4Bars.slice(-3);
    const last3Low = last3.length === 3 && last3.every(closeNearLow);
    const last3High = last3.length === 3 && last3.every(closeNearHigh);

    let kind: BrooksOpeningPhaseKind = "tr_neutral";
    let label = "↔ TR 区间";
    let pattern = "重叠 / 横盘";
    if (lh >= 0.45) {
      kind = "tr_lh";
      label = "↔ TR 区 (Lower Highs)";
      pattern = "重叠棒 + 高点逐级降低";
    } else if (hl >= 0.45) {
      kind = "tr_hl";
      label = "↔ TR 区 (Higher Lows)";
      pattern = "重叠棒 + 低点逐级抬高";
    } else if (last3Low) {
      kind = "bear_breakout_tail";
      label = "⬇ 熊突破尾段";
      pattern = "连收低位趋势棒";
    } else if (last3High) {
      kind = "bull_breakout_tail";
      label = "⬆ 牛突破尾段";
      pattern = "连收高位趋势棒";
    }

    const highs = localHighs(p4Bars).slice(0, 4).map((h) => fmtLevel(h, ctx));
    phases.push({
      kind,
      label,
      barStart: cursor + 1,
      barEnd: n,
      pattern,
      characteristics:
        highs.length >= 2
          ? `棒 ${cursor + 1}–${n}：高点 ${highs.join(" → ")}，收 ${fmtLevel(p4Bars[p4Bars.length - 1]!.close, ctx)}`
          : `棒 ${cursor + 1}–${n}：收 ${fmtLevel(p4Bars[p4Bars.length - 1]!.close, ctx)}`,
    });
  }

  // Bar1 若仅为小阴/小阳，在首段注明（阿布：非 trend bar 不叫急跌/尖峰）
  if (phases.length) {
    const b0 = bars[0]!;
    const b0Move = b0.close - b0.open;
    const b0Sev = moveSeverity(Math.abs(b0Move), totalRange, medR);
    const hasOpeningFromBar1 =
      phases.some(
        (p) =>
          (p.kind === "opening_drop" || p.kind === "opening_rally") &&
          p.barStart === 1,
      );
    if (!hasOpeningFromBar1 && (b0Sev === "flat" || b0Sev === "minor")) {
      const b0Str = classifyBarStrength(b0, medR);
      const hint =
        b0Str === "doji"
          ? "Bar 1 震荡棒 · 无趋势"
          : isBear(b0)
            ? `Bar 1 小阴线 ${fmtMove(b0Move, ctx)} · 非抛售尖峰`
            : `Bar 1 小阳线 ${fmtMove(b0Move, ctx)} · 非买入尖峰`;
      phases[0]!.characteristics = `${hint} → ${phases[0]!.characteristics}`;
    }
  }

  return phases;
}

function detectEngulfRecovery(bars: OhlcBar[]): boolean {
  if (bars.length < 5) return false;
  const deltas = bars.map(barDelta);
  const avgR = bars.reduce((s, b) => s + barRange(b), 0) / bars.length;
  let worstBearIdx = -1;
  let worstBear = 0;
  for (let i = 0; i < Math.min(8, bars.length); i++) {
    if (deltas[i]! < worstBear) {
      worstBear = deltas[i]!;
      worstBearIdx = i;
    }
  }
  if (worstBearIdx < 0 || worstBear > -avgR * 1.1) return false;
  let bullSum = 0;
  for (let i = worstBearIdx + 1; i < Math.min(worstBearIdx + 5, bars.length); i++) {
    if (deltas[i]! > 0) bullSum += deltas[i]!;
  }
  return bullSum >= Math.abs(worstBear) * 0.85;
}

function classifyOpening(
  bars: OhlcBar[],
  phases: BrooksOpeningPhase[],
  metrics: {
    bullCount: number;
    bearCount: number;
    netChange: number;
    totalRange: number;
    closePosition: number;
    trLhScore: number;
    last3CloseLow: boolean;
    last3CloseHigh: boolean;
  },
): OpeningClassification {
  const n = bars.length;
  const phaseKinds = phases.map((p) => p.kind);
  const balanced = Math.abs(metrics.bullCount - metrics.bearCount) <= 2;
  const smallNet = Math.abs(metrics.netChange) < metrics.totalRange * 0.25;

  if (phaseKinds.includes("bear_breakout_tail") || (metrics.last3CloseLow && metrics.closePosition < 0.42)) {
    return "tr_open_bear_breakout";
  }
  if (phaseKinds.includes("bull_breakout_tail") || (metrics.last3CloseHigh && metrics.closePosition > 0.58)) {
    return "tr_open_bull_breakout";
  }
  if (phaseKinds.includes("tr_lh") || metrics.trLhScore >= 0.4) {
    return "tr_open_lower_highs";
  }
  if (balanced && smallNet && (phaseKinds.includes("tr_neutral") || phaseKinds.includes("tr_lh") || phaseKinds.includes("tr_hl"))) {
    return "two_sided_opening_range";
  }

  const early = bars.slice(0, Math.min(6, n));
  const earlySlope = linregSlope(early.map((b) => b.close));
  const avgR = bars.reduce((s, b) => s + barRange(b), 0) / n;
  if (earlySlope > avgR * 0.08 && metrics.bullCount > metrics.bearCount + 2) {
    return "bull_trend_from_open";
  }
  if (earlySlope < -avgR * 0.08 && metrics.bearCount > metrics.bullCount + 2) {
    return "bear_trend_from_open";
  }
  if (balanced) return "two_sided_opening_range";
  return "mixed";
}

function buildBrooksElements(
  bars: OhlcBar[],
  phases: BrooksOpeningPhase[],
  metrics: {
    totalRange: number;
    closePosition: number;
    trLhScore: number;
    last3CloseLow: boolean;
    engulfRecovery: boolean;
  },
  ctx: FormatCtx,
): BrooksElementRow[] {
  const rows: BrooksElementRow[] = [];
  const n = bars.length;

  const drop = phases.find((p) => p.kind === "opening_drop");
  if (drop) {
    rows.push({
      element: "开盘先跌",
      elementEn: "Open with a drop",
      detail: drop.characteristics,
    });
  }

  const rally = phases.find((p) => p.kind === "opening_rally");
  if (rally) {
    rows.push({
      element: "开盘先涨",
      elementEn: "Open with a rally",
      detail: rally.characteristics,
    });
  }

  const vUp = phases.find((p) => p.kind === "v_reversal_up");
  const leg = phases.find((p) => p.kind === "strong_bull_leg" || p.kind === "strong_bear_leg");
  if (vUp && leg) {
    rows.push({
      element: "V 形反弹进入 TR / 牛腿",
      elementEn: "V-shape reversal into TR / bull leg",
      detail: `棒 ${vUp.barStart}–${leg.barEnd}：${vUp.pattern} + ${leg.label}`,
    });
  }

  const vDown = phases.find((p) => p.kind === "v_reversal_down");
  if (vDown && leg) {
    rows.push({
      element: "V 形回落进入 TR / 熊腿",
      elementEn: "V-shape reversal into TR / bear leg",
      detail: `棒 ${vDown.barStart}–${leg.barEnd}：${vDown.pattern} + ${leg.label}`,
    });
  }

  const trLh = phases.find((p) => p.kind === "tr_lh");
  if (trLh) {
    rows.push({
      element: "TR 内形成 Lower Highs",
      elementEn: "Lower highs within TR",
      detail: trLh.characteristics,
    });
  }

  const tr = phases.find((p) => p.kind === "tr_lh" || p.kind === "tr_hl" || p.kind === "tr_neutral");
  if (tr) {
    const midLabel = metrics.closePosition < 0.45 ? "中位偏下" : metrics.closePosition > 0.55 ? "中位偏上" : "接近中位";
    rows.push({
      element: "TR 范围内等待双向突破",
      elementEn: "Waiting for breakout within TR",
      detail: `${fmtRangeSpan(metrics.totalRange, ctx)}，收盘在${midLabel} (${(metrics.closePosition * 100).toFixed(0)}%)`,
    });
  }

  if (metrics.last3CloseLow) {
    rows.push({
      element: "最后往往是 Bear Breakout",
      elementEn: "Often ends in bear breakout",
      detail: `棒 ${Math.max(1, n - 2)}–${n}：最后 3 根 K 线连收低位`,
    });
  } else if (phases.some((p) => p.kind === "bear_breakout_tail")) {
    rows.push({
      element: "熊突破尾段",
      elementEn: "Bear breakout tail",
      detail: phases.find((p) => p.kind === "bear_breakout_tail")!.characteristics,
    });
  }

  if (metrics.engulfRecovery) {
    rows.push({
      element: "大阴被后续阳线吞没",
      elementEn: "Big bear bar engulfed by bulls",
      detail: "中段最大阴线幅度被后续连续阳线收复",
    });
  }

  return rows;
}

function buildSignature(
  bars: OhlcBar[],
  phases: BrooksOpeningPhase[],
  classification: OpeningClassification,
  metrics: {
    bullCount: number;
    bearCount: number;
    totalRange: number;
    closePosition: number;
    trLhScore: number;
    last3CloseLow: boolean;
    last3CloseHigh: boolean;
    engulfRecovery: boolean;
  },
): BrooksSignature {
  const n = bars.length;
  const phaseKinds = phases.map((p) => p.kind);
  const open0 = bars[0]!.open;
  const p1 = phases[0];
  const p1Move = p1 ? Math.abs(bars[p1.barEnd - 1]!.close - open0) : 0;

  let vRecovery = 0;
  const vPhase = phases.find((p) => p.kind === "v_reversal_up" || p.kind === "v_reversal_down");
  if (vPhase && p1) {
    const dropMag = Math.abs(bars[p1.barEnd - 1]!.close - open0);
    const vMove = Math.abs(bars[vPhase.barEnd - 1]!.close - bars[vPhase.barStart - 1]!.open);
    vRecovery = dropMag > 0 ? Math.min(1.5, vMove / dropMag) : 0;
  }

  const leg = phases.find((p) => p.kind === "strong_bull_leg" || p.kind === "strong_bear_leg");
  let legExt = 0;
  if (leg && metrics.totalRange > 0) {
    const legBars = bars.slice(leg.barStart - 1, leg.barEnd);
    legExt = (Math.max(...legBars.map((b) => b.high)) - Math.min(...legBars.map((b) => b.low))) / metrics.totalRange;
  }

  return {
    classification,
    phaseKinds,
    hasOpeningDrop: phaseKinds.includes("opening_drop"),
    hasOpeningRally: phaseKinds.includes("opening_rally"),
    hasVReversalUp: phaseKinds.includes("v_reversal_up"),
    hasVReversalDown: phaseKinds.includes("v_reversal_down"),
    hasStrongBullLeg: phaseKinds.includes("strong_bull_leg"),
    hasStrongBearLeg: phaseKinds.includes("strong_bear_leg"),
    hasTrLowerHighs: phaseKinds.includes("tr_lh"),
    hasTrHigherLows: phaseKinds.includes("tr_hl"),
    last3CloseLow: metrics.last3CloseLow,
    last3CloseHigh: metrics.last3CloseHigh,
    closeBelowMidpoint: metrics.closePosition < 0.45,
    closeAboveMidpoint: metrics.closePosition > 0.55,
    bullBearBalance: n > 0 ? metrics.bullCount / n : 0.5,
    openDropRatio: metrics.totalRange > 0 ? p1Move / metrics.totalRange : 0,
    vRecoveryRatio: vRecovery,
    legExtensionRatio: legExt,
    trLhScore: metrics.trLhScore,
    engulfRecovery: metrics.engulfRecovery,
    closePosition: metrics.closePosition,
  };
}

export function barColumnsToOhlc(bars: BarColumn[]): OhlcBar[] {
  const valid = bars.filter((b) => b.valid);
  if (!valid.length) return [];
  const maxLow = Math.max(...valid.map((b) => b.low));
  const inv = (y: number) => maxLow - y;
  return valid.map((b) => ({
    open: inv(b.open),
    high: inv(b.high),
    low: inv(b.low),
    close: inv(b.close),
  }));
}

export function shapePolarityToStructureBars(shape: number[], polarity: number[]): OhlcBar[] {
  const bodyFrac = 0.035;
  return shape.map((closeNorm, i) => {
    const pol = polarity[i] ?? 0;
    const body = pol === 0 ? bodyFrac * 0.45 : bodyFrac;
    const open = pol >= 0 ? closeNorm - body : closeNorm + body;
    const tail = bodyFrac * 0.35;
    const hi = Math.min(1, Math.max(open, closeNorm) + tail);
    const lo = Math.max(0, Math.min(open, closeNorm) - tail);
    return { open, high: hi, low: lo, close: closeNorm };
  });
}

/** @deprecated 仅保留兼容；slide 侧请用 analyzeSlideStructure */
export function shapePolarityToOhlc(shape: number[], polarity: number[]): OhlcBar[] {
  return shapePolarityToStructureBars(shape, polarity);
}

/** 百科 slide：从离线 shape/polarity 做相对结构分析（非市场报价） */
export function analyzeSlideStructure(shape: number[], polarity: number[]): OpeningBarsBrooksAnalysis {
  return analyzeOpeningBars(shapePolarityToStructureBars(shape, polarity), {
    mode: "slide_structure",
  });
}

export function analyzeOpeningBars(
  bars: OhlcBar[],
  options?: { mode?: BrooksDataMode },
): OpeningBarsBrooksAnalysis {
  const dataMode = options?.mode ?? "live_ohlc";
  const n = bars.length;
  const open = bars[0]?.open ?? 0;
  const close = bars[n - 1]?.close ?? 0;
  const rangeHigh = Math.max(...bars.map((b) => b.high));
  const rangeLow = Math.min(...bars.map((b) => b.low));
  const totalRange = Math.max(1e-9, rangeHigh - rangeLow);
  const netChange = close - open;
  const netChangePct =
    dataMode === "slide_structure"
      ? totalRange > 0
        ? (netChange / totalRange) * 100
        : 0
      : open !== 0
        ? (netChange / open) * 100
        : 0;
  const bullCount = bars.filter(isBull).length;
  const bearCount = n - bullCount;
  const closeNearHighCount = bars.filter(closeNearHigh).length;
  const closeNearLowCount = bars.filter(closeNearLow).length;
  const closePosition = (close - rangeLow) / totalRange;

  let largestBullBar: { index: number; points: number } | null = null;
  let largestBearBar: { index: number; points: number } | null = null;
  bars.forEach((b, i) => {
    const d = barDelta(b);
    if (d > 0 && (!largestBullBar || d > largestBullBar.points)) {
      largestBullBar = { index: i + 1, points: d };
    }
    if (d < 0 && (!largestBearBar || d < largestBearBar.points)) {
      largestBearBar = { index: i + 1, points: d };
    }
  });

  const ctx: FormatCtx = { mode: dataMode, totalRange };

  const phases = segmentBrooksPhases(bars, ctx);
  const trBars = phases.find((p) => p.barStart > n / 2)
    ? bars.slice((phases.find((p) => p.kind.startsWith("tr_") || p.kind.includes("breakout"))?.barStart ?? Math.floor(n / 2)) - 1)
    : bars.slice(Math.floor(n / 2));
  const trLhScore = lowerHighsScore(trBars.length >= 3 ? trBars : bars.slice(-Math.min(9, n)));
  const last3 = bars.slice(-3);
  const last3CloseLow = last3.length === 3 && last3.every(closeNearLow);
  const last3CloseHigh = last3.length === 3 && last3.every(closeNearHigh);
  const engulfRecovery = detectEngulfRecovery(bars);

  const classification = classifyOpening(bars, phases, {
    bullCount,
    bearCount,
    netChange,
    totalRange,
    closePosition,
    trLhScore,
    last3CloseLow,
    last3CloseHigh,
  });

  const brooksElements = buildBrooksElements(bars, phases, {
    totalRange,
    closePosition,
    trLhScore,
    last3CloseLow,
    engulfRecovery,
  }, ctx);

  const signature = buildSignature(bars, phases, classification, {
    bullCount,
    bearCount,
    totalRange,
    closePosition,
    trLhScore,
    last3CloseLow,
    last3CloseHigh,
    engulfRecovery,
  });

  const phaseSig = phases.map((p) => p.kind).join(" → ");
  const classificationLabel = CLASSIFICATION_LABELS[classification];

  const summary =
    dataMode === "slide_structure"
      ? `${classificationLabel} · 阳${bullCount}/阴${bearCount} · 相对结构（非报价）`
      : `${classificationLabel} · 阳${bullCount}/阴${bearCount} · ${fmtMove(netChange, ctx)} · ${fmtRangeSpan(totalRange, ctx)}`;

  return {
    barCount: n,
    open,
    close,
    netChange,
    netChangePct,
    rangeHigh,
    rangeLow,
    totalRange,
    bullCount,
    bearCount,
    closeNearHighCount,
    closeNearLowCount,
    largestBullBar,
    largestBearBar,
    closePosition,
    classification,
    classificationLabel,
    phases,
    brooksElements,
    phaseSig,
    signature,
    summary,
    dataMode,
  };
}

function boolMatch(a: boolean, b: boolean): number {
  return a === b ? 1 : 0;
}

function numSim(a: number, b: number, tol: number): number {
  return Math.max(0, 1 - Math.abs(a - b) / tol);
}

const COMPATIBLE_PHASE: Partial<Record<BrooksOpeningPhaseKind, BrooksOpeningPhaseKind[]>> = {
  opening_drop: ["opening_drop", "bear_leg" as BrooksOpeningPhaseKind],
  opening_rally: ["opening_rally"],
  v_reversal_up: ["v_reversal_up", "strong_bull_leg"],
  v_reversal_down: ["v_reversal_down", "strong_bear_leg"],
  strong_bull_leg: ["strong_bull_leg", "v_reversal_up", "bull_breakout_tail"],
  strong_bear_leg: ["strong_bear_leg", "v_reversal_down", "bear_breakout_tail"],
  tr_lh: ["tr_lh", "tr_neutral", "bear_breakout_tail"],
  tr_hl: ["tr_hl", "tr_neutral", "bull_breakout_tail"],
  tr_neutral: ["tr_neutral", "tr_lh", "tr_hl"],
  bear_breakout_tail: ["bear_breakout_tail", "tr_lh", "strong_bear_leg"],
  bull_breakout_tail: ["bull_breakout_tail", "tr_hl", "strong_bull_leg"],
};

function phaseSequenceBrooksScore(a: BrooksOpeningPhaseKind[], b: BrooksOpeningPhaseKind[]): number {
  if (!a.length || !b.length) return 0;
  let qi = 0;
  let matched = 0;
  for (const sk of b) {
    while (qi < a.length) {
      const qk = a[qi]!;
      if (qk === sk || COMPATIBLE_PHASE[qk]?.includes(sk)) {
        matched++;
        qi++;
        break;
      }
      qi++;
    }
  }
  const order = matched / a.length;
  const setA = new Set(a);
  const setB = new Set(b);
  let key = 0;
  for (const k of setA) {
    if (setB.has(k)) key += 1;
    else {
      for (const sk of setB) {
        if (COMPATIBLE_PHASE[k]?.includes(sk)) {
          key += 0.65;
          break;
        }
      }
    }
  }
  const keyScore = setA.size > 0 ? key / setA.size : 0;
  return Math.min(1, order * 0.55 + keyScore * 0.45);
}

const COMPATIBLE_CLASS: Partial<Record<OpeningClassification, OpeningClassification[]>> = {
  two_sided_opening_range: ["two_sided_opening_range", "tr_open_lower_highs", "tr_open_bear_breakout", "tr_open_bull_breakout"],
  tr_open_lower_highs: ["tr_open_lower_highs", "two_sided_opening_range", "tr_open_bear_breakout"],
  tr_open_bear_breakout: ["tr_open_bear_breakout", "tr_open_lower_highs", "two_sided_opening_range"],
  tr_open_bull_breakout: ["tr_open_bull_breakout", "tr_open_lower_highs", "two_sided_opening_range"],
  bull_trend_from_open: ["bull_trend_from_open", "tr_open_bull_breakout"],
  bear_trend_from_open: ["bear_trend_from_open", "tr_open_bear_breakout"],
  mixed: ["mixed", "two_sided_opening_range"],
};

/** 0–100 Brooks-style structural match */
export function compareBrooksOpeningAnalysis(
  query: OpeningBarsBrooksAnalysis,
  slide: OpeningBarsBrooksAnalysis,
): { score: number; phaseScore: number; reasons: string[]; cautions: string[] } {
  const qs = query.signature;
  const ss = slide.signature;
  const reasons: string[] = [];
  const cautions: string[] = [];

  if (query.dataMode !== slide.dataMode) {
    cautions.push("查询侧为 FMP 真实报价，百科侧为 slide 相对结构；比对仅基于结构特征（阶段/比例）");
  }

  const phaseScore = phaseSequenceBrooksScore(qs.phaseKinds, ss.phaseKinds);

  let classScore = 0;
  if (qs.classification === ss.classification) classScore = 1;
  else if (COMPATIBLE_CLASS[qs.classification]?.includes(ss.classification)) classScore = 0.72;
  else if (COMPATIBLE_CLASS[ss.classification]?.includes(qs.classification)) classScore = 0.55;
  else classScore = 0.15;

  const elementScore =
    (boolMatch(qs.hasOpeningDrop, ss.hasOpeningDrop) +
      boolMatch(qs.hasOpeningRally, ss.hasOpeningRally) +
      boolMatch(qs.hasVReversalUp, ss.hasVReversalUp) +
      boolMatch(qs.hasVReversalDown, ss.hasVReversalDown) +
      boolMatch(qs.hasStrongBullLeg, ss.hasStrongBullLeg) +
      boolMatch(qs.hasStrongBearLeg, ss.hasStrongBearLeg) +
      boolMatch(qs.hasTrLowerHighs, ss.hasTrLowerHighs) +
      boolMatch(qs.hasTrHigherLows, ss.hasTrHigherLows) +
      boolMatch(qs.last3CloseLow, ss.last3CloseLow) +
      boolMatch(qs.last3CloseHigh, ss.last3CloseHigh) +
      boolMatch(qs.closeBelowMidpoint, ss.closeBelowMidpoint) +
      boolMatch(qs.engulfRecovery, ss.engulfRecovery)) /
    12;

  const balanceScore = numSim(qs.bullBearBalance, ss.bullBearBalance, 0.35);
  const closePosScore = numSim(qs.closePosition, ss.closePosition, 0.45);
  const dropScore = numSim(qs.openDropRatio, ss.openDropRatio, 0.35);
  const vScore = numSim(qs.vRecoveryRatio, ss.vRecoveryRatio, 0.6);
  const lhScore = numSim(qs.trLhScore, ss.trLhScore, 0.5);
  const legScore = numSim(qs.legExtensionRatio, ss.legExtensionRatio, 0.45);

  let score = 0;
  score += phaseScore * 32;
  score += classScore * 22;
  score += elementScore * 24;
  score += balanceScore * 6;
  score += closePosScore * 5;
  score += dropScore * 4;
  score += vScore * 3;
  score += lhScore * 2;
  score += legScore * 2;

  if (Math.abs(query.bullCount - slide.bullCount) <= 2) score += 3;
  if (qs.hasOpeningDrop && ss.hasOpeningDrop && qs.hasVReversalUp && ss.hasVReversalUp) score += 5;
  if (qs.hasTrLowerHighs && ss.hasTrLowerHighs) score += 4;
  if (qs.last3CloseLow && ss.last3CloseLow) score += 3;

  if (classScore >= 0.7) {
    reasons.push(`开盘分类一致：${query.classificationLabel}`);
  } else if (classScore >= 0.5) {
    reasons.push(`开盘分类相近：${query.classification} ↔ ${slide.classification}`);
  }

  if (phaseScore >= 0.55) {
    reasons.push(`四段叙事一致 ${(phaseScore * 100).toFixed(0)}%：${query.phaseSig}`);
  }

  if (qs.hasOpeningDrop && ss.hasOpeningDrop) reasons.push("均有「开盘先跌」");
  if (qs.hasVReversalUp && ss.hasVReversalUp) reasons.push("均有 V 形反弹");
  if (qs.hasTrLowerHighs && ss.hasTrLowerHighs) reasons.push("均有 TR 内 Lower Highs");
  if (qs.last3CloseLow && ss.last3CloseLow) reasons.push("尾段均连收低位（熊突破倾向）");
  if (qs.engulfRecovery && ss.engulfRecovery) reasons.push("均有「大阴被阳线吞没」结构");

  if (classScore < 0.5 && phaseScore < 0.4) {
    cautions.push("开盘分类与四段叙事均差异较大，请人工对照 slide 文字说明");
    score = Math.min(score, 35);
  }

  if (qs.hasOpeningDrop !== ss.hasOpeningDrop && qs.hasVReversalUp !== ss.hasVReversalUp) {
    score = Math.min(score, 28);
    cautions.push("开盘/V 反转结构不一致");
  }

  return {
    score: Math.min(100, Math.round(score)),
    phaseScore,
    reasons,
    cautions,
  };
}

export function formatBrooksOpeningReadout(a: OpeningBarsBrooksAnalysis): string {
  const ctx: FormatCtx = { mode: a.dataMode, totalRange: a.totalRange };
  const sourceLine =
    a.dataMode === "slide_structure"
      ? "【数据来源】百科 slide 相对结构（shape 路径 0–100%，非 ES/NVDA 等真实报价）"
      : "【数据来源】FMP 真实 OHLC";

  const lines = [
    sourceLine,
    `【判定】${a.classificationLabel}`,
  ];

  if (a.dataMode === "slide_structure") {
    lines.push(
      `【指标】路径起点 ${fmtLevel(a.open, ctx)} · 终点 ${fmtLevel(a.close, ctx)} · 净 ${fmtMove(a.netChange, ctx)}`,
      `区间 ${fmtLevel(a.rangeLow, ctx)} – ${fmtLevel(a.rangeHigh, ctx)} · ${fmtRangeSpan(a.totalRange, ctx)} · 阳/阴 ${a.bullCount}:${a.bearCount}`,
    );
  } else {
    lines.push(
      `【指标】开盘 ${fmtLevel(a.open, ctx)} · ${a.barCount}根后收 ${fmtLevel(a.close, ctx)} · 净 ${fmtMove(a.netChange, ctx)} (${a.netChangePct >= 0 ? "+" : ""}${a.netChangePct.toFixed(3)}%)`,
      `区间 ${fmtLevel(a.rangeLow, ctx)} – ${fmtLevel(a.rangeHigh, ctx)} · ${fmtRangeSpan(a.totalRange, ctx)} · 阳/阴 ${a.bullCount}:${a.bearCount}`,
    );
  }

  lines.push(
    `收近高 ${a.closeNearHighCount} 根 · 收近低 ${a.closeNearLowCount} 根 · 收盘位置 ${(a.closePosition * 100).toFixed(0)}%`,
  );
  if (a.largestBullBar) {
    lines.push(`最大阳线：Bar ${a.largestBullBar.index} (${fmtMove(a.largestBullBar.points, ctx)})`);
  }
  if (a.largestBearBar) {
    lines.push(`最大阴线：Bar ${a.largestBearBar.index} (${fmtMove(a.largestBearBar.points, ctx)})`);
  }
  lines.push("", "【18 根 K 线逐根拆解】");
  for (const ph of a.phases) {
    lines.push(`· 棒 ${ph.barStart}–${ph.barEnd} ${ph.label}`);
    lines.push(`  形态：${ph.pattern}`);
    lines.push(`  特征：${ph.characteristics}`);
  }
  if (a.brooksElements.length) {
    lines.push("", "【Brooks 元素对照】");
    for (const row of a.brooksElements) {
      lines.push(`· ${row.element}：${row.detail}`);
    }
  }
  return lines.join("\n");
}

export type BrooksElementAlignment = {
  element: string;
  elementEn: string;
  queryDetail: string;
  slideDetail: string;
  matched: boolean;
};

export function buildBrooksElementAlignments(
  query: OpeningBarsBrooksAnalysis,
  slide: OpeningBarsBrooksAnalysis,
): BrooksElementAlignment[] {
  const rows: BrooksElementAlignment[] = [];
  const used = new Set<number>();

  for (const qe of query.brooksElements) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < slide.brooksElements.length; i++) {
      if (used.has(i)) continue;
      const se = slide.brooksElements[i]!;
      const score =
        qe.elementEn === se.elementEn
          ? 1
          : qe.element.includes(se.element.slice(0, 2))
            ? 0.6
            : 0;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const se = best >= 0 ? slide.brooksElements[best] : null;
    if (se && bestScore >= 0.5) used.add(best);
    rows.push({
      element: qe.element,
      elementEn: qe.elementEn,
      queryDetail: qe.detail,
      slideDetail: se?.detail ?? "百科页未检出对应元素",
      matched: !!se && bestScore >= 0.5,
    });
  }

  for (let i = 0; i < slide.brooksElements.length; i++) {
    if (used.has(i)) continue;
    const se = slide.brooksElements[i]!;
    rows.push({
      element: se.element,
      elementEn: se.elementEn,
      queryDetail: "查询段未检出",
      slideDetail: se.detail,
      matched: false,
    });
  }

  return rows;
}
