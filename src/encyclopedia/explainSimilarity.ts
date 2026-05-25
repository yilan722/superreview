import type { ChartStructure, MarketPhase } from "./chartStructure";
import { scaleCompatibility } from "./slideScale";

export interface StructureExplanation {
  structureScore: number;
  /** 阿布式语义是否真正相容 0–100 */
  semanticScore: number;
  verified: boolean;
  reasons: string[];
  cautions: string[];
}

const PHASE_LABEL: Record<MarketPhase, string> = {
  bull_trend: "多头趋势",
  bear_trend: "空头趋势",
  trading_range: "交易区间",
  bull_breakout: "牛市突破",
  bear_breakout: "熊市突破",
  mixed: "混合/过渡",
};

function phaseGroup(p: MarketPhase): "bull" | "bear" | "tr" | "mixed" {
  if (p === "bull_trend" || p === "bull_breakout") return "bull";
  if (p === "bear_trend" || p === "bear_breakout") return "bear";
  if (p === "trading_range") return "tr";
  return "mixed";
}

function phaseMatchScore(a: MarketPhase, b: MarketPhase): number {
  if (a === b) return 1;
  const ga = phaseGroup(a);
  const gb = phaseGroup(b);
  if (ga === gb) return 0.7;
  if (ga === "mixed" || gb === "mixed") return 0.4;
  if ((ga === "bull" && gb === "tr") || (ga === "tr" && gb === "bull")) return 0.35;
  if ((ga === "bear" && gb === "tr") || (ga === "tr" && gb === "bear")) return 0.4;
  if (ga === "bull" && gb === "bear") return 0;
  if (ga === "bear" && gb === "bull") return 0;
  return 0.25;
}

function directionScore(
  query: ChartStructure,
  slide: ChartStructure,
): number {
  if (query.direction === slide.direction) {
    return query.direction === "sideways" ? 0.7 : 1;
  }
  if (query.direction === "sideways" || slide.direction === "sideways") {
    return 0.45;
  }
  return 0;
}

function patternMatchScore(query: ChartStructure, slide: ChartStructure): number {
  const qStrong = query.patterns.filter((p) => p.strength >= 0.45);
  const sStrong = slide.patterns.filter((p) => p.strength >= 0.45);
  if (!qStrong.length || !sStrong.length) return 0.35;

  let exact = 0;
  for (const qp of qStrong) {
    if (sStrong.some((sp) => sp.id === qp.id)) exact++;
  }
  return exact / Math.max(qStrong.length, sStrong.length);
}

function explainPatterns(query: ChartStructure, slide: ChartStructure): string[] {
  const lines: string[] = [];
  const qStrong = query.patterns.filter((p) => p.strength >= 0.45);
  const sStrong = slide.patterns.filter((p) => p.strength >= 0.45);

  for (const qp of qStrong) {
    const sp = sStrong.find((p) => p.id === qp.id);
    if (sp) {
      lines.push(`形态一致：${qp.label}${qp.at ? `（${qp.at}）` : ""}`);
    }
  }
  return lines;
}

function patternCautions(query: ChartStructure, slide: ChartStructure): string[] {
  const cautions: string[] = [];
  const qStrong = query.patterns.filter((p) => p.strength >= 0.45);
  const sStrong = slide.patterns.filter((p) => p.strength >= 0.45);

  for (const qp of qStrong) {
    if (!sStrong.some((p) => p.id === qp.id)) {
      cautions.push(`截图有「${qp.label}」，百科页未检出相同形态`);
    }
  }
  return cautions;
}

