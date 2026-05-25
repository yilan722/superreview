import { chartPageScoreFromImageData } from "./chartPageScore";
import { extractBarSeries, validBars } from "./barSeries";
import { luminance } from "./chartPixels";

export type SlidePageKind = "chart_slide" | "title_slide" | "divider_slide";

export interface SlidePageAnalysis {
  kind: SlidePageKind;
  chartScore: number;
  /** 主图 K 线占比（全页） */
  candleDominance: number;
  isTitleLike: boolean;
}

function cropImageData(
  data: ImageData,
  leftPct: number,
  rightPct: number,
  topPct = 0.08,
  bottomPct = 0.82,
): ImageData {
  const { width, height } = data;
  const l = Math.floor(width * leftPct);
  const r = Math.floor(width * rightPct);
  const t = Math.floor(height * topPct);
  const b = Math.floor(height * bottomPct);
  const cw = Math.max(1, r - l);
  const ch = Math.max(1, b - t);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const tmp = document.createElement("canvas");
  tmp.width = width;
  tmp.height = height;
  tmp.getContext("2d")!.putImageData(data, 0, 0);
  ctx.drawImage(tmp, l, t, cw, ch, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch);
}

function orangeRatio(data: ImageData): number {
  const { data: px } = data;
  let orange = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 16) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    n++;
    if (r > 200 && g > 85 && g < 210 && b < 130) orange++;
  }
  return orange / Math.max(1, n);
}

function candleDominance(data: ImageData): number {
  const series = extractBarSeries(data);
  const bars = validBars(series);
  return bars.length / Math.max(1, series.width);
}

/**
 * 区分：完整 K 线教学页 vs 封面/人物介绍/章节标题页（如 p.787）。
 */
export function analyzeSlidePage(data: ImageData): SlidePageAnalysis {
  const orange = orangeRatio(data);

  const fullScore = chartPageScoreFromImageData(data);
  const center = cropImageData(data, 0.04, 0.96);
  const centerScore = chartPageScoreFromImageData(center);
  const right = cropImageData(data, 0.52, 0.98);
  const rightScore = chartPageScoreFromImageData(right);
  const left = cropImageData(data, 0, 0.48);
  const leftScore = chartPageScoreFromImageData(left);

  const dom = candleDominance(center);

  let skin = 0;
  let samples = 0;
  const { width, height, data: px } = left;
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const i = (y * width + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      samples++;
      if (r > 95 && g > 60 && b > 40 && r > b && g > b * 0.7 && luminance(r, g, b) < 200) {
        skin++;
      }
    }
  }
  const skinRatio = skin / Math.max(1, samples);

  const isTitleLike =
    orange > 0.2 ||
    (skinRatio > 0.12 && leftScore < 0.28 && centerScore < 0.42) ||
    (leftScore < 0.22 && rightScore > 0.32 && centerScore < 0.45) ||
    (dom < 0.14 && fullScore < 0.38) ||
    (centerScore < 0.35 && rightScore < 0.35);

  let kind: SlidePageKind = "chart_slide";
  if (isTitleLike) {
    kind = orange > 0.24 || skinRatio > 0.14 ? "title_slide" : "divider_slide";
  }

  const chartScore = Math.max(centerScore, fullScore * 0.85);

  return {
    kind,
    chartScore,
    candleDominance: dom,
    isTitleLike: kind !== "chart_slide",
  };
}

export const MIN_CHART_SLIDE_SCORE = 0.48;
