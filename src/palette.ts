import type { ArrowDirection, PaletteTemplate } from "./types";

const COLORS = {
  green: "#16a34a",
  red: "#dc2626",
  blue: "#2563eb",
  purple: "#7c3aed",
  pink: "#ec4899",
  orange: "#f97316",
  yellow: "#eab308",
  lightOrange: "#fdba74",
  lightBlue: "#93c5fd",
  lightPink: "#f9a8d4",
  lightGreen: "#86efac",
  lightYellow: "#fde047",
};

function text(id: string, label: string, color: string): PaletteTemplate {
  const w = Math.max(44, Math.min(120, label.length * 6.5 + 14));
  return {
    id,
    kind: "text-label",
    label,
    defaultWidth: w,
    defaultHeight: 26,
    props: { text: label, color },
  };
}

function smallRect(id: string, fill: string): PaletteTemplate {
  return {
    id,
    kind: "rect-small",
    label: "■",
    defaultWidth: 18,
    defaultHeight: 18,
    props: { fill },
  };
}

function tallRect(id: string, fill: string, outlined = false): PaletteTemplate {
  return {
    id,
    kind: "rect-tall",
    label: "▬",
    defaultWidth: 22,
    defaultHeight: 52,
    props: { fill, outlined },
  };
}

function zoneRect(id: string, fill: string): PaletteTemplate {
  return {
    id,
    kind: "rect-zone",
    label: "Zone",
    defaultWidth: 120,
    defaultHeight: 48,
    props: { fill, outlined: true },
  };
}

function hline(id: string, color: string): PaletteTemplate {
  return {
    id,
    kind: "hline",
    label: "—",
    defaultWidth: 140,
    defaultHeight: 4,
    props: { color },
  };
}

function arrow(
  id: string,
  color: string,
  direction: ArrowDirection,
  label: string,
): PaletteTemplate {
  return {
    id,
    kind: "arrow",
    label,
    defaultWidth: 48,
    defaultHeight: 48,
    props: { color, direction },
  };
}

const arrowDirs: { dir: ArrowDirection; label: string }[] = [
  { dir: "up", label: "↑" },
  { dir: "down", label: "↓" },
  { dir: "left", label: "←" },
  { dir: "right", label: "→" },
  { dir: "up-right", label: "↗" },
  { dir: "down-right", label: "↘" },
  { dir: "up-left", label: "↖" },
  { dir: "down-left", label: "↙" },
  { dir: "double-h", label: "↔" },
  { dir: "double-v", label: "↕" },
  { dir: "bend-ne", label: "⌐" },
  { dir: "bend-se", label: "⌙" },
  { dir: "bend-nw", label: "⌐" },
  { dir: "bend-sw", label: "⌙" },
];

function arrowsForColor(
  prefix: string,
  color: string,
  colorName: string,
): PaletteTemplate[] {
  return arrowDirs.map(({ dir, label }) =>
    arrow(`${prefix}-${dir}`, color, dir, `${colorName} ${label}`),
  );
}

/** Entry sequence — H1/H2/L1/L2 */
export const LABEL_ENTRY: PaletteTemplate[] = [
  text("h1", "H1", COLORS.green),
  text("h2", "H2", COLORS.green),
  text("l1", "L1", COLORS.red),
  text("l2", "L2", COLORS.red),
  text("h2-wedge", "H2 Wedge", COLORS.green),
  text("l2-ema", "L2 @ EMA", COLORS.red),
];

/** Trend & surprise */
export const LABEL_TREND: PaletteTemplate[] = [
  text("bull-maj-surp", "Bull Maj Surp", COLORS.green),
  text("bear-unlikely", "Bear unlikely", COLORS.green),
  text("bull-tfo", "Bull TFO", COLORS.green),
  text("bear-tfo", "Bear TFO", COLORS.red),
  text("spike", "Spike", COLORS.orange),
  text("ail", "AIL", COLORS.green),
  text("ais", "AIS", COLORS.red),
  text("bu-16", "Bu 16", COLORS.green),
  text("be-16", "Be 16", COLORS.red),
];

/** Reversal & patterns */
export const LABEL_PATTERNS: PaletteTemplate[] = [
  text("mtr", "MTR", COLORS.purple),
  text("hl-mtr", "HL MTR", COLORS.purple),
  text("lh-mtr", "LH MTR", COLORS.purple),
  text("wedge", "Wedge", COLORS.purple),
  text("trunc-wedge", "Trunc Wedge", COLORS.purple),
  text("micro-wedge", "Micro Wedge", COLORS.purple),
  text("dt", "DT", COLORS.red),
  text("db", "DB", COLORS.green),
  text("dt-lh", "DT LH", COLORS.red),
  text("hl-db", "HL DB", COLORS.green),
  text("cup-handle", "Cup & Hdl", COLORS.green),
];

