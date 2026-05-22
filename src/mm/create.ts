import type { CanvasObject } from "../types";
import { computeMmBounds, type Point } from "./math";

let idCounter = 0;
export function newMmId() {
  return `mm-${Date.now()}-${++idCounter}`;
}

export function createMmObject(
  p1: Point,
  p2: Point,
  mode: "auto" | "manual",
  showTargets: "all" | "1x" = mode === "auto" ? "all" : "1x",
): CanvasObject {
  const bounds = computeMmBounds(p1, p2, mode, showTargets);
  return {
    id: newMmId(),
    templateId: mode === "auto" ? "mm-auto" : "mm-manual",
    kind: "mm",
    ...bounds,
    rotation: 0,
    props: {
      mode,
      p1x: p1.x,
      p1y: p1.y,
      p2x: p2.x,
      p2y: p2.y,
      showTargets,
    },
  };
}

export function getMmPoints(obj: CanvasObject): { p1: Point; p2: Point } {
  return {
    p1: { x: Number(obj.props.p1x), y: Number(obj.props.p1y) },
    p2: { x: Number(obj.props.p2x), y: Number(obj.props.p2y) },
  };
}

export function updateMmPoints(
  obj: CanvasObject,
  p1: Point,
  p2: Point,
): Partial<CanvasObject> {
  const mode = (obj.props.mode as "auto" | "manual") ?? "manual";
  const showTargets = String(obj.props.showTargets ?? "1x");
  const bounds = computeMmBounds(p1, p2, mode, showTargets);
  return {
    ...bounds,
    props: { ...obj.props, p1x: p1.x, p1y: p1.y, p2x: p2.x, p2y: p2.y },
  };
}

export function moveMmPoints(
  obj: CanvasObject,
  dx: number,
  dy: number,
): Partial<CanvasObject> {
  const { p1, p2 } = getMmPoints(obj);
  return updateMmPoints(obj, { x: p1.x + dx, y: p1.y + dy }, { x: p2.x + dx, y: p2.y + dy });
}
