import { resolveQueryChartRegion } from "./detectChartRegion";

const HASH_SIZE = 8;

/** Crop ratios matching scripts/encyclopedia/build_index.py */
export const CHART_CROP = {
  left: 0.04,
  right: 0.96,
  top: 0.1,
  bottom: 0.78,
} as const;

export function hammingHex(a: string, b: string): number {
  const av = BigInt(`0x${a}`);
  const bv = BigInt(`0x${b}`);
  let x = av ^ bv;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

export function hashToScore(distance: number, bits = 64): number {
  return Math.round(((bits - distance) / bits) * 1000) / 10;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("无法加载图片"));
    img.src = src;
  });
}

function drawRegion(
  img: HTMLImageElement,
  crop?: { x: number; y: number; w: number; h: number },
): ImageData {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 不可用");

  if (crop && crop.w > 4 && crop.h > 4) {
    canvas.width = crop.w;
    canvas.height = crop.h;
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  } else {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function grayscaleResize(data: ImageData, outW: number, outH: number): Uint8ClampedArray {
  const { width, height, data: px } = data;
  const out = new Uint8ClampedArray(outW * outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(width - 1, Math.floor((x / outW) * width));
      const sy = Math.min(height - 1, Math.floor((y / outH) * height));
      const i = (sy * width + sx) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      out[y * outW + x] = lum;
    }
  }
  return out;
}

export function dhashFromImageData(image: ImageData): string {
  const w = HASH_SIZE + 1;
  const h = HASH_SIZE;
  const gray = grayscaleResize(image, w, h);
  let value = 0n;
  for (let row = 0; row < HASH_SIZE; row++) {
    for (let col = 0; col < HASH_SIZE; col++) {
      const left = gray[row * w + col];
      const right = gray[row * w + col + 1];
      value = (value << 1n) | (left > right ? 1n : 0n);
    }
  }
  return value.toString(16).padStart(16, "0");
}

export async function computeHashesFromDataUrl(
  dataUrl: string,
  crop?: { x: number; y: number; w: number; h: number },
): Promise<{ fullHash: string; chartHash: string }> {
  const region = await resolveQueryChartRegion(dataUrl, crop);
  const img = await loadImage(dataUrl);
  const klineData = drawRegion(img, region);
  return {
    fullHash: dhashFromImageData(klineData),
    chartHash: dhashFromImageData(klineData),
  };
}
