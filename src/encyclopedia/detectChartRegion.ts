import { extractBarSeries, validBars } from "./barSeries";
import {
  classifyPixel,
  detectTheme,
  isChartBackground,
  luminance,
} from "./chartPixels";
import { CHART_CROP, loadImage } from "./phash";

export type PixelRect = { x: number; y: number; w: number; h: number };

const ANALYSIS_WIDTH = 360;

/** Per-column score: looks like a candlestick column vs indicator/text. */
function columnScores(data: ImageData): Float32Array {
  const { width, height, data: px } = data;
  const theme = detectTheme(data);
  const scores = new Float32Array(width);

  for (let x = 0; x < width; x++) {
    const ys: number[] = [];
    let bull = 0;
    let bear = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const kind = classifyPixel(r, g, b, theme);
      if (kind === "skip") continue;
      ys.push(y);
      if (kind === "bull") bull++;
      else if (kind === "bear") bear++;
    }
    if (ys.length < height * 0.03) {
      scores[x] = 0;
      continue;
    }
    const span = (Math.max(...ys) - Math.min(...ys)) / height;
    const bodyEst = span * 0.4;
    const hasTail = span > bodyEst * 1.15;
    const alt = Math.min(bull, bear) / Math.max(1, bull + bear);
    let s = 0;
    if (span > 0.04 && span < 0.55 && hasTail) s += 0.55;
    if (ys.length / height > 0.06) s += 0.2;
    if (alt > 0.08) s += 0.15;
    scores[x] = Math.min(1, s);
  }
  return scores;
}

/** Bottom strip that looks like volume histogram (wide horizontal bars). */
function findVolumeTopRow(data: ImageData, x0: number, x1: number): number | null {
  const { width, height, data: px } = data;
  const startY = Math.floor(height * 0.55);
  let bestY = -1;
  let bestScore = 0;

  const theme = detectTheme(data);
  for (let y = startY; y < height - 2; y++) {
    let wide = 0;
    let samples = 0;
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (isChartBackground(r, g, b, theme)) continue;
      samples++;
      const lum = luminance(r, g, b);
      const threshold = theme === "dark" ? 80 : 190;
      if (lum < threshold || classifyPixel(r, g, b, theme) !== "skip") wide++;
    }
    if (samples < (x1 - x0) * 0.3) continue;
    const ratio = wide / samples;
    if (ratio > 0.42 && ratio > bestScore) {
      bestScore = ratio;
      bestY = y;
    }
  }
  if (bestY > 0 && bestScore > 0.45) {
    return Math.max(0, bestY - Math.floor(height * 0.02));
  }
  return null;
}

function bestHorizontalSegment(
  scores: Float32Array,
  minWidth: number,
): { start: number; end: number } | null {
  let bestStart = 0;
  let bestEnd = 0;
  let bestSum = -1;
  let segStart = 0;
  let sum = 0;

  const flush = (end: number) => {
    const w = end - segStart;
    if (w < minWidth) return;
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = segStart;
      bestEnd = end;
    }
  };

  for (let i = 0; i <= scores.length; i++) {
    const ok = i < scores.length && scores[i] >= 0.28;
    if (ok) {
      if (i === segStart) sum = 0;
      sum += scores[i];
    } else if (i > segStart) {
      flush(i);
      segStart = i + 1;
      sum = 0;
    }
  }
  if (bestSum < 0) return null;
  return { start: bestStart, end: bestEnd - 1 };
}

