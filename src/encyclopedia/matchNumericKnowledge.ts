import {
  compareEighteenBarProfiles,
  type EighteenBarProfile,
} from "./eighteenBarProfile";
import { buildPhaseAlignments } from "./narrativePhases";
import { loadEncyclopediaKnowledge, type KnowledgePage } from "./loadKnowledge";
import { hasNumericWindows, profileFromStored } from "./numericProfile";
import {
  compareBrooksOpeningAnalysis,
  formatBrooksOpeningReadout,
  buildBrooksElementAlignments,
} from "./openingBarsBrooks";
import {
  LOW_CONFIDENCE_18,
  VERIFIED_18_SCORE,
} from "./match18Bars";
import type { EncyclopediaMatch, MatchReport } from "./types";

function scoreProfiles(
  queryProfile: EighteenBarProfile,
  slideProfile: EighteenBarProfile,
): {
  score: number;
  phaseScore: number;
  reasons: string[];
  cautions: string[];
} {
  if (queryProfile.brooks && slideProfile.brooks) {
    const brooks = compareBrooksOpeningAnalysis(queryProfile.brooks, slideProfile.brooks);
    const legacy = compareEighteenBarProfiles(queryProfile, slideProfile);
    const score = Math.round(brooks.score * 0.82 + legacy.score * 0.18);
    return {
      score: Math.min(100, score),
      phaseScore: brooks.phaseScore,
      reasons: [...brooks.reasons, ...legacy.reasons.slice(0, 1)],
      cautions: brooks.cautions,
    };
  }
  const legacy = compareEighteenBarProfiles(queryProfile, slideProfile);
  return {
    score: legacy.score,
    phaseScore: legacy.phaseScore,
    reasons: legacy.reasons,
    cautions: [],
  };
}

/** Pure numeric Brooks-style matching: query OHLC vs precomputed knowledge windows. */
export async function matchEncyclopediaByNumericKnowledge(
  queryProfile: EighteenBarProfile,
  options?: {
    topK?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<{
  queryProfile: EighteenBarProfile;
  matches: EncyclopediaMatch[];
  report: MatchReport;
}> {
  const topK = options?.topK ?? 12;
  const knowledge = await loadEncyclopediaKnowledge();
  if (!knowledge?.pages.length) {
    throw new Error("缺少百科数值索引。请运行 npm run encyclopedia:learn 生成 knowledge.json");
  }

  const pages = knowledge.pages.filter((p) => p.kind === "chart_slide" && hasNumericWindows(p));
  if (!pages.length) {
    throw new Error(
      "knowledge.json 尚无数值结构字段（windows）。请运行 npm run encyclopedia:learn 重建索引（version 2+）",
    );
  }

  let skippedNonChart = knowledge.pages.length - pages.length;

  type Scored = {
    page: KnowledgePage;
    score: number;
    phaseScore: number;
    verified: boolean;
    lowConfidence: boolean;
    reasons: string[];
    cautions: string[];
    slideBarStart: number;
    slidePhaseSig: string;
    phaseAlignments: ReturnType<typeof buildPhaseAlignments>;
    brooksElementRows: ReturnType<typeof buildBrooksElementAlignments>;
  };

  const scored: Scored[] = [];
  const batchSize = 64;

  for (let i = 0; i < pages.length; i += batchSize) {
    const batch = pages.slice(i, i + batchSize);
    options?.onProgress?.(Math.min(i + batchSize, pages.length), pages.length);

    for (const page of batch) {
      let bestScore = 0;
      let bestReasons: string[] = [];
      let bestCautions: string[] = [];
      let bestPhaseScore = 0;
      let bestBarStart = 1;
      let bestPhaseSig = "";
      let bestSlideProfile: EighteenBarProfile | null = null;

      for (const win of page.windows ?? []) {
        if (!win.shape || win.shape.length < 6) continue;
        const slideProfile = profileFromStored(win);
        const cmp = scoreProfiles(queryProfile, slideProfile);
        if (cmp.score > bestScore) {
          bestScore = cmp.score;
          bestReasons = cmp.reasons;
          bestCautions = cmp.cautions;
          bestPhaseScore = cmp.phaseScore;
          bestBarStart = win.barStart;
          bestPhaseSig = slideProfile.brooks?.phaseSig ?? win.phaseSig;
          bestSlideProfile = slideProfile;
        }
      }

      if (!bestSlideProfile || bestScore < 1) continue;

      const verified =
        bestScore >= VERIFIED_18_SCORE &&
        bestPhaseScore >= 0.42 &&
        queryProfile.barCount >= 12;

      const phaseAlignments = buildPhaseAlignments(
        queryProfile.phases,
        bestSlideProfile.phases,
      );

      const brooksElementRows =
        queryProfile.brooks && bestSlideProfile.brooks
          ? buildBrooksElementAlignments(queryProfile.brooks, bestSlideProfile.brooks)
          : [];

      const reasons =
        bestReasons.length > 0
          ? bestReasons
          : [`阿布结构相似 ${bestScore}% · 百科棒 ${bestBarStart}–${bestBarStart + queryProfile.barCount - 1}`];

      scored.push({
        page,
        score: bestScore,
        phaseScore: bestPhaseScore,
        verified,
        lowConfidence: !verified || bestScore < LOW_CONFIDENCE_18,
        reasons,
        cautions: bestCautions,
        slideBarStart: bestBarStart,
        slidePhaseSig: bestPhaseSig,
        phaseAlignments,
        brooksElementRows,
      });
    }
  }

  scored.sort((a, b) => {
    const va = a.verified ? 2000 : 0;
    const vb = b.verified ? 2000 : 0;
    return vb + b.score - (va + a.score);
  });

  const picked = scored.slice(0, topK);
  const bestScore = picked[0]?.score ?? 0;

  const matches: EncyclopediaMatch[] = picked.map((row) => ({
    page: row.page.page,
    thumb: row.page.thumb,
    preview: undefined,
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
    queryPhaseSig: queryProfile.brooks?.phaseSig ?? queryProfile.phaseSig,
    fullDistance: 0,
    chartDistance: 0,
    brooksElementRows: row.brooksElementRows,
  }));

  const report: MatchReport = {
    indexPages: knowledge.pages.length,
    queryChartScore: queryProfile.barCount / Math.max(1, queryProfile.window),
    candidatesInRange: scored.length,
    scannedCandidates: pages.length,
    skippedNonChart,
    skippedDuplicate: 0,
    maxHammingDistance: 0,
    matchMode: "ohlc",
    skippedTitleSlides: skippedNonChart,
    skippedIncompatible: 0,
    bestBrooksScore: bestScore,
    lowConfidenceFallback: bestScore < LOW_CONFIDENCE_18,
    barWindow: queryProfile.window,
  };

  return { queryProfile, matches, report };
}

export function format18BarReadout(p: EighteenBarProfile): string {
  if (p.brooks) return formatBrooksOpeningReadout(p.brooks);
  return p.summary;
}
