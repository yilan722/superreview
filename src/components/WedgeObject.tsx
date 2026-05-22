import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import type { CanvasObject } from "../types";
import { useCanvasDrag, useCanvasLiveDrag } from "../canvas/pointerDrag";
import {
  moveWedgePoints,
  parseWedgePoints,
  toLocalPoints,
  updateWedgePoints,
} from "../wedge/create";
import { ObjectNoteLabel } from "./ObjectNoteLabel";

interface WedgeObjectProps {
  obj: CanvasObject;
  selected: boolean;
  canvasRef: RefObject<HTMLElement | null>;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CanvasObject>) => void;
}

export function WedgeObject({ obj, selected, canvasRef, onSelect, onUpdate }: WedgeObjectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { startDrag } = useCanvasDrag(canvasRef, rootRef);
  const { startLiveDrag } = useCanvasLiveDrag(canvasRef);

  const points = parseWedgePoints(obj);
  const color = String(obj.props.color ?? "#dc2626");
  const local = toLocalPoints(points, obj);
  const polyline = local.map((p) => `${p.x},${p.y}`).join(" ");

  const handleMoveWhole = useCallback(
    (e: React.PointerEvent) => {
      onSelect(obj.id);
      startDrag(e, (delta) => {
        onUpdate(obj.id, moveWedgePoints(obj, delta.x, delta.y));
      });
    },
    [obj, onSelect, onUpdate, startDrag],
  );

  const handleVertexDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      onSelect(obj.id);
      const orig = [...points];
      startLiveDrag(
        e,
        (delta) => {
          const next = orig.map((p, i) =>
            i === index ? { x: p.x + delta.x, y: p.y + delta.y } : p,
          );
          onUpdate(obj.id, updateWedgePoints(obj, next));
        },
        () => {},
      );
    },
    [obj, points, onSelect, onUpdate, startLiveDrag],
  );

  if (points.length < 2) return null;

  return (
    <div
      ref={rootRef}
      className={`wedge-object ${selected ? "selected" : ""}`}
      style={{ left: obj.x, top: obj.y, width: obj.width, height: obj.height }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest(".wedge-vertex")) return;
        handleMoveWhole(e);
      }}
    >
      <svg className="wedge-svg" width={obj.width} height={obj.height}>
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray="10 6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <ObjectNoteLabel note={obj.note} selected={selected} />

      {selected &&
        local.map((p, i) => (
          <div
            key={i}
            className="wedge-vertex"
            style={{
              left: p.x - 6,
              top: p.y - 6,
              borderColor: color,
              background: color,
            }}
            onPointerDown={(e) => handleVertexDown(e, i)}
          />
        ))}
    </div>
  );
}
