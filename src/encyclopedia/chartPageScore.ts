import { extractBarSeries, validBars } from "./barSeries";
import { resolveQueryChartRegion } from "./detectChartRegion";
import { CHART_CROP, loadImage } from "./phash";

/** Minimum score to treat a PDF page as a real candlestick slide. */
export const MIN_CHART_PAGE_SCORE = 0.42;

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function chartCropFromImage(img: HTMLImageElement): ImageData {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  const left = Math.floor(w * CHART_CROP.left);
  const top = Math.floor(h * CHART_CROP.top);
  const cw = Math.floor(w * (CHART_CROP.right - CHART_CROP.left));
  const ch = Math.floor(h * (CHART_CROP.bottom - CHART_CROP.top));
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.drawImage(img, left, top, cw, ch, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch);
}

function emaLineRatio(data: ImageData): number {
  const { width, height, data: px } = data;
  let blue = 0;
  let sampled = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      sampled++;
      if (b > r + 18 && b > g + 8 && b > 90 && r < 220) blue++;
    }
  }
  return blue / Math.max(1, sampled);
}

function candleLikeColumns(bars: ReturnType<typeof validBars>, height: number): number {
  let n = 0;
  for (const b of bars) {
    if (!b.valid) continue;
    const rangeNorm = b.range / height;
    const bodyRatio = b.body / Math.max(1, b.range);
    const hasTail =
      b.upperTail > height * 0.008 || b.lowerTail > height * 0.008;
    if (
      rangeNorm > 0.02 &&
      rangeNorm < 0.38 &&
      bodyRatio > 0.15 &&
      bodyRatio < 0.82 &&
      hasTail
    ) {
      n++;
    }
  }
  return n;
}

/**
 * 0–1: does this image contain a real candlestick chart in the K-line region?
 * Title slides, section dividers, pure text → near 0.
 */
export function chartPageScoreFromImageData(data: ImageData): number {
  const { width, height, data: px } = data;
  const barSeries = extractBarSeries(data);
  const bars = validBars(barSeries);
  const candleCols = candleLikeColumns(bars, height);
  const candleRatio = candleCols / Math.max(1, width);

  if (candleRatio < 0.1) return 0;

  const spreads = bars.map((b) => (b.low - b.high) / height);
  const hlSpread = median(spreads);

  let switches = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].isBull !== bars[i - 1].isBull) switches++;
  }
  const switchRate = switches / Math.max(1, bars.length - 1);

  let orange = 0;
  let samples = 0;
  for (let i = 0; i < px.length; i += 16) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    samples++;
    if (r > 200 && g > 85 && g < 210 && b < 130) orange++;
  }
  const orangeRatio = orange / Math.max(1, samples);

  const emaRatio = emaLineRatio(data);

  if (orangeRatio > 0.28) return Math.min(0.08, candleRatio * 0.1);

  const isDark = barSeries.theme === "dark";

  let score =
    Math.min(0.55, candleRatio * 0.95) +
    Math.min(0.25, hlSpread * 1.5) +
    Math.min(0.12, switchRate * 0.8);

  if (emaRatio > 0.003) score += 0.12;
  if (isDark && candleRatio > 0.18) score = Math.max(score, 0.48);
  if (candleRatio > 0.3) score = Math.max(score, 0.52);

  return Math.min(1, Math.max(0, score));
}

export async function chartPageScoreFromUrl(url: string): Promise<number> {
  const img = await loadImage(url);
  const data = chartCropFromImage(img);
  return chartPageScoreFromImageData(data);
}

export async function chartPageScoreFromDataUrl(
  dataUrl: string,
  crop?: { x: number; y: number; w: number; h: number } | null,
): Promise<number> {
  const region = await resolveQueryChartRegion(dataUrl, crop ?? undefined);
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = region.w;
  canvas.height = region.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 不可用");
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
  return chartPageScoreFromImageData(
    ctx.getImageData(0, 0, region.w, region.h),
  );
}
