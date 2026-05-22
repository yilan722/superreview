import type { Point } from "../mm/math";
import type { CanvasBounds } from "./clamp";

const BRACKET_OFFSET = 28;
const TARGET_HALF = 24;

export interface LegEqLayout {
  p1: Point;
  p2: Point;
  l2a: Point | null;
  l2b: Point | null;
  hasLeg2: boolean;
  b1a: Point;
  b1b: Point;
  b2a: Point | null;
  b2b: Point | null;
  label1: Point;
  label2: Point | null;
  targetA: Point | null;
  targetB: Point | null;
  targetLabel: Point | null;
}

function add(p: Point, vx: number, vy: number): Point {
  return { x: p.x + vx, y: p.y + vy };
}

function perpOffset(dx: number, dy: number, dist: number) {
  const len = Math.hypot(dx, dy) || 1;
  return { x: (-dy / len) * dist, y: (dx / len) * dist };
}

export function getLegEqPoints(obj: { props: Record<string, string | number | boolean> }) {
  const p1 = { x: Number(obj.props.p1x), y: Number(obj.props.p1y) };
  const p2 = { x: Number(obj.props.p2x), y: Number(obj.props.p2y) };
  const hasLeg2 = Boolean(obj.props.hasLeg2);
  const l2a = hasLeg2
    ? { x: Number(obj.props.l2ax), y: Number(obj.props.l2ay) }
    : null;
  const l2b = hasLeg2
    ? { x: Number(obj.props.l2bx), y: Number(obj.props.l2by) }
    : null;
  return { p1, p2, l2a, l2b, hasLeg2 };
}

export function leg1Length(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export function leg2DefaultFromLeg1(p1: Point, p2: Point): { l2a: Point; l2b: Point } {
  return {
    l2a: { ...p2 },
    l2b: { x: p2.x + (p2.x - p1.x), y: p2.y + (p2.y - p1.y) },
  };
}

/** Keep Leg2 direction from l2a→l2b but force length = Leg1. */
export function normalizeLeg2ToLeg1(
  p1: Point,
  p2: Point,
  l2a: Point,
  l2b: Point,
): { l2a: Point; l2b: Point } {
  const len = leg1Length(p1, p2);
  if (len < 4) return { l2a, l2b };
  const dx = l2b.x - l2a.x;
  const dy = l2b.y - l2a.y;
  const cur = Math.hypot(dx, dy);
  if (cur < 1) {
    const ux = (p2.x - p1.x) / (leg1Length(p1, p2) || 1);
    const uy = (p2.y - p1.y) / (leg1Length(p1, p2) || 1);
    return { l2a, l2b: { x: l2a.x + ux * len, y: l2a.y + uy * len } };
  }
  return {
    l2a,
    l2b: { x: l2a.x + (dx / cur) * len, y: l2a.y + (dy / cur) * len },
  };
}

function targetAtEnd(l2a: Point, l2b: Point, bounds?: CanvasBounds) {
  const dx = l2b.x - l2a.x;
  const dy = l2b.y - l2a.y;
  const perp = perpOffset(dx, dy, 1);
  let half = TARGET_HALF;
  let ta = add(l2b, perp.x * half, perp.y * half);
  let tb = add(l2b, -perp.x * half, -perp.y * half);

  if (bounds) {
    const m = bounds.margin ?? 36;
    const clamp = (p: Point) => ({
      x: Math.max(m, Math.min(bounds.width - m, p.x)),
      y: Math.max(m, Math.min(bounds.height - m, p.y)),
    });
    ta = clamp(ta);
    tb = clamp(tb);
    half = Math.min(
      half,
      Math.hypot(ta.x - l2b.x, ta.y - l2b.y),
      Math.hypot(tb.x - l2b.x, tb.y - l2b.y),
    );
    ta = add(l2b, perp.x * half, perp.y * half);
    tb = add(l2b, -perp.x * half, -perp.y * half);
    ta = clamp(ta);
    tb = clamp(tb);
  }

  return {
    targetA: ta,
    targetB: tb,
    targetLabel: { x: l2b.x, y: l2b.y - 14 },
  };
}

export function computeLegEqLayout(
  p1: Point,
  p2: Point,
  hasLeg2: boolean,
  l2aIn?: Point | null,
  l2bIn?: Point | null,
  bounds?: CanvasBounds,
): LegEqLayout | null {
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  if (Math.hypot(dx1, dy1) < 4) return null;

  const off1 = perpOffset(dx1, dy1, BRACKET_OFFSET);
  const b1a = add(p1, off1.x, off1.y);
  const b1b = add(p2, off1.x, off1.y);
  const label1 = add(
    { x: (b1a.x + b1b.x) / 2, y: (b1a.y + b1b.y) / 2 },
    off1.x * 0.5,
    off1.y * 0.5,
  );

  if (!hasLeg2) {
    return {
      p1,
      p2,
      l2a: null,
      l2b: null,
      hasLeg2: false,
      b1a,
      b1b,
      b2a: null,
      b2b: null,
      label1,
      label2: null,
      targetA: null,
      targetB: null,
      targetLabel: null,
    };
  }

  const def = leg2DefaultFromLeg1(p1, p2);
  let l2a = l2aIn ?? def.l2a;
  let l2b = l2bIn ?? def.l2b;
  ({ l2a, l2b } = normalizeLeg2ToLeg1(p1, p2, l2a, l2b));

  const dx2 = l2b.x - l2a.x;
  const dy2 = l2b.y - l2a.y;
  if (Math.hypot(dx2, dy2) < 4) return null;

  const off2 = perpOffset(dx2, dy2, BRACKET_OFFSET);
  const b2a = add(l2a, off2.x, off2.y);
  const b2b = add(l2b, off2.x, off2.y);
  const label2 = add(
    { x: (b2a.x + b2b.x) / 2, y: (b2a.y + b2b.y) / 2 },
    off2.x * 0.5,
    off2.y * 0.5,
  );
  const { targetA, targetB, targetLabel } = targetAtEnd(l2a, l2b, bounds);

  return {
    p1,
    p2,
    l2a,
    l2b,
    hasLeg2: true,
    b1a,
    b1b,
    b2a,
    b2b,
    label1,
    label2,
    targetA,
    targetB,
    targetLabel,
  };
}

export function layoutBounds(layout: LegEqLayout) {
  const pts = [layout.p1, layout.p2, layout.b1a, layout.b1b, layout.label1];
  if (layout.l2a) pts.push(layout.l2a);
  if (layout.l2b) pts.push(layout.l2b);
  if (layout.b2a) pts.push(layout.b2a);
  if (layout.b2b) pts.push(layout.b2b);
  if (layout.label2) pts.push(layout.label2);
  if (layout.targetA) pts.push(layout.targetA);
  if (layout.targetB) pts.push(layout.targetB);
  if (layout.targetLabel) pts.push(layout.targetLabel);

  const pad = 28;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.max(100, Math.max(...xs) - x + pad),
    height: Math.max(80, Math.max(...ys) - y + pad),
  };
}
