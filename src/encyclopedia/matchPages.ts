import { encyclopediaAssetUrl } from "./loadIndex";
import {
  chartPageScoreFromUrl,
  MIN_CHART_PAGE_SCORE,
} from "./chartPageScore";
import { hammingHex, hashToScore } from "./phash";
import type {
  EncyclopediaHashMode,
  EncyclopediaIndex,
  EncyclopediaMatch,
  EncyclopediaPageEntry,
  MatchReport,
} from "./types";

const DEDUPE_CHART_MAX = 4;
const DEDUPE_FULL_MAX = 6;

/** 默认最大哈希距离（64 位中）。越小越严格，28≈56% 太松易误配标题页。 */
const DEFAULT_MAX_DISTANCE = 22;

export function areNearDuplicateSlides(
  a: Pick<EncyclopediaPageEntry, "fullHash" | "chartHash">,
  b: Pick<EncyclopediaPageEntry, "fullHash" | "chartHash">,
): boolean {
  const chartDist = hammingHex(a.chartHash, b.chartHash);
  if (chartDist === 0) return true;
  const fullDist = hammingHex(a.fullHash, b.fullHash);
  return chartDist <= DEDUPE_CHART_MAX && fullDist <= DEDUPE_FULL_MAX;
}

function combinedDistance(
  query: { fullHash: string; chartHash: string },
  entry: EncyclopediaPageEntry,
  mode: EncyclopediaHashMode,
): number {
  const fullDistance = hammingHex(query.fullHash, entry.fullHash);
  const chartDistance = hammingHex(query.chartHash, entry.chartHash);
  switch (mode) {
    case "full":
      return fullDistance;
    case "chart":
      return chartDistance;
    case "both":
    default:
      return fullDistance * 0.35 + chartDistance * 0.65;
  }
}

async function resolveChartScore(entry: EncyclopediaPageEntry): Promise<number> {
  if (entry.chartScore != null) return entry.chartScore;
  const url = encyclopediaAssetUrl(entry.preview ?? entry.thumb);
  return chartPageScoreFromUrl(url);
}

export async function matchEncyclopediaPagesAsync(
  index: EncyclopediaIndex,
  query: { fullHash: string; chartHash: string },
  options?: {
    topK?: number;
    mode?: EncyclopediaHashMode;
    maxDistance?: number;
    queryChartScore?: number;
  },
): Promise<{
  matches: EncyclopediaMatch[];
  report: MatchReport;
}> {
  const displayK = options?.topK ?? 12;
  /** 多取候选，供语义过滤后仍能凑满结果 */
  const topK = Math.min(displayK * 3, 48);
  const mode = options?.mode ?? "both";
  const maxDistance = options?.maxDistance ?? DEFAULT_MAX_DISTANCE;

  const entryByPage = new Map(index.pages.map((p) => [p.page, p]));

  const scored = index.pages
    .map((entry) => {
      const primary = combinedDistance(query, entry, mode);
      const fullDistance = hammingHex(query.fullHash, entry.fullHash);
      const chartDistance = hammingHex(query.chartHash, entry.chartHash);
      return {
        page: entry.page,
        thumb: entry.thumb,
        preview: entry.preview,
        score: hashToScore(primary),
        fullDistance,
        chartDistance,
        _sort: primary,
      };
    })
    .filter((m) => m._sort <= maxDistance)
    .sort((a, b) => a._sort - b._sort);

  const picked: EncyclopediaMatch[] = [];
  const pickedEntries: EncyclopediaPageEntry[] = [];
  let skippedNonChart = 0;
  let skippedDuplicate = 0;
  let scannedCandidates = 0;

  for (const row of scored) {
    if (picked.length >= topK) break;
    scannedCandidates++;
    const entry = entryByPage.get(row.page);
    if (!entry) continue;

    const chartScore = await resolveChartScore(entry);
    if (chartScore < MIN_CHART_PAGE_SCORE) {
      skippedNonChart++;
      continue;
    }

    if (pickedEntries.some((prev) => areNearDuplicateSlides(prev, entry))) {
      skippedDuplicate++;
      continue;
    }

    pickedEntries.push(entry);
    picked.push({
      page: row.page,
      thumb: row.thumb,
      preview: entry.preview,
      score: row.score,
      fullDistance: row.fullDistance,
      chartDistance: row.chartDistance,
      chartScore: Math.round(chartScore * 1000) / 1000,
    });
  }

  const report: MatchReport = {
    indexPages: index.pages.length,
    queryChartScore: options?.queryChartScore ?? 0,
    candidatesInRange: scored.length,
    scannedCandidates,
    skippedNonChart,
    skippedDuplicate,
    maxHammingDistance: maxDistance,
  };

  return { matches: picked, report };
}
