/** Light (Brooks PDF) vs dark (TradingView/Binance) chart themes. */

export type ChartTheme = "light" | "dark";

export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function detectTheme(data: ImageData): ChartTheme {
  const { width, height, data: px } = data;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const i = (y * width + x) * 4;
      sum += luminance(px[i], px[i + 1], px[i + 2]);
      n++;
    }
  }
  return sum / Math.max(1, n) < 95 ? "dark" : "light";
}

export function isEmaLine(r: number, g: number, b: number): boolean {
  return b > r + 18 && b > g + 8 && b > 90 && r < 220;
}

export function isChartBackground(
  r: number,
  g: number,
  b: number,
  theme: ChartTheme,
): boolean {
  const lum = luminance(r, g, b);
  if (theme === "dark") return lum < 44;
  return lum > 235;
}

export function isGridOrChrome(
  r: number,
  g: number,
  b: number,
  theme: ChartTheme,
): boolean {
  const lum = luminance(r, g, b);
  if (theme === "light") return lum > 215;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return lum >= 44 && lum < 120 && sat < 32;
}

export function isBullCandle(
  r: number,
  g: number,
  b: number,
  theme: ChartTheme,
): boolean {
  if (theme === "dark") {
    return g > r + 10 && g > b + 6 && g > 65;
  }
  return g > r + 12 && g > b;
}

export function isBearCandle(
  r: number,
  g: number,
  b: number,
  theme: ChartTheme,
): boolean {
  if (theme === "dark") {
    return r > g + 10 && r > b + 6 && r > 65;
  }
  return r > g + 12 && r > b;
}

export function isCandlePixel(
  r: number,
  g: number,
  b: number,
  theme: ChartTheme,
): boolean {
  if (isChartBackground(r, g, b, theme)) return false;
  if (isEmaLine(r, g, b)) return false;
  if (isGridOrChrome(r, g, b, theme)) return false;
  if (isBullCandle(r, g, b, theme) || isBearCandle(r, g, b, theme)) return true;
  if (theme === "light") {
    const lum = luminance(r, g, b);
    return lum < 205;
  }
  return false;
}

export function classifyPixel(
  r: number,
  g: number,
  b: number,
  theme: ChartTheme,
): "skip" | "candle" | "bull" | "bear" {
  if (
    isChartBackground(r, g, b, theme) ||
    isEmaLine(r, g, b) ||
    isGridOrChrome(r, g, b, theme)
  ) {
    return "skip";
  }
  if (isBullCandle(r, g, b, theme)) return "bull";
  if (isBearCandle(r, g, b, theme)) return "bear";
  if (theme === "light" && luminance(r, g, b) < 205) return "candle";
  return "skip";
}