export function explainSimilarity(
  query: ChartStructure,
  slide: ChartStructure,
): StructureExplanation {
  const reasons: string[] = [];
  const cautions: string[] = [];

  const pScore = phaseMatchScore(query.phase, slide.phase);
  const dirScore = directionScore(query, slide);
  const scaleScore = scaleCompatibility(query.scale, slide.scale);
  const patScore = patternMatchScore(query, slide);

  if (scaleScore < 0.35) {
    cautions.push(
      `周期尺度不匹配：截图为「${query.scaleLabel}」，百科为「${slide.scaleLabel}」（如年线 AIL 不能与日内暴跌+区间对比）`,
    );
  } else if (scaleScore < 0.7) {
    cautions.push(`周期尺度略有差异：${query.scaleLabel} ↔ ${slide.scaleLabel}`);
  } else {
    reasons.push(`周期尺度一致：${query.scaleLabel}`);
  }

  if (query.phase === slide.phase) {
    reasons.push(`市场阶段一致：「${query.phaseLabel}」`);
  } else if (pScore >= 0.65) {
    reasons.push(
      `阶段相近：截图「${query.phaseLabel}」↔ 百科「${slide.phaseLabel}」`,
    );
  } else if (pScore === 0) {
    cautions.push(
      `市场阶段对立：截图「${query.phaseLabel}」vs 百科「${slide.phaseLabel}」— 不应视为同一 setup`,
    );
  } else {
    cautions.push(
      `市场阶段不同：截图「${query.phaseLabel}」，百科「${slide.phaseLabel}」`,
    );
  }

  if (dirScore >= 0.9) {
    reasons.push(
      `走向一致：${query.direction === "up" ? "上行" : query.direction === "down" ? "下行" : "横盘"}`,
    );
  } else if (dirScore <= 0.2) {
    cautions.push(
      `整体走向相反（截图偏${query.direction === "up" ? "上" : query.direction === "down" ? "下" : "横"}，百科偏${slide.direction === "up" ? "上" : slide.direction === "down" ? "下" : "横"}）`,
    );
  }

  if (query.emaRelation === slide.emaRelation && query.emaRelation !== "unclear") {
    reasons.push(`EMA20 关系相同：${query.emaLabel}`);
  } else if (
    query.emaRelation !== "unclear" &&
    slide.emaRelation !== "unclear" &&
    query.emaRelation !== slide.emaRelation
  ) {
    cautions.push(
      `EMA 关系不同：截图「${query.emaLabel}」↔ 百科「${slide.emaLabel}」`,
    );
  }

  reasons.push(...explainPatterns(query, slide));
  cautions.push(...patternCautions(query, slide));

  const emaScore =
    query.emaRelation === slide.emaRelation ? 1 : query.emaRelation === "unclear" ? 0.5 : 0.2;
  const barScore = query.barCharacter === slide.barCharacter ? 1 : 0.45;

  let semanticScore = Math.round(
    (pScore * 0.32 +
      dirScore * 0.22 +
      scaleScore * 0.28 +
      patScore * 0.1 +
      emaScore * 0.05 +
      barScore * 0.03) *
      100,
  );

  if (pScore === 0 || dirScore === 0) semanticScore = Math.min(semanticScore, 28);
  if (scaleScore < 0.35) semanticScore = Math.min(semanticScore, 22);

  const verified =
    semanticScore >= 58 &&
    scaleScore >= 0.65 &&
    pScore >= 0.4 &&
    dirScore >= 0.4 &&
    cautions.filter((c) => c.includes("对立") || c.includes("周期尺度不匹配")).length === 0;

  if (!verified && semanticScore < 45) {
    cautions.unshift("⚠ 阿布语义判定：此页与截图不是同一类行情，请忽略或仅作反例");
  }

  const structureScore = Math.min(semanticScore, Math.round(semanticScore * 0.85 + patScore * 15));

  if (reasons.length === 0 && !verified) {
    cautions.push("视觉构图可能接近，但行情逻辑不一致");
  }

  return { structureScore, semanticScore, verified, reasons, cautions };
}

export function formatQuerySummary(q: ChartStructure): string {
  const pat =
    q.patternTags.length > 0 ? q.patternTags.slice(0, 2).join(" · ") : "";
  return [q.phaseLabel, q.scaleLabel, pat].filter(Boolean).join(" · ");
}

export { PHASE_LABEL };
