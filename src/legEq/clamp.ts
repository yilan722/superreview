import type { Point } from "../mm/math";

export interface CanvasBounds {
  width: number;
  height: number;
  margin?: number;
}

export function clampPoint(p: Point, bounds: CanvasBounds): Point {
  const m = bounds.margin ?? 36;
  return {
    x: Math.max(m, Math.min(bounds.width - m, p.x)),
    y: Math.max(m, Math.min(bounds.height - m, p.y)),
  };
}

/** Translate all points together so they stay inside the canvas (preserves shape). */
export function clampRigidPoints(points: Point[], bounds: CanvasBounds): Point[] {
  if (points.length === 0) return points;
  const m = bounds.margin ?? 36;
  const maxX = bounds.width - m;
  const maxY = bounds.height - m;

  let dxLo = -Infinity;
  let dxHi = Infinity;
  let dyLo = -Infinity;
  let dyHi = Infinity;

  for (const p of points) {
    dxLo = Math.max(dxLo, m - p.x);
    dxHi = Math.min(dxHi, maxX - p.x);
    dyLo = Math.max(dyLo, m - p.y);
    dyHi = Math.min(dyHi, maxY - p.y);
  }

  let dx = 0;
  if (dxLo > 0) dx = dxLo;
  else if (dxHi < 0) dx = dxHi;

  let dy = 0;
  if (dyLo > 0) dy = dyLo;
  else if (dyHi < 0) dy = dyHi;

  if (dxLo <= dxHi && dyLo <= dyHi) {
    return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  return points.map((p) => clampPoint(p, bounds));
}

/** Keep segment inside canvas; moves both endpoints together when possible. */
export function clampSegment(a: Point, b: Point, bounds: CanvasBounds): { a: Point; b: Point } {
  const [ca, cb] = clampRigidPoints([a, b], bounds);
  return { a: ca, b: cb };
}
