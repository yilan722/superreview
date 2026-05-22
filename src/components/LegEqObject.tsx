import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import type { CanvasObject } from "../types";
import type { Point } from "../mm/math";
import type { CanvasBounds } from "../legEq/clamp";
import { useCanvasDrag, useCanvasLiveDrag } from "../canvas/pointerDrag";
import {
  duplicateLeg2,
  getLegEqPoints,
  moveLegEqPoints,
  updateLeg2,
  updateLegEqPoints,
} from "../legEq/create";
import { LegEqSvg } from "../legEq/draw";
import { computeLegEqLayout } from "../legEq/layout";
import { ObjectNoteLabel } from "./ObjectNoteLabel";

interface LegEqObjectProps {
  obj: CanvasObject;
  selected: boolean;
  canvasRef: RefObject<HTMLElement | null>;
  canvasBounds: CanvasBounds;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CanvasObject>) => void;
}

export function LegEqObject({
  obj,
  selected,
  canvasRef,
  canvasBounds,
  onSelect,
  onUpdate,
}: LegEqObjectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { startDrag } = useCanvasDrag(canvasRef, rootRef);
  const { startLiveDrag } = useCanvasLiveDrag(canvasRef);

  const { p1, p2, l2a, l2b, hasLeg2 } = getLegEqPoints(obj);
  const layout = computeLegEqLayout(p1, p2, hasLeg2, l2a, l2b, canvasBounds);
  if (!layout) return null;

  const origin = { x: obj.x, y: obj.y };
  const lp = (p: Point) => ({ x: p.x - obj.x, y: p.y - obj.y });
  const b = canvasBounds;

  const handleMoveWhole = useCallback(
    (e: React.PointerEvent) => {
      onSelect(obj.id);
      startDrag(e, (delta) => {
        onUpdate(obj.id, moveLegEqPoints(obj, delta.x, delta.y, b));
      });
    },
    [obj, b, onSelect, onUpdate, startDrag],
  );

  const handleLeg2Drag = useCallback(
    (e: React.PointerEvent) => {
      if (!l2a || !l2b) return;
      onSelect(obj.id);
      const origL2a = { ...l2a };
      const origL2b = { ...l2b };
      startDrag(e, (delta) => {
        onUpdate(
          obj.id,
          updateLeg2(
            obj,
            { x: origL2a.x + delta.x, y: origL2a.y + delta.y },
            { x: origL2b.x + delta.x, y: origL2b.y + delta.y },
            b,
          ),
        );
      });
    },
    [obj, l2a, l2b, b, onSelect, onUpdate, startDrag],
  );

  const handleHandleDown = useCallback(
    (e: React.PointerEvent, which: "p1" | "p2") => {
      onSelect(obj.id);
      const origP1 = { ...p1 };
      const origP2 = { ...p2 };
      startLiveDrag(
        e,
        (delta) => {
          if (which === "p1") {
            onUpdate(
              obj.id,
              updateLegEqPoints(
                obj,
                { x: origP1.x + delta.x, y: origP1.y + delta.y },
                origP2,
                undefined,
                b,
                "p1",
              ),
            );
          } else {
            onUpdate(
              obj.id,
              updateLegEqPoints(
                obj,
                origP1,
                { x: origP2.x + delta.x, y: origP2.y + delta.y },
                undefined,
                b,
                "p2",
              ),
            );
          }
        },
        () => {},
      );
    },
    [obj, p1, p2, b, onSelect, onUpdate, startLiveDrag],
  );

  const copyLeg2 = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(obj.id, duplicateLeg2(obj, canvasBounds));
  };

  return (
    <div
      ref={rootRef}
      className={`leg-eq-object ${selected ? "selected" : ""}`}
      style={{ left: obj.x, top: obj.y, width: obj.width, height: obj.height }}
      onPointerDown={(e) => {
        if (
          (e.target as HTMLElement).closest(
            ".leg-eq-handle, .leg-eq-copy-btn, .leg-eq-leg2-hit",
          )
        )
          return;
        handleMoveWhole(e);
      }}
    >
      <svg
        className="leg-eq-svg"
        width={obj.width}
        height={obj.height}
        onPointerDown={(e) => {
          const el = e.target as Element;
          if (el.classList?.contains("leg-eq-leg2-hit")) handleLeg2Drag(e);
        }}
      >
        <LegEqSvg layout={layout} origin={origin} leg2Draggable={selected && hasLeg2} />
      </svg>

      <ObjectNoteLabel note={obj.note} selected={selected} />

      {selected && !hasLeg2 && (
        <button type="button" className="leg-eq-copy-btn" onClick={copyLeg2}>
          复制 → Leg 2
        </button>
      )}

      {selected && hasLeg2 && (
        <span className="leg-eq-drag-hint">拖绿色线移动 Leg2（长度与 Leg1 相同）</span>
      )}

      {selected && (
        <>
          <div
            className="leg-eq-handle leg-eq-handle-p1"
            style={{ left: lp(p1).x - 7, top: lp(p1).y - 7 }}
            title="Leg1 起点"
            onPointerDown={(e) => handleHandleDown(e, "p1")}
          />
          <div
            className="leg-eq-handle leg-eq-handle-p2"
            style={{ left: lp(p2).x - 7, top: lp(p2).y - 7 }}
            title="Leg1 终点"
            onPointerDown={(e) => handleHandleDown(e, "p2")}
          />
        </>
      )}
    </div>
  );
}
