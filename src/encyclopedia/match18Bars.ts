import {
  BAR_WINDOW,
  best18BarWindow,
  compareEighteenBarProfiles,
  format18BarReadout,
  profileFromBars,
  profileFromImageDataWithWindow,
  type EighteenBarProfile,
} from "./eighteenBarProfile";
import { buildPhaseAlignments } from "./narrativePhases";
import { analyzeSlidePage } from "./slidePageType";
import { encyclopediaAssetUrl } from "./loadIndex";
import { loadEncyclopediaKnowledge, type KnowledgePage } from "./loadKnowledge";
import { resolveQueryChartRegion } from "./detectChartRegion";
import { extractBarSeries, validBars } from "./barSeries";
import { loadImage } from "./phash";
import type {
  EncyclopediaIndex,
  EncyclopediaMatch,
  EncyclopediaPageEntry,
  MatchReport,
} from "./types";

export const VERIFIED_18_SCORE = 58;
export const LOW_CONFIDENCE_18 = 45;
export type QueryImageKind = "whole_chart" | "eighteen_bars";

type Compatibility = "strict" | "relaxed" | "reject";

function setupCompatibility(
  q: EighteenBarProfile["setup"],
  s: EighteenBarProfile["setup"],
): Compatibility {
  if (q === s) return "strict";
  if (q === "trading_range" && (s === "bull_spike_then_tr" || s === "bear_spike_then_tr")) {
    return "relaxed";
  }
  if (s === "trading_range" && (q === "bull_spike_then_tr" || q === "bear_spike_then_tr")) {
    return "relaxed";
  }
  if (
    (q === "bull_trend" && s === "mixed") ||
    (q === "bear_trend" && s === "mixed") ||
    (q === "mixed" && s !== "mixed")
  ) {
    return "relaxed";
  }
  if (
    (q === "bull_trend" && s === "bear_trend") ||
    (q === "bear_trend" && s === "bull_trend") ||
    (q === "bull_spike_then_tr" && s === "bear_spike_then_tr") ||
    (q === "bear_spike_then_tr" && s === "bull_spike_then_tr")
  ) {
    return "reject";
  }
  return "relaxed";
}

function openingCompatibility(
  q: EighteenBarProfile["openingSetup"],
  s: EighteenBarProfile["openingSetup"],
): Compatibility {
  if (q === "unclear" || s === "unclear") return "relaxed";
  if (q === s) return "strict";
  if (q === "tr_open" || s === "tr_open") return "relaxed";
  return "reject";
}

function directionCompatibility(
  q: EighteenBarProfile["direction"],
  s: EighteenBarProfile["direction"],
): Compatibility {
  if (q === "sideways" || s === "sideways") return "relaxed";
  if (q === s) return "strict";
  return "reject";
}

function knowledgeCompatible(
  query: EighteenBarProfile,
  page: KnowledgePage,
): boolean {
  const openCompat = openingCompatibility(
    query.openingSetup,
    (page.openingSetup as EighteenBarProfile["openingSetup"]) ?? "unclear",
  );
  const dirCompat = directionCompatibility(
    query.direction,
    (page.direction as EighteenBarProfile["direction"]) ?? "sideways",
  );
  const setupCompat = setupCompatibility(
    query.setup,
    (page.setup as EighteenBarProfile["setup"]) ?? "mixed",
  );
  return (
    page.kind === "chart_slide" &&
    openCompat !== "reject" &&
    dirCompat !== "reject" &&
    setupCompat !== "reject"
  );
}

async function imageDataFromThumb(url: string): Promise<ImageData> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = Math.max(32, Math.round(img.naturalHeight * (200 / img.naturalWidth)));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function profileFromDataUrl(
  dataUrl: string,
  crop?: { x: number; y: number; w: number; h: number } | null,
  window = BAR_WINDOW,
): Promise<EighteenBarProfile> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
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
  return profileFromImageDataWithWindow(
    sctx.getImageData(0, 0, scaled.width, scaled.height),
    window,
  );
}

const slideCache = new Map<string, { data: ImageData; series: ReturnType<typeof extractBarSeries> }>();

async function loadSlideSeries(entry: EncyclopediaPageEntry) {
  const key = entry.thumb;
  const hit = slideCache.get(key);
  if (hit) return hit;
  const data = await imageDataFromThumb(encyclopediaAssetUrl(entry.thumb));
  const series = extractBarSeries(data);
  const pack = { data, series };
  slideCache.set(key, pack);
  return pack;
}

export async function matchEncyclopediaBy18Bars(
  index: EncyclopediaIndex,
  queryImage: string,
  crop: { x: number; y: number; w: number; h: number } | null,
  options?: {
    topK?: number;
    onProgress?: (done: number, total: number) => void;
    barWindow?: number;
  },
): Promise<{
  queryProfile: EighteenBarProfile;
  matches: EncyclopediaMatch[];
  report: MatchReport;
}> {
  const barWindow = Math.max(12, options?.barWindow ?? BAR_WINDOW);
  const queryProfile = await profileFromDataUrl(queryImage, crop, barWindow);
  return matchEncyclopediaByProfile(index, queryProfile, {
    ...options,
    barWindow,
    matchMode: "18bars",
  });
}

