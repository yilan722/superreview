import type { CanvasObject } from "../types";
import type { Point } from "../mm/math";

export interface ImageLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const NORM_COORD_SPACE = "norm";

export function getDisplayedImageRect(
  canvas: HTMLElement,
  img: HTMLImageElement | null,
): ImageLayout | null {
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (cw < 1 || ch < 1) return null;

  const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  return {
    x: (cw - w) / 2,
    y: (ch - h) / 2,
    w,
    h,
  };
}

export function usesNormCoords(obj: CanvasObject): boolean {
  return obj.props.coordSpace === NORM_COORD_SPACE;
}

export function isLikelyPixelCoords(obj: CanvasObject): boolean {
  if (usesNormCoords(obj)) return false;
  return obj.x > 1.2 || obj.y > 1.2 || obj.width > 1.2 || obj.height > 1.2;
}

export function canvasToNorm(p: Point, layout: ImageLayout): Point {
  return {
    x: (p.x - layout.x) / layout.w,
    y: (p.y - layout.y) / layout.h,
  };
}

export function normToCanvas(p: Point, layout: ImageLayout): Point {
  return {
    x: layout.x + p.x * layout.w,
    y: layout.y + p.y * layout.h,
  };
}

function normPointProps(
  props: Record<string, string | number | boolean>,
  layout: ImageLayout,
): Record<string, string | number | boolean> {
  const next: Record<string, string | number | boolean> = {
    ...props,
    coordSpace: NORM_COORD_SPACE,
  };
  for (const key of ["p1x", "p1y", "p2x", "p2y", "l2ax", "l2ay", "l2bx", "l2by"]) {
    if (key in next && typeof next[key] === "number") {
      const isX = key.endsWith("x");
      const v = Number(next[key]);
      next[key] = isX
        ? (v - layout.x) / layout.w
        : (v - layout.y) / layout.h;
    }
  }
  if (typeof props.points === "string") {
    try {
      const pts = JSON.parse(props.points) as Point[];
      next.points = JSON.stringify(
        pts.map((p) => canvasToNorm(p, layout)),
      );
    } catch {
      /* keep */
    }
  }
  return next;
}

function displayPointProps(
  props: Record<string, string | number | boolean>,
  layout: ImageLayout,
): Record<string, string | number | boolean> {
  const next = { ...props };
  for (const key of ["p1x", "p1y", "p2x", "p2y", "l2ax", "l2ay", "l2bx", "l2by"]) {
    if (key in next && typeof next[key] === "number") {
      const isX = key.endsWith("x");
      const v = Number(next[key]);
      next[key] = isX ? layout.x + v * layout.w : layout.y + v * layout.h;
    }
  }
  if (typeof props.points === "string") {
    try {
      const pts = JSON.parse(props.points) as Point[];
      next.points = JSON.stringify(pts.map((p) => normToCanvas(p, layout)));
    } catch {
      /* keep */
    }
  }
  return next;
}

export function objectToNorm(obj: CanvasObject, layout: ImageLayout): CanvasObject {
  if (usesNormCoords(obj)) return obj;
  return {
    ...obj,
    x: (obj.x - layout.x) / layout.w,
    y: (obj.y - layout.y) / layout.h,
    width: obj.width / layout.w,
    height: obj.height / layout.h,
    props: normPointProps(obj.props, layout),
  };
}

export function objectToDisplay(obj: CanvasObject, layout: ImageLayout): CanvasObject {
  if (!usesNormCoords(obj)) return obj;
  return {
    ...obj,
    x: layout.x + obj.x * layout.w,
    y: layout.y + obj.y * layout.h,
    width: obj.width * layout.w,
    height: obj.height * layout.h,
    props: displayPointProps(obj.props, layout),
  };
}