/** Environment & context */
export const LABEL_CONTEXT: PaletteTemplate[] = [
  text("tr", "TR", COLORS.blue),
  text("tr-hl", "TR HL", COLORS.blue),
  text("got-tr", "Got TR", COLORS.blue),
  text("ema-test", "EMA Test", COLORS.blue),
  text("stretched", "Stretched", COLORS.blue),
  text("pb", "PB", COLORS.orange),
  text("big-gap-dn", "Big Gap Dn", COLORS.red),
  text("gap-bar", "Gap Bar", COLORS.orange),
  text("climax", "Climax", COLORS.orange),
  text("s-climax", "S Climax", COLORS.orange),
  text("yest-h", "Yest H", COLORS.green),
  text("yest-l", "Yest L", COLORS.red),
];

export const TEXT_LABELS: PaletteTemplate[] = [
  ...LABEL_ENTRY,
  ...LABEL_TREND,
  ...LABEL_PATTERNS,
  ...LABEL_CONTEXT,
];

export const SMALL_RECTS: PaletteTemplate[] = [
  smallRect("sq-orange", COLORS.lightOrange),
  smallRect("sq-blue", COLORS.lightBlue),
  smallRect("sq-pink", COLORS.lightPink),
  smallRect("sq-green", COLORS.lightGreen),
];

export const TALL_RECTS: PaletteTemplate[] = [
  tallRect("tall-blue", COLORS.blue, true),
  tallRect("tall-pink", COLORS.pink, true),
  tallRect("tall-yellow", COLORS.yellow, true),
  tallRect("tall-lblue", COLORS.lightBlue, true),
];

export const ZONE_RECTS: PaletteTemplate[] = [
  zoneRect("zone-blue", COLORS.blue),
  zoneRect("zone-red", COLORS.red),
  zoneRect("zone-green", COLORS.green),
];

export const LINES: PaletteTemplate[] = [
  hline("hline-orange", COLORS.orange),
  hline("hline-blue", COLORS.blue),
  hline("hline-pink", COLORS.pink),
  hline("hline-green", COLORS.green),
  {
    id: "vline-blue-up",
    kind: "arrow",
    label: "↑",
    defaultWidth: 32,
    defaultHeight: 64,
    props: { color: COLORS.blue, direction: "up" as ArrowDirection },
  },
  {
    id: "vline-blue-down",
    kind: "arrow",
    label: "↓",
    defaultWidth: 32,
    defaultHeight: 64,
    props: { color: COLORS.blue, direction: "down" as ArrowDirection },
  },
];

export const ARROW_PALETTE: PaletteTemplate[] = [
  ...arrowsForColor("arr-green", COLORS.green, "G"),
  ...arrowsForColor("arr-red", COLORS.red, "R"),
  ...arrowsForColor("arr-blue", COLORS.blue, "B"),
  ...arrowsForColor("arr-purple", COLORS.purple, "P"),
];

export const EXTRA_TOOLS: PaletteTemplate[] = [
  {
    id: "free-note",
    kind: "note",
    label: "复盘笔记",
    defaultWidth: 200,
    defaultHeight: 80,
    props: { text: "复盘：", color: "#ffffff" },
  },
];

export const ALL_SECTIONS = [
  { title: "进场 H/L", items: LABEL_ENTRY },
  { title: "趋势 & Surprise", items: LABEL_TREND },
  { title: "反转 & 形态", items: LABEL_PATTERNS },
  { title: "环境 & 位置", items: LABEL_CONTEXT },
  { title: "小方块（高亮K线）", items: SMALL_RECTS },
  { title: "竖条 / 区间框", items: [...TALL_RECTS, ...ZONE_RECTS] },
  { title: "水平线 & 竖箭头", items: LINES },
  { title: "箭头（绿 / 红 / 蓝 / 紫）", items: ARROW_PALETTE },
  { title: "工具", items: EXTRA_TOOLS },
];

export function findTemplate(id: string): PaletteTemplate | undefined {
  if (id === "mm-auto") return undefined;
  for (const section of ALL_SECTIONS) {
    const found = section.items.find((t) => t.id === id);
    if (found) return found;
  }
  return undefined;
}
