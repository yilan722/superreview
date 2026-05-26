/** Root URL for encyclopedia static assets (no trailing slash). */
export function encyclopediaBlobBase(): string {
  const raw = import.meta.env.VITE_ENCYCLOPEDIA_BASE_URL?.trim();
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

/** e.g. knowledge.json, index.json, thumbs/00001.jpg */
export function encyclopediaDataUrl(relativePath: string): string {
  const rel = relativePath.replace(/^\//, "");
  const base = encyclopediaBlobBase();
  if (base) return `${base}/encyclopedia-data/${rel}`;
  return `/encyclopedia-data/${rel}`;
}

export function encyclopediaUsesRemoteCdn(): boolean {
  return !!encyclopediaBlobBase();
}