/** Positions inside the annotation layer (origin = top-left of image). */
export function objectToLayerDisplay(
  obj: CanvasObject,
  layout: ImageLayout,
): CanvasObject {
  if (!usesNormCoords(obj)) {
    return {
      ...obj,
      x: obj.x - layout.x,
      y: obj.y - layout.y,
      width: obj.width,
      height: obj.height,
    };
  }
  const layerProps: Record<string, string | number | boolean> = {
    ...obj.props,
  };
  for (const key of ["p1x", "p1y", "p2x", "p2y", "l2ax", "l2ay", "l2bx", "l2by"]) {
    if (key in layerProps && typeof layerProps[key] === "number") {
      const isX = key.endsWith("x");
      const v = Number(layerProps[key]);
      layerProps[key] = isX ? v * layout.w : v * layout.h;
    }
  }
  if (typeof obj.props.points === "string") {
    try {
      const pts = JSON.parse(obj.props.points) as Point[];
      layerProps.points = JSON.stringify(
        pts.map((p) => ({ x: p.x * layout.w, y: p.y * layout.h })),
      );
    } catch {
      /* keep */
    }
  }
  return {
    ...obj,
    x: obj.x * layout.w,
    y: obj.y * layout.h,
    width: obj.width * layout.w,
    height: obj.height * layout.h,
    props: layerProps,
  };
}

export function patchLayerToNorm(
  patch: Partial<CanvasObject>,
  layout: ImageLayout,
): Partial<CanvasObject> {
  const out: Partial<CanvasObject> = { ...patch };
  if (patch.x != null) out.x = patch.x / layout.w;
  if (patch.y != null) out.y = patch.y / layout.h;
  if (patch.width != null) out.width = patch.width / layout.w;
  if (patch.height != null) out.height = patch.height / layout.h;
  if (patch.props) {
    out.props = { ...patch.props, coordSpace: NORM_COORD_SPACE };
    for (const key of ["p1x", "p1y", "p2x", "p2y", "l2ax", "l2ay", "l2bx", "l2by"]) {
      if (key in patch.props && typeof patch.props[key] === "number") {
        const isX = key.endsWith("x");
        const v = Number(patch.props[key]);
        (out.props as Record<string, number>)[key] = isX
          ? v / layout.w
          : v / layout.h;
      }
    }
    if (typeof patch.props.points === "string") {
      try {
        const pts = JSON.parse(patch.props.points) as Point[];
        (out.props as Record<string, string>).points = JSON.stringify(
          pts.map((p) => ({ x: p.x / layout.w, y: p.y / layout.h })),
        );
      } catch {
        /* keep */
      }
    }
  }
  return out;
}

export function canvasToLayer(p: Point, layout: ImageLayout): Point {
  return { x: p.x - layout.x, y: p.y - layout.y };
}

export function patchToNorm(
  patch: Partial<CanvasObject>,
  layout: ImageLayout,
): Partial<CanvasObject> {
  const out: Partial<CanvasObject> = { ...patch };
  if (patch.x != null) out.x = (patch.x - layout.x) / layout.w;
  if (patch.y != null) out.y = (patch.y - layout.y) / layout.h;
  if (patch.width != null) out.width = patch.width / layout.w;
  if (patch.height != null) out.height = patch.height / layout.h;
  if (patch.props) {
    out.props = { ...patch.props, coordSpace: NORM_COORD_SPACE };
    for (const key of ["p1x", "p1y", "p2x", "p2y", "l2ax", "l2ay", "l2bx", "l2by"]) {
      if (key in patch.props && typeof patch.props[key] === "number") {
        const isX = key.endsWith("x");
        const v = Number(patch.props[key]);
        (out.props as Record<string, number>)[key] = isX
          ? (v - layout.x) / layout.w
          : (v - layout.y) / layout.h;
      }
    }
    if (typeof patch.props.points === "string") {
      try {
        const pts = JSON.parse(patch.props.points) as Point[];
        (out.props as Record<string, string>).points = JSON.stringify(
          pts.map((p) => canvasToNorm(p, layout)),
        );
      } catch {
        /* keep */
      }
    }
  }
  return out;
}

export function normalizeNoteColor(obj: CanvasObject): CanvasObject {
  if (obj.kind !== "note") return obj;
  return {
    ...obj,
    props: { ...obj.props, color: "#ffffff" },
  };
}

export function migrateObjectsToNorm(
  objects: CanvasObject[],
  layout: ImageLayout,
): CanvasObject[] {
  return objects.map((o) => {
    const migrated = isLikelyPixelCoords(o) ? objectToNorm(o, layout) : o;
    return normalizeNoteColor(migrated);
  });
}

export function layoutBoundsFromNorm(marginFrac = 0.02): {
  width: number;
  height: number;
  margin: number;
} {
  return { width: 1, height: 1, margin: marginFrac };
}
