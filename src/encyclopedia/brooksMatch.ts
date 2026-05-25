import { fingerprintFromDataUrl, fingerprintFromThumbUrl } from "./brooksFingerprint";
import type { BrooksFingerprint, BrooksSetup } from "./brooksFingerprint";
import {
  buildPhaseAlignments,
  phaseSequenceScore,
  type PhaseAlignmentRow,
} from "./narrativePhases";
import { MIN_CHART_SLIDE_SCORE } from "./slidePageType";
import { encyclopediaAssetUrl } from "./loadIndex";
import type {
  EncyclopediaIndex,
  EncyclopediaMatch,
  EncyclopediaPageEntry,
  MatchReport,
} from "./types";

/** 达到此分才标「已验证」；低于此分仍会展示，仅作相对最接近 */
export const VERIFIED_BROOKS_SCORE = 55;
export const VERIFIED_PHASE_SCORE = 0.42;
export const LOW_CONFIDENCE_SCORE = 48;

const SETUP_COMPAT: Record<BrooksSetup, BrooksSetup[]> = {
  bear_spike_then_range: [
    "bear_spike_then_range",
    "bear_breakout",
    "trading_range",
    "bear_trend",
  ],
  bull_spike_then_range: [
    "bull_spike_then_range",
    "bull_breakout",
    "trading_range",
    "bull_trend_ail",
  ],
  trading_range: ["trading_range", "bear_spike_then_range", "bull_spike_then_range"],
  bear_breakout: ["bear_breakout", "bear_spike_then_range", "bear_trend"],
  bull_breakout: ["bull_breakout", "bull_spike_then_range", "bull_trend_ail"],
  bear_trend: ["bear_trend", "bear_breakout", "bear_spike_then_range"],
  bull_trend_ail: ["bull_trend_ail", "bull_breakout"],
  channel: ["channel", "trading_range"],
  mixed: ["mixed", "trading_range", "bear_spike_then_range", "bull_spike_then_range"],
  unknown: ["mixed", "trading_range", "bear_spike_then_range"],
};

export interface BrooksMatchResult {
  score: number;
  brooksScore: number;
  phaseScore: number;
  verified: boolean;
  lowConfidence: boolean;
  reasons: string[];
  cautions: string[];
  phaseAlignments: PhaseAlignmentRow[];
}

