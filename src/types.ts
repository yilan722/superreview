export type ArrowDirection =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-right"
  | "down-right"
  | "up-left"
  | "down-left"
  | "double-h"
  | "double-v"
  | "bend-ne"
  | "bend-se"
  | "bend-nw"
  | "bend-sw";

export type ObjectKind =
  | "text-label"
  | "rect-small"
  | "rect-tall"
  | "rect-zone"
  | "hline"
  | "vline"
  | "arrow"
  | "note"
  | "mm"
  | "wedge-line"
  | "leg-eq";

export type CanvasTool =
  | null
  | "mm-auto"
  | "leg-eq"
  | "wedge-red"
  | "wedge-green";

export type ContextSlot = "weekly" | "daily" | "h4";

export const CONTEXT_SLOTS: { id: ContextSlot; label: string }[] = [
  { id: "weekly", label: "周线" },
  { id: "daily", label: "日线" },
  { id: "h4", label: "4H" },
];

export const WEDGE_COLORS = {
  red: "#dc2626",
  green: "#16a34a",
} as const;

export interface PaletteTemplate {
  id: string;
  kind: ObjectKind;
  label: string;
  defaultWidth: number;
  defaultHeight: number;
  props: Record<string, string | number | boolean>;
}

export interface CanvasObject {
  id: string;
  templateId: string;
  kind: ObjectKind;
  /** Which chart image this annotation belongs to (defaults to main). */
  slot?: ImageSlot;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  props: Record<string, string | number | boolean>;
  note?: string;
}

export interface ContextImages {
  weekly: string | null;
  daily: string | null;
  h4: string | null;
}

export interface ReviewState {
  chartImage: string | null;
  contextImages: ContextImages;
  objects: CanvasObject[];
  reviewNotes: string;
  sessionTitle: string;
}

export type ImageSlot = ContextSlot | "main";
