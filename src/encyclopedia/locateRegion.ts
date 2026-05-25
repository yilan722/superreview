import { CHART_CROP, dhashFromImageData, hammingHex, hashToScore, loadImage } from "./phash";

export type PixelRect = { x: number; y: number; w: number; h: number };

export interface LocatedRegion {
  rect: PixelRect;
  distance: number;
  localScore: number;
}

function cropImageData(
  source: ImageData,
  rect: PixelRect,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = rect.w;
  canvas.height = rect.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.putImageData(source, -rect.x, -rect.y);
  return ctx.getImageData(0, 0, rect.w, rect.h);
}

function imageDataFromElement(img: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Aspect ratio (width/height) of the region used for matching. */
export function queryCompareAspect(
  imgW: number,
  imgH: number,
  crop?: PixelRect | null,
): number {
  if (crop && crop.w > 20 && crop.h > 20) {
    return crop.w / crop.h;
  }
  const cw = imgW * (CHART_CROP.right - CHART_CROP.left);
  const ch = imgH * (CHART_CROP.bottom - CHART_CROP.top);
  return cw / ch;
}

function chartBounds(w: number, h: number): PixelRect {
  return {
    x: Math.floor(w * CHART_CROP.left),
    y: Math.floor(h * CHART_CROP.top),
    w: Math.floor(w * (CHART_CROP.right - CHART_CROP.left)),
    h: Math.floor(h * (CHART_CROP.bottom - CHART_CROP.top)),
  };
}

/**
 * Slide a fixed-aspect window over the slide's chart area; return the window
 * whose dHash is closest to the query hash.
 */
export async function locateSimilarRegion(
  slideUrl: string,
  queryHash: string,
  queryAspect: number,
): Promise<LocatedRegion> {
  const img = await loadImage(slideUrl);
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const full = imageDataFromElement(img);
  const bounds = chartBounds(sw, sh);

  let winH = Math.round(bounds.h * 0.88);
  let winW = Math.round(winH * queryAspect);
  if (winW > bounds.w) {
    winW = bounds.w;
    winH = Math.round(winW / queryAspect);
  }
  winW = Math.max(48, winW);
  winH = Math.max(36, winH);

  const step = Math.max(10, Math.round(Math.min(winW, winH) / 6));
  let best: LocatedRegion = {
    rect: { x: bounds.x, y: bounds.y, w: winW, h: winH },
    distance: 64,
    localScore: 0,
  };

  const xEnd = Math.max(bounds.x, bounds.x + bounds.w - winW);
  const yEnd = Math.max(bounds.y, bounds.y + bounds.h - winH);

  for (let y = bounds.y; y <= yEnd; y += step) {
    for (let x = bounds.x; x <= xEnd; x += step) {
      const rect = { x, y, w: winW, h: winH };
      const patch = cropImageData(full, rect);
      const hash = dhashFromImageData(patch);
      const distance = hammingHex(queryHash, hash);
      if (distance < best.distance) {
        best = {
          rect,
          distance,
          localScore: hashToScore(distance),
        };
      }
    }
  }

  // Refine around best cell with finer step
  const refineStep = Math.max(4, Math.floor(step / 2));
  const rx0 = Math.max(bounds.x, best.rect.x - step);
  const ry0 = Math.max(bounds.y, best.rect.y - step);
  const rx1 = Math.min(xEnd, best.rect.x + step);
  const ry1 = Math.min(yEnd, best.rect.y + step);

  for (let y = ry0; y <= ry1; y += refineStep) {
    for (let x = rx0; x <= rx1; x += refineStep) {
      const rect = { x, y, w: winW, h: winH };
      const patch = cropImageData(full, rect);
      const hash = dhashFromImageData(patch);
      const distance = hammingHex(queryHash, hash);
      if (distance < best.distance) {
        best = { rect, distance, localScore: hashToScore(distance) };
      }
    }
  }

  return best;
}

export function rectToPercent(
  rect: PixelRect,
  imgW: number,
  imgH: number,
): { left: string; top: string; width: string; height: string } {
  return {
    left: `${(rect.x / imgW) * 100}%`,
    top: `${(rect.y / imgH) * 100}%`,
    width: `${(rect.w / imgW) * 100}%`,
    height: `${(rect.h / imgH) * 100}%`,
  };
}
