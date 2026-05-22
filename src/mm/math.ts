export interface Point {
  x: number;
  y: number;
}

export interface MmTargetLine {
  id: string;
  y: number;
  label: string;
  color: string;
  dashed?: boolean;
  opacity?: number;
}

/** Al Brooks–style projections from a measured leg (P1 → P2). */
export function computeMmTargets(p1: Point, p2: Point): MmTargetLine[] {
  const height = Math.abs(p2.y - p1.y);
  if (height < 4) return [];

  const bullLeg = p2.y < p1.y;
  const sign = bullLeg ? -1 : 1;

  const project = (mult: number) => p2.y + sign * height * mult;

  const midY = (p1.y + p2.y) / 2;
  const opposite1x = p1.y - sign * height;

  return [
    { id: "mm-1x", y: project(1), label: "1x MM (L2=L1)", color: "#22c55e" },
    { id: "mm-2x", y: project(2), label: "2x MM", color: "#16a34a", dashed: true },
    {
      id: "mm-half",
      y: midY,
      label: "½ leg PB",
      color: "#eab308",
      dashed: true,
      opacity: 0.85,
    },
    {
      id: "mm-tr",
      y: p1.y + sign * height,
      label: "TR 1x (from BO)",
      color: "#3b82f6",
      dashed: true,
      opacity: 0.8,
    },
    {
      id: "mm-fade",
      y: opposite1x,
      label: "1x fade / fail",
      color: "#ef4444",
      dashed: true,
      opacity: 0.8,
    },
    {
      id: "mm-deep",
      y: project(3),
      label: "3x stretch",
      color: "#a855f7",
      dashed: true,
      opacity: 0.65,
    },
  ];
}

export function getVisibleTargets(
  mode: "auto" | "manual",
  showMode: string,
): Set<string> {
  if (showMode === "all" || mode === "auto") {
    return new Set(["mm-1x", "mm-2x", "mm-half", "mm-tr", "mm-fade", "mm-deep"]);
  }
  if (showMode === "1x") return new Set(["mm-1x"]);
  return new Set(showMode.split(",").filter(Boolean));
}

export function computeMmBounds(
  p1: Point,
  p2: Point,
  mode: "auto" | "manual",
  showMode = "all",
): { x: number; y: number; width: number; height: number } {
  const targets = computeMmTargets(p1, p2).filter((t) =>
    getVisibleTargets(mode, showMode).has(t.id),
  );
  const ys = [p1.y, p2.y, ...targets.map((t) => t.y)];
  const padX = 8;
  const padY = 20;
  const labelW = 108;
  const x = Math.min(p1.x, p2.x) - padX;
  const y = Math.min(...ys) - padY;
  const width = Math.max(p1.x, p2.x) - x + labelW + padX;
  const height = Math.max(...ys) - y + padY;
  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.max(80, width),
    height: Math.max(60, height),
  };
}

export function canvasPoint(
  clientX: number,
  clientY: number,
  canvasEl: HTMLElement,
): Point {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}
