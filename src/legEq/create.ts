import type { CanvasObject } from "../types";
import type { Point } from "../mm/math";
import { clampPoint, clampRigidPoints, type CanvasBounds } from "./clamp";
import {
  computeLegEqLayout,
  getLegEqPoints,
  layoutBounds,
  leg2DefaultFromLeg1,
  normalizeLeg2ToLeg1,
} from "./layout";

let idCounter = 0;

export function newLegEqId() {
  return `leg-eq-${Date.now()}-${++idCounter}`;
}

function toProps(
  p1: Point,
  p2: Point,
  hasLeg2: boolean,
  l2a: Point | null,
  l2b: Point | null,
): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {
    p1x: p1.x,
    p1y: p1.y,
    p2x: p2.x,
    p2y: p2.y,
    hasLeg2,
  };
  if (hasLeg2 && l2a && l2b) {
    props.l2ax = l2a.x;
    props.l2ay = l2a.y;
    props.l2bx = l2b.x;
    props.l2by = l2b.y;
  }
  return props;
}

function patch(
  p1: Point,
  p2: Point,
  hasLeg2: boolean,
  l2a: Point | null,
  l2b: Point | null,
  bounds?: CanvasBounds,
  rigid: "all" | "leg2" | "none" = "all",
): Partial<CanvasObject> {
  let cp1 = p1;
  let cp2 = p2;
  let cl2a = l2a;
  let cl2b = l2b;

  if (bounds) {
    if (rigid === "all") {
      const pts = hasLeg2 && cl2a && cl2b ? [cp1, cp2, cl2a, cl2b] : [cp1, cp2];
      const c = clampRigidPoints(pts, bounds);
      cp1 = c[0];
      cp2 = c[1];
      if (hasLeg2 && c.length > 3) {
        cl2a = c[2];
        cl2b = c[3];
      }
    } else if (rigid === "leg2" && hasLeg2 && cl2a && cl2b) {
      const c = clampRigidPoints([cl2a, cl2b], bounds);
      cl2a = c[0];
      cl2b = c[1];
    }
  }

  if (hasLeg2 && cl2a && cl2b) {
    ({ l2a: cl2a, l2b: cl2b } = normalizeLeg2ToLeg1(cp1, cp2, cl2a, cl2b));
    if (bounds) {
      const c = clampRigidPoints([cl2a, cl2b], bounds);
      cl2a = c[0];
      cl2b = c[1];
      ({ l2a: cl2a, l2b: cl2b } = normalizeLeg2ToLeg1(cp1, cp2, cl2a, cl2b));
    }
  }

  const layout = computeLegEqLayout(cp1, cp2, hasLeg2, cl2a, cl2b, bounds);
  if (!layout) return {};
  return {
    ...layoutBounds(layout),
    props: toProps(cp1, cp2, hasLeg2, layout.l2a, layout.l2b),
  };
}

export function createLegEqObject(
  p1: Point,
  p2: Point,
  bounds?: CanvasBounds,
): CanvasObject | null {
  const layout = computeLegEqLayout(p1, p2, false, null, null, bounds);
  if (!layout) return null;
  return {
    id: newLegEqId(),
    templateId: "leg-eq",
    kind: "leg-eq",
    ...layoutBounds(layout),
    rotation: 0,
    props: toProps(p1, p2, false, null, null),
  };
}

export { getLegEqPoints };

export function updateLegEqPoints(
  obj: CanvasObject,
  p1: Point,
  p2: Point,
  hasLeg2?: boolean,
  bounds?: CanvasBounds,
  moved: "p1" | "p2" | "all" = "all",
): Partial<CanvasObject> {
  const cur = getLegEqPoints(obj);
  const leg2 = hasLeg2 ?? cur.hasLeg2;
  let np1 = p1;
  let np2 = p2;
  if (bounds && moved !== "all") {
    if (moved === "p1") np1 = clampPoint(p1, bounds);
    if (moved === "p2") np2 = clampPoint(p2, bounds);
  }
  let nl2a = cur.l2a;
  let nl2b = cur.l2b;
  if (leg2 && nl2a && nl2b) {
    ({ l2a: nl2a, l2b: nl2b } = normalizeLeg2ToLeg1(np1, np2, nl2a, nl2b));
  }
  return patch(np1, np2, leg2, nl2a, nl2b, bounds, moved === "all" ? "all" : "none");
}

export function updateLeg2(
  obj: CanvasObject,
  l2a: Point,
  l2b: Point,
  bounds?: CanvasBounds,
): Partial<CanvasObject> {
  const { p1, p2 } = getLegEqPoints(obj);
  const { l2a: a, l2b: b } = normalizeLeg2ToLeg1(p1, p2, l2a, l2b);
  return patch(p1, p2, true, a, b, bounds, "leg2");
}

export function moveLegEqPoints(
  obj: CanvasObject,
  dx: number,
  dy: number,
  bounds?: CanvasBounds,
): Partial<CanvasObject> {
  const { p1, p2, l2a, l2b, hasLeg2 } = getLegEqPoints(obj);
  return patch(
    { x: p1.x + dx, y: p1.y + dy },
    { x: p2.x + dx, y: p2.y + dy },
    hasLeg2,
    hasLeg2 && l2a ? { x: l2a.x + dx, y: l2a.y + dy } : null,
    hasLeg2 && l2b ? { x: l2b.x + dx, y: l2b.y + dy } : null,
    bounds,
  );
}

export function duplicateLeg2(obj: CanvasObject, bounds?: CanvasBounds): Partial<CanvasObject> {
  const { p1, p2 } = getLegEqPoints(obj);
  const { l2a, l2b } = leg2DefaultFromLeg1(p1, p2);
  return patch(p1, p2, true, l2a, l2b, bounds);
}
