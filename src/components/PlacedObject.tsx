import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import type { CanvasObject } from "../types";
import { useCanvasDrag, useCanvasLiveDrag } from "../canvas/pointerDrag";
import { ArrowSvg } from "./ArrowSvg";
import { ObjectNoteLabel } from "./ObjectNoteLabel";
import { ObjectToolbar } from "./ObjectToolbar";

interface PlacedObjectProps {
  obj: CanvasObject;
  selected: boolean;
  canvasRef: RefObject<HTMLElement | null>;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onEditText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

export function PlacedObject({
  obj,
  selected,
  canvasRef,
  onSelect,
  onMove,
  onResize,
  onEditText,
  onDelete,
}: PlacedObjectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { startDrag } = useCanvasDrag(canvasRef, rootRef);
  const { startLiveDrag } = useCanvasLiveDrag(canvasRef);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (
        (e.target as HTMLElement).closest(".resize-handle, .obj-toolbar, .obj-toolbar-delete")
      )
        return;
      onSelect(obj.id);
      const origX = obj.x;
      const origY = obj.y;
      startDrag(
        e,
        (delta) => {
          onMove(obj.id, origX + delta.x, origY + delta.y);
        },
        { grabOrigin: { x: origX, y: origY } },
      );
    },
    [obj.x, obj.y, obj.id, onSelect, onMove, startDrag],
  );

  const handleResizeDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onSelect(obj.id);
      const origW = obj.width;
      const origH = obj.height;
      startLiveDrag(e, (delta) => {
        onResize(
          obj.id,
          Math.max(12, origW + delta.x),
          Math.max(12, origH + delta.y),
        );
      }, () => {});
    },
    [obj.id, obj.width, obj.height, onSelect, onResize, startLiveDrag],
  );

  const renderContent = () => {
    const p = obj.props;
    switch (obj.kind) {
      case "text-label":
        return (
          <span
            className="obj-text-label"
            style={{ color: String(p.color) }}
            onDoubleClick={(ev) => {
              ev.stopPropagation();
              const next = window.prompt("编辑标签", String(p.text));
              if (next != null) onEditText(obj.id, next);
            }}
          >
            {String(p.text)}
          </span>
        );
      case "rect-small":
      case "rect-tall":
        return (
          <div
            className="obj-rect"
            style={{
              width: "100%",
              height: "100%",
              background: String(p.fill),
              opacity: p.outlined ? 0.35 : 0.75,
              border: p.outlined ? `2px solid ${String(p.fill)}` : "none",
              borderRadius: 2,
            }}
          />
        );
      case "rect-zone":
        return (
          <div
            className="obj-zone"
            style={{
              width: "100%",
              height: "100%",
              background: `${String(p.fill)}22`,
              border: `2px dashed ${String(p.fill)}`,
              borderRadius: 4,
            }}
          />
        );
      case "hline":
        return (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: String(p.color),
              borderRadius: 2,
              marginTop: "50%",
              transform: "translateY(-50%)",
            }}
          />
        );
      case "arrow":
        return (
          <ArrowSvg
            direction={p.direction as import("../types").ArrowDirection}
            color={String(p.color)}
            width={obj.width}
            height={obj.height}
          />
        );
      case "note":
        return (
          <textarea
            className="obj-note"
            value={String(p.text ?? "")}
            onChange={(ev) => onEditText(obj.id, ev.target.value)}
            onFocus={() => onSelect(obj.id)}
            onPointerDown={(ev) => ev.stopPropagation()}
            style={{ color: String(p.color) }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={rootRef}
      className={`placed-object ${selected ? "selected" : ""}`}
      style={{
        left: obj.x,
        top: obj.y,
        width: obj.width,
        height: obj.height,
        transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
      }}
      onPointerDown={handlePointerDown}
    >
      {selected && <ObjectToolbar onDelete={() => onDelete(obj.id)} />}
      {renderContent()}
      {obj.kind !== "note" && <ObjectNoteLabel note={obj.note} selected={selected} />}
      {selected && (
        <div className="resize-handle" onPointerDown={handleResizeDown} />
      )}
    </div>
  );
}
