import type { CanvasObject, ImageSlot } from "../types";

export function objectSlot(obj: CanvasObject): ImageSlot {
  if (obj.slot) return obj.slot;
  const p = obj.props.imageSlot;
  if (p === "weekly" || p === "daily" || p === "h4" || p === "main") return p;
  return "main";
}

export function objectsForSlot(objects: CanvasObject[], slot: ImageSlot): CanvasObject[] {
  return objects.filter((o) => objectSlot(o) === slot);
}

export function mergeSlotObjects(
  all: CanvasObject[],
  slot: ImageSlot,
  slotObjects: CanvasObject[],
): CanvasObject[] {
  const rest = all.filter((o) => objectSlot(o) !== slot);
  return [...rest, ...slotObjects];
}
