import type { CanvasObject } from "../types";
import type { Point } from "../mm/math";

const PAD = 12;

let idCounter = 0;
export function newWedgeId() {
  return `wedge-${Date.now()}-${++idCounter}`;
}

export function parseWedgePoints(obj: CanvasObject): Point[] {
  try {
    const raw = obj.props.points;
    if (typeof raw !== "string") return [];
    return JSON.parse(raw) as Point[];
  } catch {
    return [];
  }
}

export function serializePoints(points: Point[]): string {
  return JSON.stringify(points);
}

export function boundsFromPoints(points: Point[]) {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs) - PAD;
  const y = Math.min(...ys) - PAD;
  const width = Math.max(...xs) - x + PAD;
  const height = Math.max(...ys) - y + PAD;
  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.max(40, width),
    height: Math.max(40, height),
  };
}

export function createWedgeObject(
  points: Point[],
  color: string,
  templateId: string,
): CanvasObject | null {
  if (points.length < 2) return null;
  return {
    id: newWedgeId(),
    templateId,
    kind: "wedge-line",
    ...boundsFromPoints(points),
    rotation: 0,
    props: {
      points: serializePoints(points),
      color,
    },
  };
}

export function updateWedgePoints(obj: CanvasObject, points: Point[]): Partial<CanvasObject> {
  return {
    ...boundsFromPoints(points),
    props: { ...obj.props, points: serializePoints(points) },
  };
}

export function moveWedgePoints(obj: CanvasObject, dx: number, dy: number): Partial<CanvasObject> {
  const pts = parseWedgePoints(obj).map((p) => ({ x: p.x + dx, y: p.y + dy }));
  return updateWedgePoints(obj, pts);
}

export function toLocalPoints(points: Point[], obj: CanvasObject): Point[] {
  return points.map((p) => ({ x: p.x - obj.x, y: p.y - obj.y }));
}
