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
import { ObjectToolbar } from "./ObjectToolbar";

interface WedgeObjectProps {
  obj: CanvasObject;
  selected: boolean;
  coordRef: RefObject<HTMLElement | null>;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CanvasObject>) => void;
  onDelete: (id: string) => void;
}

export function WedgeObject({
  obj,
  selected,
  coordRef,
  onSelect,
  onUpdate,
  onDelete,
}: WedgeObjectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { startDrag } = useCanvasDrag(coordRef, rootRef);
  const { startLiveDrag } = useCanvasLiveDrag(coordRef);

  const points = parseWedgePoints(obj);
  const color = String(obj.props.color ?? "#dc2626");
  const local = toLocalPoints(points, obj);

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
        if (
          (e.target as HTMLElement).closest(".wedge-vertex, .obj-toolbar, .obj-toolbar-delete")
        )
          return;
        handleMoveWhole(e);
      }}
    >
      {selected && <ObjectToolbar onDelete={() => onDelete(obj.id)} />}
      <svg className="wedge-svg" width={obj.width} height={obj.height}>
        {selected && local.length >= 2 && (
          <line
            x1={local[0].x}
            y1={local[0].y}
            x2={local[1].x}
            y2={local[1].y}
            stroke="transparent"
            strokeWidth={14}
            style={{ pointerEvents: "stroke", cursor: "grab" }}
          />
        )}
        <line
          x1={local[0]?.x ?? 0}
          y1={local[0]?.y ?? 0}
          x2={local[1]?.x ?? 0}
          y2={local[1]?.y ?? 0}
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray="10 6"
          strokeLinecap="round"
          style={{ pointerEvents: selected ? "none" : "auto" }}
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
            title={i === 0 ? "起点 · 拖动拉长/缩短" : "终点 · 拖动拉长/缩短"}
            onPointerDown={(e) => handleVertexDown(e, i)}
          />
        ))}
    </div>
  );
}
