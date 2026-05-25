/** Per-column bar geometry extracted from chart image (y grows downward). */

import {
  classifyPixel,
  detectTheme,
  type ChartTheme,
} from "./chartPixels";

export interface BarSeries {
  bars: BarColumn[];
  width: number;
  height: number;
  theme: ChartTheme;
}

export interface BarColumn {
  x: number;
  high: number;
  low: number;
  open: number;
  close: number;
  isBull: boolean;
  range: number;
  body: number;
  upperTail: number;
  lowerTail: number;
  valid: boolean;
}

export function extractBarSeries(data: ImageData): BarSeries {
  const { width, height, data: px } = data;
  const theme = detectTheme(data);
  const bars: BarColumn[] = [];

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
      else if (g > r + 8 && g > b) bull++;
      else if (r > g + 8 && r > b) bear++;
    }

    if (ys.length < height * 0.03) {
      bars.push(emptyBar(x));
      continue;
    }

    const high = Math.min(...ys);
    const low = Math.max(...ys);
    const range = low - high;
    const isBull = bull >= bear;

    const sorted = [...ys].sort((a, b) => a - b);
    const q25 = sorted[Math.floor(sorted.length * 0.25)];
    const q75 = sorted[Math.floor(sorted.length * 0.75)];
    const bodyTop = q25;
    const bodyBottom = q75;
    const body = Math.max(1, bodyBottom - bodyTop);
    const open = isBull ? bodyBottom : bodyTop;
    const close = isBull ? bodyTop : bodyBottom;
    const upperTail = Math.max(0, bodyTop - high);
    const lowerTail = Math.max(0, low - bodyBottom);

    bars.push({
      x,
      high,
      low,
      open,
      close,
      isBull,
      range: Math.max(1, range),
      body,
      upperTail,
      lowerTail,
      valid: range > height * 0.02,
    });
  }

  return { bars, width, height, theme };
}

function emptyBar(x: number): BarColumn {
  return {
    x,
    high: 0,
    low: 0,
    open: 0,
    close: 0,
    isBull: true,
    range: 0,
    body: 0,
    upperTail: 0,
    lowerTail: 0,
    valid: false,
  };
}

export function validBars(series: BarSeries): BarColumn[] {
  return series.bars.filter((b) => b.valid);
}