export function scoreBrooksMatch(
  query: BrooksFingerprint,
  slide: BrooksFingerprint,
): BrooksMatchResult {
  const reasons: string[] = [];
  const cautions: string[] = [];
  const phaseAlignments = buildPhaseAlignments(query.phases, slide.phases);
  let penalty = 0;

  if (slide.slideKind === "title_slide" || slide.slideKind === "divider_slide") {
    penalty += 38;
    cautions.push("章节封面/标题页（参考价值低，仅作相对排序）");
  }

  if (slide.chartScore < MIN_CHART_SLIDE_SCORE) {
    penalty += 22;
    cautions.push(`K 线占比偏低（${(slide.chartScore * 100).toFixed(0)}%）`);
  }

  if (query.scale !== "macro" && slide.scale === "macro") {
    penalty += 32;
    cautions.push("年线/宏观图，与截图周期不符");
  }

  if (slide.setup === "bull_trend_ail" && query.setup === "bear_spike_then_range") {
    penalty += 36;
    cautions.push("百科为 AIL 多头，与空头尖峰+区间相反");
  }

  if (
    query.alwaysIn === "short" &&
    slide.alwaysIn === "long" &&
    slide.setup === "bull_trend_ail"
  ) {
    penalty += 28;
  }

  const phaseScore = phaseSequenceScore(query.phases, slide.phases);
  const compat = SETUP_COMPAT[query.setup] ?? SETUP_COMPAT.mixed;
  const setupOk = compat.includes(slide.setup);
  let raw = 0;

  raw += Math.round(phaseScore * 42);
  if (phaseScore >= 0.55) {
    reasons.push(`阶段叙事一致（${(phaseScore * 100).toFixed(0)}%）`);
    reasons.push(`截图：${query.phaseSig}`);
    reasons.push(`百科：${slide.phaseSig}`);
  } else if (phaseScore >= 0.25) {
    reasons.push(`阶段部分一致：${query.phaseSig}`);
  } else if (query.phases.length >= 2) {
    cautions.push(`阶段较弱：${query.phaseSig} ↔ ${slide.phaseSig || "—"}`);
    penalty += 12;
  }

  const matchedPhases = phaseAlignments.filter((r) => r.matched).length;
  if (matchedPhases > 0) {
    reasons.push(`${matchedPhases}/${phaseAlignments.length} 个 Brooks 元素段对齐`);
  }

  if (query.setup === slide.setup) {
    raw += 22;
    reasons.push(`Setup：${query.setupLabel}`);
  } else if (setupOk) {
    raw += 12;
  } else {
    cautions.push(`Setup：${query.setupLabel} vs ${slide.setupLabel}`);
    penalty += 8;
  }

  if (query.alwaysIn === slide.alwaysIn && query.alwaysIn !== "neutral") {
    raw += 10;
  }

  if (query.scale === slide.scale) raw += 8;
  else if (
    (query.scale === "intraday" && slide.scale === "daily_swing") ||
    (query.scale === "daily_swing" && slide.scale === "intraday")
  ) {
    raw += 5;
  } else {
    penalty += 6;
  }

  const spikeSim =
    1 -
    Math.abs(query.bearSpike - slide.bearSpike) -
    Math.abs(query.trStrength - slide.trStrength) * 0.5;
  raw += Math.round(Math.max(0, spikeSim) * 10);

  const sharedPatterns = query.patternIds.filter((id) => slide.patternIds.includes(id));
  if (sharedPatterns.length) {
    raw += Math.min(10, sharedPatterns.length * 4);
  }

  const brooksScore = Math.min(100, Math.max(1, raw - penalty));

  const verified =
    brooksScore >= VERIFIED_BROOKS_SCORE &&
    phaseScore >= VERIFIED_PHASE_SCORE &&
    setupOk &&
    slide.chartScore >= MIN_CHART_SLIDE_SCORE &&
    slide.slideKind === "chart_slide" &&
    matchedPhases >= Math.min(2, phaseAlignments.length) &&
    penalty < 20;

  const lowConfidence = !verified || brooksScore < LOW_CONFIDENCE_SCORE;
  if (lowConfidence && !verified) {
    cautions.unshift("整体相似度一般，以下为全库相对最接近的 slide，请人工对照");
  }

  return {
    score: brooksScore,
    brooksScore,
    phaseScore,
    verified,
    lowConfidence,
    reasons,
    cautions,
    phaseAlignments,
  };
}

const fpCache = new Map<string, BrooksFingerprint>();

async function getSlideFingerprint(
  entry: EncyclopediaPageEntry,
): Promise<BrooksFingerprint> {
  const key = entry.thumb;
  const cached = fpCache.get(key);
  if (cached) return cached;
  const url = encyclopediaAssetUrl(entry.thumb);
  const fp = await fingerprintFromThumbUrl(url);
  fpCache.set(key, fp);
  return fp;
}

