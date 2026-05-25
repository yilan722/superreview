import { extractBarSeries, validBars } from "./barSeries";

export type SlideScale = "intraday" | "daily_swing" | "macro" | "unknown";

export function detectSlideScale(data: ImageData): SlideScale {
  const series = extractBarSeries(data);
  const bars = validBars(series);
  const n = bars.length;
  if (n < 8) return "unknown";

  const density = n / Math.max(1, series.width);
  const avgSpan =
    bars.reduce((s, b) => s + b.range / series.height, 0) / Math.max(1, n);

  if (density < 0.2 && avgSpan > 0.26) return "macro";
  if (density >= 0.42) return "intraday";
  if (density >= 0.22) return "daily_swing";
  return "unknown";
}

export function scaleCompatibility(
  query: SlideScale,
  slide: SlideScale,
): number {
  if (query === "unknown" || slide === "unknown") return 0.85;
  if (query === slide) return 1;
  if (query === "intraday" && slide === "daily_swing") return 0.75;
  if (query === "daily_swing" && slide === "intraday") return 0.75;
  if (slide === "macro") return 0.12;
  if (query === "macro") return 0.2;
  return 0.5;
}

export const SCALE_LABEL: Record<SlideScale, string> = {
  intraday: "日内 K 线（5m/15m 级）",
  daily_swing: "日线/波段",
  macro: "年线/多年宏观图",
  unknown: "未判定周期",
};
