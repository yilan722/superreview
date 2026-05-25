export interface EncyclopediaPageEntry {
  page: number;
  thumb: string;
  /** HD image for zoom/detail view (typically 1280px wide). */
  preview?: string;
  fullHash: string;
  chartHash: string;
  /** 0–1: has real candlestick chart (filters title/divider slides). */
  chartScore?: number;
}

export interface EncyclopediaIndex {
  version: number;
  hashSize?: number;
  pdfFile?: string;
  pdfPathHint?: string;
  pages: EncyclopediaPageEntry[];
}

export type EncyclopediaHashMode = "chart" | "full" | "both";

export interface MatchReport {
  indexPages: number;
  queryChartScore: number;
  /** 哈希距离 ≤ 阈值的候选页数（全索引扫描） */
  candidatesInRange: number;
  /** 为凑满结果实际检查的候选页数 */
  scannedCandidates: number;
  skippedNonChart: number;
  skippedDuplicate: number;
  maxHammingDistance: number;
  /** 18bars = 最近18根K线；brooks = 全图结构；hash = 感知哈希（旧）；ohlc = 实时 OHLC 数值 */
  matchMode?: "18bars" | "brooks" | "hash" | "ohlc";
  barWindow?: number;
  skippedTitleSlides?: number;
  skippedIncompatible?: number;
  /** 最高阿布相容分 */
  bestBrooksScore?: number;
  /** 无高置信匹配，展示的是相对最高 */
  lowConfidenceFallback?: boolean;
}

export interface PhaseAlignmentRow {
  brooksElement: string;
  queryBars: string;
  slideBars: string;
  queryEma: string;
  slideEma: string;
  matched: boolean;
}

export interface EncyclopediaMatch {
  page: number;
  thumb: string;
  preview?: string;
  score: number;
  fullDistance: number;
  chartDistance: number;
  /** 该页是否含真实 K 线图 0–1 */
  chartScore?: number;
  /** 结构形态一致性 0–100（与视觉分互补） */
  structureScore?: number;
  /** 阿布语义相容度 0–100（周期/阶段/方向） */
  semanticScore?: number;
  /** 通过语义闸门，可视为真实相似 */
  verified?: boolean;
  slidePhaseLabel?: string;
  slideScaleLabel?: string;
  reasons?: string[];
  cautions?: string[];
  phaseScore?: number;
  slidePhaseSig?: string;
  phaseAlignments?: PhaseAlignmentRow[];
  queryPhaseSig?: string;
  /** 未达已验证门槛，仅供参考 */
  lowConfidence?: boolean;
  /** Brooks 元素逐条对照（OHLC 匹配） */
  brooksElementRows?: Array<{
    element: string;
    elementEn: string;
    queryDetail: string;
    slideDetail: string;
    matched: boolean;
  }>;
}
