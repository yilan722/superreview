import type { EncyclopediaIndex } from "./types";

const INDEX_URL = "/encyclopedia-data/index.json";

let cached: EncyclopediaIndex | null = null;

export async function loadEncyclopediaIndex(
  force = false,
): Promise<EncyclopediaIndex | null> {
  if (cached && !force) return cached;
  try {
    const res = await fetch(INDEX_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as EncyclopediaIndex;
    if (!data.pages?.length) return null;
    cached = data;
    return data;
  } catch {
    return null;
  }
}

export function encyclopediaAssetUrl(relativePath: string): string {
  return `/encyclopedia-data/${relativePath}`;
}

export function encyclopediaThumbUrl(thumb: string): string {
  return encyclopediaAssetUrl(thumb);
}

/** Prefer HD preview for detail/zoom; fall back to grid thumb. */
export function encyclopediaDisplayUrl(entry: {
  thumb: string;
  preview?: string;
}): string {
  return encyclopediaAssetUrl(entry.preview ?? entry.thumb);
}