export async function matchEncyclopediaByProfile(
  index: EncyclopediaIndex,
  queryProfile: EighteenBarProfile,
  options?: {
    topK?: number;
    onProgress?: (done: number, total: number) => void;
    barWindow?: number;
    matchMode?: MatchReport["matchMode"];
  },
): Promise<{
  queryProfile: EighteenBarProfile;
  matches: EncyclopediaMatch[];
  report: MatchReport;
}> {
  const topK = options?.topK ?? 12;
  const barWindow = Math.max(12, options?.barWindow ?? queryProfile.window ?? BAR_WINDOW);
  const knowledge = await loadEncyclopediaKnowledge();
  const knowledgeByPage = new Map<number, KnowledgePage>(
    (knowledge?.pages ?? []).map((p) => [p.page, p]),
  );
  const pages = index.pages;
  let skippedNonChart = 0;
  let skippedTitle = 0;
  let skippedIncompatible = 0;

  const scoredStrict: Array<{
    entry: EncyclopediaPageEntry;
    score: number;
    phaseScore: number;
    verified: boolean;
    lowConfidence: boolean;
    reasons: string[];
    cautions: string[];
    slideBarStart: number;
    slidePhaseSig: string;
    phaseAlignments: ReturnType<typeof buildPhaseAlignments>;
  }> = [];
  const scoredRelaxed: Array<{
    entry: EncyclopediaPageEntry;
    score: number;
    phaseScore: number;
    verified: boolean;
    lowConfidence: boolean;
    reasons: string[];
    cautions: string[];
    slideBarStart: number;
    slidePhaseSig: string;
    phaseAlignments: ReturnType<typeof buildPhaseAlignments>;
  }> = [];

  const batchSize = 16;
  for (let i = 0; i < pages.length; i += batchSize) {
    const batch = pages.slice(i, i + batchSize);
    options?.onProgress?.(Math.min(i + batchSize, pages.length), pages.length);

    const part = await Promise.all(
      batch.map(async (entry) => {
        const kp = knowledgeByPage.get(entry.page);
        if (kp && !knowledgeCompatible(queryProfile, kp)) {
          skippedIncompatible++;
          return null;
        }

        const { data, series } = await loadSlideSeries(entry);
        const page = analyzeSlidePage(data);
        const valid = validBars(series);

        if (valid.length < 5) {
          skippedNonChart++;
          return null;
        }

        let penalty = 0;
        const cautions: string[] = [];
        if (page.kind !== "chart_slide") {
          skippedTitle++;
          penalty += 28;
          cautions.push("封面/标题页（排序靠后）");
        }
        if (page.chartScore < 0.4) {
          penalty += 15;
          cautions.push("K 线占比较低");
        }

        const { profile: slideWin, barStart, reasons } = best18BarWindow(
          queryProfile,
          series.bars,
          series.height,
          barWindow,
          profileFromImageDataWithWindow(data, valid.length || barWindow).emaByBar,
        );
        const cmp = compareEighteenBarProfiles(queryProfile, slideWin);

        const pageOpenProfile = profileFromBars(
          valid.slice(0, barWindow),
          series.height,
          barWindow,
        );

        const openCompat = openingCompatibility(
          queryProfile.openingSetup,
          pageOpenProfile.openingSetup,
        );
        const dirCompat = directionCompatibility(
          queryProfile.direction,
          pageOpenProfile.direction,
        );
        const setupCompat = setupCompatibility(
          queryProfile.setup,
          pageOpenProfile.setup,
        );

        if (
          page.kind === "chart_slide" &&
          (openCompat === "reject" || dirCompat === "reject" || setupCompat === "reject")
        ) {
          skippedIncompatible++;
          return null;
        }

        const phaseAlignments = buildPhaseAlignments(
          queryProfile.phases,
          slideWin.phases,
        );

        const hardOppositeTrend =
          queryProfile.direction !== "sideways" &&
          slideWin.direction !== "sideways" &&
          queryProfile.direction !== slideWin.direction &&
          queryProfile.openingSetup !== "tr_open" &&
          slideWin.openingSetup !== "tr_open" &&
          queryProfile.openingSetup !== "unclear" &&
          slideWin.openingSetup !== "unclear" &&
          queryProfile.openingSetup !== slideWin.openingSetup;

        if (hardOppositeTrend) {
          return null;
        }

        if (
          queryProfile.direction !== "sideways" &&
          slideWin.direction !== "sideways" &&
          queryProfile.direction !== slideWin.direction
        ) {
          penalty += 24;
          cautions.push("18棒主趋势方向相反（上行 vs 下行）");
        }

        if (
          queryProfile.startDirection !== "sideways" &&
          slideWin.startDirection !== "sideways" &&
          queryProfile.startDirection !== slideWin.startDirection
        ) {
          penalty += 28;
          cautions.push("开局主方向相反（前6棒）");
        }

        if (
          queryProfile.openingSetup !== "unclear" &&
          pageOpenProfile.openingSetup !== "unclear" &&
          queryProfile.openingSetup !== pageOpenProfile.openingSetup
        ) {
          penalty += 18;
          cautions.push(
            `页级开局不符：截图 ${queryProfile.openingSetup} vs 百科 ${pageOpenProfile.openingSetup}`,
          );
        }

        if (
          (queryProfile.setup === "bull_trend" && slideWin.setup === "bear_trend") ||
          (queryProfile.setup === "bear_trend" && slideWin.setup === "bull_trend") ||
          (queryProfile.setup === "bull_spike_then_tr" &&
            slideWin.setup === "bear_spike_then_tr") ||
          (queryProfile.setup === "bear_spike_then_tr" &&
            slideWin.setup === "bull_spike_then_tr")
        ) {
          penalty += 18;
          cautions.push(`Setup相反：${queryProfile.setup} vs ${slideWin.setup}`);
        }

        const score = Math.max(1, cmp.score - penalty);
        const phaseScore = cmp.phaseScore;

        const verified =
          score >= VERIFIED_18_SCORE &&
          phaseScore >= 0.4 &&
          page.kind === "chart_slide" &&
          queryProfile.barCount >= 12 &&
          penalty < 15;

        const allReasons = reasons.length ? reasons : cmp.reasons;
        if (allReasons.length === 0 && score >= 40) {
          allReasons.push(`百科最似段落：棒 ${barStart}–${barStart + slideWin.barCount - 1}`);
        }

        return {
          entry,
          score,
          phaseScore,
          verified,
          lowConfidence: !verified || score < LOW_CONFIDENCE_18,
          reasons: allReasons,
          cautions,
          slideBarStart: barStart,
          slidePhaseSig: slideWin.phaseSig,
          phaseAlignments,
        };
      }),
    );

    for (const row of part) {
      if (!row) continue;
      const strictLike =
        row.score >= LOW_CONFIDENCE_18 &&
        row.phaseScore >= 0.35 &&
        !row.cautions.some((c) => c.includes("相反"));
      if (strictLike) scoredStrict.push(row);
      else scoredRelaxed.push(row);
    }
  }

  scoredStrict.sort((a, b) => {
    const va = a.verified ? 2000 : 0;
    const vb = b.verified ? 2000 : 0;
    return vb + b.score - (va + a.score);
  });
  scoredRelaxed.sort((a, b) => b.score - a.score);

  const source = scoredStrict.length > 0 ? scoredStrict : scoredRelaxed;
  const picked = source.slice(0, topK);
  const bestScore = picked[0]?.score ?? 0;

  const matches: EncyclopediaMatch[] = picked.map((row) => ({
    page: row.entry.page,
    thumb: row.entry.thumb,
    preview: row.entry.preview,
    score: row.score,
    semanticScore: row.score,
    structureScore: row.score,
    phaseScore: Math.round(row.phaseScore * 100),
    verified: row.verified,
    lowConfidence: row.lowConfidence,
    slidePhaseLabel: row.slidePhaseSig,
    slidePhaseSig: row.slidePhaseSig,
    reasons: row.reasons,
    cautions: row.cautions,
    phaseAlignments: row.phaseAlignments,
    queryPhaseSig: queryProfile.phaseSig,
    fullDistance: 0,
    chartDistance: 0,
  }));

  const report: MatchReport = {
    indexPages: pages.length,
    queryChartScore: queryProfile.barCount / Math.max(1, barWindow),
    candidatesInRange: source.length,
    scannedCandidates: pages.length,
    skippedNonChart,
    skippedDuplicate: 0,
    maxHammingDistance: 0,
    matchMode: options?.matchMode ?? "18bars",
    skippedTitleSlides: skippedTitle,
    skippedIncompatible,
    bestBrooksScore: bestScore,
    lowConfidenceFallback: scoredStrict.length === 0 || bestScore < LOW_CONFIDENCE_18,
    barWindow,
  };

  return { queryProfile, matches, report };
}

export async function detectQueryImageKind(
  dataUrl: string,
): Promise<{ kind: QueryImageKind; barCount: number }> {
  const region = await resolveQueryChartRegion(dataUrl, null);
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = region.w;
  canvas.height = region.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { kind: "whole_chart", barCount: BAR_WINDOW + 1 };
  ctx.drawImage(
    img,
    region.x,
    region.y,
    region.w,
    region.h,
    0,
    0,
    region.w,
    region.h,
  );
  const scaled = document.createElement("canvas");
  scaled.width = 200;
  scaled.height = Math.max(32, Math.round(canvas.height * (200 / canvas.width)));
  const sctx = scaled.getContext("2d", { willReadFrequently: true });
  if (!sctx) return { kind: "whole_chart", barCount: BAR_WINDOW + 1 };
  sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  const data = sctx.getImageData(0, 0, scaled.width, scaled.height);
  const series = extractBarSeries(data);
  const barCount = validBars(series).length;
  const kind: QueryImageKind = barCount <= BAR_WINDOW + 6 ? "eighteen_bars" : "whole_chart";
  return { kind, barCount };
}

export { format18BarReadout, BAR_WINDOW };