export async function matchEncyclopediaByBrooks(
  index: EncyclopediaIndex,
  queryImage: string,
  crop: { x: number; y: number; w: number; h: number } | null,
  options?: {
    topK?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<{
  queryFp: BrooksFingerprint;
  matches: EncyclopediaMatch[];
  report: MatchReport;
}> {
  const topK = options?.topK ?? 12;
  const queryFp = await fingerprintFromDataUrl(queryImage, crop);

  const chartPages = index.pages;
  let skippedNonChart = 0;
  let skippedTitle = 0;
  const total = chartPages.length;

  const scored: Array<{
    entry: EncyclopediaPageEntry;
    brooksScore: number;
    phaseScore: number;
    verified: boolean;
    lowConfidence: boolean;
    reasons: string[];
    cautions: string[];
    phaseAlignments: PhaseAlignmentRow[];
  }> = [];

  const batchSize = 16;
  for (let i = 0; i < chartPages.length; i += batchSize) {
    const batch = chartPages.slice(i, i + batchSize);
    options?.onProgress?.(Math.min(i + batchSize, total), total);
    const part = await Promise.all(
      batch.map(async (entry) => {
        const slideFp = await getSlideFingerprint(entry);
        if (slideFp.barCount < 6) {
          skippedNonChart++;
          return null;
        }
        if (slideFp.slideKind !== "chart_slide") {
          skippedTitle++;
        }
        const result = scoreBrooksMatch(queryFp, slideFp);
        return { entry, ...result };
      }),
    );
    for (const row of part) {
      if (!row) continue;
      scored.push({
        entry: row.entry,
        brooksScore: row.brooksScore,
        phaseScore: row.phaseScore,
        verified: row.verified,
        lowConfidence: row.lowConfidence,
        reasons: row.reasons,
        cautions: row.cautions,
        phaseAlignments: row.phaseAlignments,
      });
    }
  }

  scored.sort((a, b) => {
    const va = a.verified ? 3000 : 0;
    const vb = b.verified ? 3000 : 0;
    const pa = a.phaseScore * 120;
    const pb = b.phaseScore * 120;
    return vb + pb + b.brooksScore - (va + pa + a.brooksScore);
  });

  const picked = scored.slice(0, topK);
  const bestScore = picked[0]?.brooksScore ?? 0;
  const allLowConfidence = picked.length > 0 && bestScore < LOW_CONFIDENCE_SCORE;

  const matches: EncyclopediaMatch[] = await Promise.all(
    picked.map(
      async ({
        entry,
        brooksScore,
        phaseScore,
        verified,
        lowConfidence,
        reasons,
        cautions,
        phaseAlignments,
      }) => {
        const slideFp = await getSlideFingerprint(entry);
        return {
          page: entry.page,
          thumb: entry.thumb,
          preview: entry.preview,
          score: brooksScore,
          semanticScore: brooksScore,
          structureScore: brooksScore,
          phaseScore: Math.round(phaseScore * 100),
          verified,
          lowConfidence,
          slidePhaseLabel: slideFp.setupLabel,
          slideScaleLabel: slideFp.scaleLabel,
          slidePhaseSig: slideFp.phaseSig,
          reasons,
          cautions,
          phaseAlignments,
          chartScore: slideFp.chartScore,
          fullDistance: 0,
          chartDistance: 0,
        };
      },
    ),
  );

  const report: MatchReport = {
    indexPages: index.pages.length,
    queryChartScore: queryFp.chartScore,
    candidatesInRange: scored.length,
    scannedCandidates: chartPages.length,
    skippedNonChart,
    skippedDuplicate: 0,
    maxHammingDistance: 0,
    matchMode: "brooks",
    skippedTitleSlides: skippedTitle,
    bestBrooksScore: bestScore,
    lowConfidenceFallback: allLowConfidence,
  };

  return { queryFp, matches, report };
}

export function formatQueryBrooksReadout(fp: BrooksFingerprint): string {
  const lines = [
    `主 Setup：${fp.setupLabel}`,
    `阶段叙事：${fp.phaseSig || "—"}`,
    `Always In：${fp.alwaysIn === "long" ? "偏多" : fp.alwaysIn === "short" ? "偏空" : "中性"}`,
    `周期：${fp.scaleLabel}`,
  ];
  for (const p of fp.phases) {
    lines.push(`· 棒 ${p.barStart}–${p.barEnd}：${p.label} — ${p.summary}`);
  }
  if (fp.searchTerms.length) {
    lines.push(`检索：${fp.searchTerms.join(" · ")}`);
  }
  return lines.join("\n");
}
