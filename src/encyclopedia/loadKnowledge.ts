import type { StoredNumericProfile } from "./numericProfile";

export interface KnowledgeChunk {
  barStart: number;
  barEnd: number;
  openingSetup: string;
  direction: "up" | "down" | "sideways";
  setup: string;
  overlap: number;
}

export interface KnowledgePage {
  page: number;
  thumb: string;
  chartHash: string;
  kind: "chart_slide" | "title_slide" | "divider_slide";
  barCount: number;
  openingSetup: string;
  direction: "up" | "down" | "sideways";
  setup: string;
  overlap: number;
  candleDominance: number;
  chunks: KnowledgeChunk[];
  /** Offline-built 18-bar numeric profiles (sliding windows). Used for pure numeric match. */
  windows?: StoredNumericProfile[];
}

export interface EncyclopediaKnowledge {
  version: number;
  indexVersion?: number;
  generatedAt?: string;
  pageCount: number;
  pages: KnowledgePage[];
}

const KNOWLEDGE_URL = "/encyclopedia-data/knowledge.json";
let cached: EncyclopediaKnowledge | null = null;

export async function loadEncyclopediaKnowledge(
  force = false,
): Promise<EncyclopediaKnowledge | null> {
  if (cached && !force) return cached;
  try {
    const res = await fetch(KNOWLEDGE_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as EncyclopediaKnowledge;
    if (!data.pages?.length) return null;
    cached = data;
    return data;
  } catch {
    return null;
  }
}

