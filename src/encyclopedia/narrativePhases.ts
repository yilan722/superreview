import type { BarColumn } from "./barSeries";

export type PhaseKind =
  | "bear_spike"
  | "bull_spike"
  | "bear_leg"
  | "bull_leg"
  | "tr"
  | "tr_lower_highs"
  | "tr_higher_lows"
  | "bear_breakout"
  | "bull_breakout"
  | "v_reversal_up"
  | "v_reversal_down";

export interface NarrativePhase {
  kind: PhaseKind;
  label: string;
  labelEn: string;
  barStart: number;
  barEnd: number;
  summary: string;
}

const PHASE_META: Record<
  PhaseKind,
  { label: string; labelEn: string; brooksElement: string }
> = {
  bear_spike: {
    label: "熊市尖峰 / 大阴跌",
    labelEn: "Bear spike",
    brooksElement: "Sharp bear spike / sell climax",
  },
  bull_spike: {
    label: "牛市尖峰 / 大阳升",
    labelEn: "Bull spike",
    brooksElement: "Sharp bull spike / buy climax",
  },
  bear_leg: {
    label: "空头腿",
    labelEn: "Bear leg",
    brooksElement: "Bear leg (trend bars down)",
  },
  bull_leg: {
    label: "多头腿",
    labelEn: "Bull leg",
    brooksElement: "Bull leg (trend bars up)",
  },
  tr: {
    label: "交易区间 TR",
    labelEn: "Trading range",
    brooksElement: "Trading range (overlap bars)",
  },
  tr_lower_highs: {
    label: "TR 内 Lower Highs",
    labelEn: "TR with lower highs",
    brooksElement: "Lower highs within TR",
  },
  tr_higher_lows: {
    label: "TR 内 Higher Lows",
    labelEn: "TR with higher lows",
    brooksElement: "Higher lows within TR",
  },
  bear_breakout: {
    label: "熊市突破",
    labelEn: "Bear breakout",
    brooksElement: "Bear breakout from TR",
  },
  bull_breakout: {
    label: "牛市突破",
    labelEn: "Bull breakout",
    brooksElement: "Bull breakout from TR",
  },
  v_reversal_up: {
    label: "V 形反转向上",
    labelEn: "V reversal up",
    brooksElement: "V-shaped reversal into bull",
  },
  v_reversal_down: {
    label: "V 形反转向下",
    labelEn: "V reversal down",
    brooksElement: "V-shaped reversal into bear",
  },
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
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function labelSegment(
  bars: BarColumn[],
  height: number,
  globalIdx: number,
): PhaseKind {
  const closes = bars.map((b) => b.close);
  const slope = linregSlope(closes);
  const ranges = bars.map((b) => b.range);
  const medR = median(ranges) || height * 0.04;

  let overlap = 0;
  for (let i = 1; i < closes.length; i++) {
    if (Math.abs(closes[i] - closes[i - 1]) < medR * 0.4) overlap++;
  }
  overlap /= Math.max(1, closes.length - 1);

  let bulls = 0;
  let bears = 0;
  let bigBear = 0;
  let bigBull = 0;
  for (const b of bars) {
    if (b.isBull) bulls++;
    else bears++;
    if (!b.isBull && b.range > medR * 1.45) bigBear++;
    if (b.isBull && b.range > medR * 1.45) bigBull++;
  }
  const n = bars.length;
  const bullR = bulls / Math.max(1, n);
  const bearR = bears / Math.max(1, n);

  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const highSlope = linregSlope(highs);
  const lowSlope = linregSlope(lows);

  const norm = medR;
  const isLast = globalIdx >= 2;

  if (bigBear >= 2 && slope > norm * 0.15 && bearR > 0.55) {
    return isLast && overlap < 0.35 ? "bear_breakout" : "bear_spike";
  }
  if (bigBull >= 2 && slope < -norm * 0.15 && bullR > 0.55) {
    return isLast && overlap < 0.35 ? "bull_breakout" : "bull_spike";
  }

  if (overlap > 0.48) {
    if (highSlope > norm * 0.04 && lowSlope > norm * 0.02) return "tr_lower_highs";
    if (highSlope < -norm * 0.04 && lowSlope < -norm * 0.02) return "tr_higher_lows";
    return "tr";
  }

  if (slope > norm * 0.1 && bearR > 0.52) return "bear_leg";
  if (slope < -norm * 0.1 && bullR > 0.52) return "bull_leg";

  if (bars.length >= 3) {
    const first = bars.slice(0, Math.ceil(n / 2));
    const second = bars.slice(Math.floor(n / 2));
    const s1 = linregSlope(first.map((b) => b.close));
    const s2 = linregSlope(second.map((b) => b.close));
    if (s1 > norm * 0.12 && s2 < -norm * 0.1) return "v_reversal_up";
    if (s1 < -norm * 0.12 && s2 > norm * 0.1) return "v_reversal_down";
  }

  if (slope > norm * 0.08) return "bear_leg";
  if (slope < -norm * 0.08) return "bull_leg";
  return "tr";
}

function mergeSameKind(phases: NarrativePhase[]): NarrativePhase[] {
  if (!phases.length) return [];
  const out: NarrativePhase[] = [{ ...phases[0] }];
  for (let i = 1; i < phases.length; i++) {
    const prev = out[out.length - 1];
    const cur = phases[i];
    if (prev.kind === cur.kind) {
      prev.barEnd = cur.barEnd;
      prev.summary = `${prev.summary}；${cur.summary}`;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function segmentSummary(kind: PhaseKind, bars: BarColumn[]): string {
  const n = bars.length;
  const bull = bars.filter((b) => b.isBull).length;
  const bear = n - bull;
  const meta = PHASE_META[kind];
  if (kind === "bear_spike" || kind === "bear_breakout") {
    return `${meta.label}：${n} 根，阴线 ${bear} 根，急跌形态`;
  }
  if (kind === "tr" || kind === "tr_lower_highs") {
    return `${meta.label}：${n} 根，重叠/震荡为主`;
  }
  if (kind === "bull_leg") {
    return `${meta.label}：${n} 根，阳线 ${bull} 根`;
  }
  return `${meta.label}：${n} 根 K 线`;
}

export function extractNarrativePhases(
  bars: BarColumn[],
  height: number,
  maxPhases = 5,
): NarrativePhase[] {
  const valid = bars.filter((b) => b.valid);
  if (valid.length < 6) return [];

  const segCount = valid.length >= 24 ? 4 : valid.length >= 14 ? 3 : 2;
  const segLen = Math.max(3, Math.floor(valid.length / segCount));
  const raw: NarrativePhase[] = [];

  for (let s = 0; s < segCount; s++) {
    const start = s * segLen;
    const end = s === segCount - 1 ? valid.length : Math.min(valid.length, (s + 1) * segLen);
    const chunk = valid.slice(start, end);
    if (chunk.length < 2) continue;

    const kind = labelSegment(chunk, height, s);
    const meta = PHASE_META[kind];
    raw.push({
      kind,
      label: meta.label,
      labelEn: meta.labelEn,
      barStart: start + 1,
      barEnd: end,
      summary: segmentSummary(kind, chunk),
    });
  }

  return mergeSameKind(raw).slice(0, maxPhases);
}

/**
 * 固定窗口分段分析：1-18, 19-36, ...（最后一段可不足18）
 */
export function extractFixedChunkPhases(
  bars: BarColumn[],
  height: number,
  chunkSize = 18,
): NarrativePhase[] {
  const valid = bars.filter((b) => b.valid);
  if (valid.length < 3) return [];
  const size = Math.max(6, chunkSize);
  const out: NarrativePhase[] = [];

  for (let start = 0; start < valid.length; start += size) {
    const end = Math.min(valid.length, start + size);
    const chunk = valid.slice(start, end);
    if (chunk.length < 3) continue;
    const segIdx = Math.floor(start / size);
    const kind = labelSegment(chunk, height, segIdx);
    const meta = PHASE_META[kind];
    out.push({
      kind,
      label: meta.label,
      labelEn: meta.labelEn,
      barStart: start + 1,
      barEnd: end,
      summary: segmentSummary(kind, chunk),
    });
  }

  return out;
}

export function phaseSignature(phases: NarrativePhase[]): string {
  return phases.map((p) => p.kind).join(" → ");
}

/** 0–1：阶段叙事顺序相似度 */
export function phaseSequenceScore(
  query: NarrativePhase[],
  slide: NarrativePhase[],
): number {
  if (!query.length || !slide.length) return 0;
  const q = query.map((p) => p.kind);
  const s = slide.map((p) => p.kind);

  const compatible: Record<PhaseKind, PhaseKind[]> = {
    bear_spike: ["bear_spike", "bear_leg", "bear_breakout"],
    bull_spike: ["bull_spike", "bull_leg", "bull_breakout"],
    bear_leg: ["bear_leg", "bear_spike", "bear_breakout"],
    bull_leg: ["bull_leg", "bull_spike", "bull_breakout"],
    tr: ["tr", "tr_lower_highs", "tr_higher_lows"],
    tr_lower_highs: ["tr_lower_highs", "tr"],
    tr_higher_lows: ["tr_higher_lows", "tr"],
    bear_breakout: ["bear_breakout", "bear_spike", "bear_leg"],
    bull_breakout: ["bull_breakout", "bull_spike", "bull_leg"],
    v_reversal_up: ["v_reversal_up", "bull_leg", "tr"],
    v_reversal_down: ["v_reversal_down", "bear_leg", "tr"],
  };

  let qi = 0;
  let matched = 0;
  for (const sk of s) {
    while (qi < q.length) {
      const qk = q[qi];
      if (qk === sk || compatible[qk]?.includes(sk)) {
        matched++;
        qi++;
        break;
      }
      qi++;
    }
  }
  const orderScore = matched / q.length;

  const qSet = new Set(q);
  const sSet = new Set(s);
  let keyMatch = 0;
  let keyTotal = 0;
  for (const k of qSet) {
    keyTotal++;
    if (sSet.has(k)) keyMatch++;
    else {
      for (const sk of sSet) {
        if (compatible[k]?.includes(sk)) {
          keyMatch += 0.6;
          break;
        }
      }
    }
  }
  const keyScore = keyTotal > 0 ? keyMatch / keyTotal : 0;

  return Math.min(1, orderScore * 0.55 + keyScore * 0.45);
}

export interface PhaseAlignmentRow {
  brooksElement: string;
  queryBars: string;
  slideBars: string;
  queryEma: string;
  slideEma: string;
  matched: boolean;
}

function extractEmaLabel(text: string): string {
  if (text.includes("EMA上方")) return "EMA上方";
  if (text.includes("EMA下方")) return "EMA下方";
  if (text.includes("穿越EMA")) return "穿越EMA";
  return "EMA不明";
}

export function buildPhaseAlignments(
  query: NarrativePhase[],
  slide: NarrativePhase[],
): PhaseAlignmentRow[] {
  const rows: PhaseAlignmentRow[] = [];
  const used = new Set<number>();

  for (const qp of query) {
    const meta = PHASE_META[qp.kind];
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < slide.length; i++) {
      if (used.has(i)) continue;
      const sp = slide[i];
      const score =
        qp.kind === sp.kind
          ? 1
          : phaseSequenceScore([qp], [sp]);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const sp = best >= 0 ? slide[best] : null;
    if (sp && bestScore >= 0.5) used.add(best);

    rows.push({
      brooksElement: meta.brooksElement,
      queryBars: `棒 ${qp.barStart}–${qp.barEnd}：${qp.summary}`,
      slideBars: sp
        ? `棒 ${sp.barStart}–${sp.barEnd}：${sp.summary}`
        : "百科页未检出对应阶段",
      queryEma: extractEmaLabel(qp.summary),
      slideEma: sp ? extractEmaLabel(sp.summary) : "未匹配",
      matched: !!sp && bestScore >= 0.5,
    });
  }
  return rows;
}

export { PHASE_META };
