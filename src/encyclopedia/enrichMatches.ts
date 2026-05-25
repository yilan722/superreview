import { analyzeChartFromDataUrl, analyzeChartFromUrl } from "./chartStructure";
import { explainSimilarity, formatQuerySummary } from "./explainSimilarity";
import { encyclopediaDisplayUrl } from "./loadIndex";
import type { EncyclopediaMatch } from "./types";

type CropRect = { x: number; y: number; w: number; h: number };

export interface EnrichedEncyclopediaMatch extends EncyclopediaMatch {
  structureScore: number;
  semanticScore: number;
  verified: boolean;
  slidePhaseLabel: string;
  slideScaleLabel: string;
  reasons: string[];
  cautions: string[];
}

const MIN_SEMANTIC_TO_SHOW = 38;
const PREFERRED_VERIFIED = 52;

export async function enrichMatchesWithStructure(
  queryImage: string,
  queryCrop: CropRect | null,
  matches: EncyclopediaMatch[],
  topK: number,
): Promise<{
  querySummary: string;
  queryTags: string[];
  queryAnalysis: string;
  enriched: EnrichedEncyclopediaMatch[];
  filteredOut: number;
}> {
  if (!matches.length) {
    return {
      querySummary: "",
      queryTags: [],
      queryAnalysis: "",
      enriched: [],
      filteredOut: 0,
    };
  }

  const queryStruct = await analyzeChartFromDataUrl(queryImage, queryCrop);

  const all = await Promise.all(
    matches.map(async (m) => {
      const slideStruct = await analyzeChartFromUrl(encyclopediaDisplayUrl(m));
      const { structureScore, semanticScore, verified, reasons, cautions } =
        explainSimilarity(queryStruct, slideStruct);
      return {
        ...m,
        chartScore: m.chartScore,
        structureScore,
        semanticScore,
        verified,
        slidePhaseLabel: slideStruct.phaseLabel,
        slideScaleLabel: slideStruct.scaleLabel,
        reasons,
        cautions,
        _rank:
          (verified ? 1000 : 0) +
          semanticScore * 4 +
          m.score * 2 +
          (m.chartScore ?? 0) * 50,
      };
    }),
  );

  all.sort((a, b) => b._rank - a._rank);

  const passing = all.filter(
    (m) => m.semanticScore >= MIN_SEMANTIC_TO_SHOW || m.verified,
  );
  const filteredOut = all.length - passing.length;

  let picked = passing.slice(0, topK);
  if (!picked.length) {
    picked = all.slice(0, Math.min(topK, 3));
  }

  const enriched = picked.map(({ _rank: _, ...rest }) => rest);

  const queryAnalysis = buildQueryBrooksSummary(queryStruct);

  return {
    querySummary: formatQuerySummary(queryStruct),
    queryTags: [
      ...queryStruct.patternTags.slice(0, 4),
      ...queryStruct.tags
        .filter((t) => !queryStruct.patternTags.includes(t))
        .slice(0, 2),
    ].slice(0, 6),
    queryAnalysis,
    enriched,
    filteredOut,
  };
}

function buildQueryBrooksSummary(q: {
  phaseLabel: string;
  scaleLabel: string;
  emaLabel: string;
  barLabel: string;
  direction: string;
  patternTags: string[];
  bullRatio: number;
  bearRatio: number;
}): string {
  const dir =
    q.direction === "down"
      ? "偏空"
      : q.direction === "up"
        ? "偏多"
        : "横盘";
  const lines = [
    `行情阶段：${q.phaseLabel}（${dir}）`,
    `周期：${q.scaleLabel}`,
    `EMA20：${q.emaLabel}`,
    `K 线特征：${q.barLabel}`,
  ];
  if (q.patternTags.length) {
    lines.push(`检出形态：${q.patternTags.join("、")}`);
  }
  lines.push(
    "建议在百科中检索：Bear trend / Trading range / Bear breakout / MTR / Tight TR / Final flag 等日内 slide，而非年线 AIL。",
  );
  return lines.join("\n");
}

export { PREFERRED_VERIFIED, MIN_SEMANTIC_TO_SHOW };