function verticalBounds(
  data: ImageData,
  x0: number,
  x1: number,
  yMax: number,
): { top: number; bottom: number } {
  const { width, height, data: px } = data;
  let top = height;
  let bottom = 0;
  const theme = detectTheme(data);
  for (let x = x0; x <= x1; x++) {
    for (let y = 0; y < yMax; y++) {
      const i = (y * width + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (classifyPixel(r, g, b, theme) === "skip") continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (bottom <= top) {
    return { top: Math.floor(height * 0.08), bottom: Math.floor(height * 0.72) };
  }
  const pad = Math.floor((bottom - top) * 0.04);
  return {
    top: Math.max(0, top - pad),
    bottom: Math.min(yMax, bottom + pad),
  };
}

function scaleRect(
  rect: PixelRect,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): PixelRect {
  const sx = toW / fromW;
  const sy = toH / fromH;
  return {
    x: Math.max(0, Math.floor(rect.x * sx)),
    y: Math.max(0, Math.floor(rect.y * sy)),
    w: Math.min(toW, Math.ceil(rect.w * sx)),
    h: Math.min(toH, Math.ceil(rect.h * sy)),
  };
}

function fallbackRect(w: number, h: number): PixelRect {
  return {
    x: Math.floor(w * CHART_CROP.left),
    y: Math.floor(h * CHART_CROP.top),
    w: Math.floor(w * (CHART_CROP.right - CHART_CROP.left)),
    h: Math.floor(h * (CHART_CROP.bottom - CHART_CROP.top)),
  };
}

/**
 * Auto-detect main candlestick plot area (excludes volume, side panels, most overlays).
 */
export function detectChartRegionFromImageData(data: ImageData): PixelRect | null {
  const canvas = document.createElement("canvas");
  const aw = ANALYSIS_WIDTH;
  const ah = Math.max(48, Math.round(data.height * (aw / data.width)));
  canvas.width = aw;
  canvas.height = ah;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const tmp = document.createElement("canvas");
  tmp.width = data.width;
  tmp.height = data.height;
  const tctx = tmp.getContext("2d");
  if (!tctx) return null;
  tctx.putImageData(data, 0, 0);
  ctx.drawImage(tmp, 0, 0, aw, ah);
  const scaled = ctx.getImageData(0, 0, aw, ah);

  const scores = columnScores(scaled);
  const seg = bestHorizontalSegment(scores, Math.floor(aw * 0.28));
  if (!seg) return null;

  const volTop = findVolumeTopRow(scaled, seg.start, seg.end);
  const yLimit = volTop ?? ah;
  const { top, bottom } = verticalBounds(scaled, seg.start, seg.end, yLimit);

  const rect = scaleRect(
    {
      x: seg.start,
      y: top,
      w: seg.end - seg.start + 1,
      h: Math.max(24, bottom - top),
    },
    aw,
    ah,
    data.width,
    data.height,
  );

  if (rect.w < data.width * 0.2 || rect.h < data.height * 0.15) {
    return null;
  }
  return rect;
}

export function detectChartRegionFromImage(img: HTMLImageElement): PixelRect | null {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return detectChartRegionFromImageData(data);
}

export async function detectChartRegionFromDataUrl(
  dataUrl: string,
): Promise<PixelRect | null> {
  const img = await loadImage(dataUrl);
  return detectChartRegionFromImage(img);
}

/** Manual crop wins; otherwise auto-detect; else Brooks-style ratio fallback. */
export async function resolveQueryChartRegion(
  dataUrl: string,
  manual?: PixelRect | null,
): Promise<PixelRect> {
  if (manual && manual.w > 20 && manual.h > 20) return manual;
  const img = await loadImage(dataUrl);
  const auto = detectChartRegionFromImage(img);
  if (auto && auto.w > 20 && auto.h > 20) return auto;
  return fallbackRect(img.naturalWidth, img.naturalHeight);
}

/** Confidence 0–1 that auto region contains candlesticks. */
export function confidenceOfRegion(data: ImageData, rect: PixelRect): number {
  const canvas = document.createElement("canvas");
  canvas.width = rect.w;
  canvas.height = rect.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.putImageData(data, -rect.x, -rect.y);
  const patch = ctx.getImageData(0, 0, rect.w, rect.h);
  const series = extractBarSeries(patch);
  const bars = validBars(series);
  const ratio = bars.length / Math.max(1, series.width);
  const candleCols = bars.filter(
    (b) => b.valid && b.range / series.height > 0.02 && b.range / series.height < 0.5,
  ).length;
  return Math.min(1, ratio * 0.5 + (candleCols / Math.max(1, series.width)) * 0.5);
}
