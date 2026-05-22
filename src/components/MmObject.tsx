import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import type { CanvasObject } from "../types";
import { useCanvasDrag, useCanvasLiveDrag } from "../canvas/pointerDrag";
import { getMmPoints, moveMmPoints, updateMmPoints } from "../mm/create";
import { computeMmTargets, getVisibleTargets, type Point } from "../mm/math";
import { ObjectNoteLabel } from "./ObjectNoteLabel";

interface MmObjectProps {
  obj: CanvasObject;
  selected: boolean;
  coordRef: RefObject<HTMLElement | null>;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CanvasObject>) => void;
}

export function MmObject({ obj, selected, coordRef, onSelect, onUpdate }: MmObjectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { startDrag } = useCanvasDrag(coordRef, rootRef);
  const { startLiveDrag } = useCanvasLiveDrag(coordRef);

  const { p1, p2 } = getMmPoints(obj);
  const mode = (obj.props.mode as "auto" | "manual") ?? "manual";
  const showMode = String(obj.props.showTargets ?? "1x");
  const visible = getVisibleTargets(mode, showMode);
  const targets = computeMmTargets(p1, p2).filter((t) => visible.has(t.id));

  const lineX1 = Math.min(p1.x, p2.x) - 4;
  const lineX2 = Math.max(p1.x, p2.x) + 12;
  const labelX = lineX2 + 6;

  const local = (pt: Point) => ({ x: pt.x - obj.x, y: pt.y - obj.y });
  const lp1 = local(p1);
  const lp2 = local(p2);

  const handleMoveWhole = useCallback(
    (e: React.PointerEvent) => {
      onSelect(obj.id);
      startDrag(e, (delta) => {
        onUpdate(obj.id, moveMmPoints(obj, delta.x, delta.y));
      });
    },
    [obj, onSelect, onUpdate, startDrag],
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
              updateMmPoints(
                obj,
                { x: origP1.x + delta.x, y: origP1.y + delta.y },
                origP2,
              ),
            );
          } else {
            onUpdate(
              obj.id,
              updateMmPoints(obj, origP1, {
                x: origP2.x + delta.x,
                y: origP2.y + delta.y,
              }),
            );
          }
        },
        () => {},
      );
    },
    [obj, p1, p2, onSelect, onUpdate, startLiveDrag],
  );

  const toggleTargets = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = showMode === "all" ? "1x" : "all";
    const patch = updateMmPoints(obj, p1, p2);
    onUpdate(obj.id, {
      ...patch,
      props: { ...obj.props, showTargets: next },
    });
  };

  return (
    <div
      ref={rootRef}
      className={`mm-object ${selected ? "selected" : ""}`}
      style={{ left: obj.x, top: obj.y, width: obj.width, height: obj.height }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest(".mm-handle, .mm-toggle-targets")) return;
        handleMoveWhole(e);
      }}
    >
      <svg className="mm-svg" width={obj.width} height={obj.height}>
        <line
          x1={lp1.x}
          y1={lp1.y}
          x2={lp2.x}
          y2={lp2.y}
          stroke="#f8fafc"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
        <line x1={lp1.x - 6} y1={lp1.y} x2={lp1.x + 6} y2={lp1.y} stroke="#f8fafc" strokeWidth={2} />
        <line x1={lp2.x - 6} y1={lp2.y} x2={lp2.x + 6} y2={lp2.y} stroke="#f8fafc" strokeWidth={2} />
        <text
          x={(lp1.x + lp2.x) / 2 - 22}
          y={(lp1.y + lp2.y) / 2}
          fill="#94a3b8"
          fontSize={10}
          fontFamily="IBM Plex Mono, monospace"
        >
          Leg 1
        </text>

        {targets.map((t) => {
          const ly = t.y - obj.y;
          const lx1 = lineX1 - obj.x;
          const lx2 = lineX2 - obj.x;
          const lxLabel = labelX - obj.x;
          return (
            <g key={t.id} opacity={t.opacity ?? 1}>
              <line
                x1={lx1}
                y1={ly}
                x2={lx2}
                y2={ly}
                stroke={t.color}
                strokeWidth={t.id === "mm-1x" ? 2.5 : 1.5}
                strokeDasharray={t.dashed ? "8 5" : undefined}
              />
              <text
                x={lxLabel}
                y={ly + 4}
                fill={t.color}
                fontSize={10}
                fontFamily="IBM Plex Mono, monospace"
                fontWeight={t.id === "mm-1x" ? 600 : 400}
              >
                {t.label}
              </text>
            </g>
          );
        })}
      </svg>

      <ObjectNoteLabel note={obj.note} selected={selected} />

      {selected && (
        <>
          <div
            className="mm-handle mm-handle-p1"
            style={{ left: lp1.x - 7, top: lp1.y - 7 }}
            onPointerDown={(e) => handleHandleDown(e, "p1")}
          />
          <div
            className="mm-handle mm-handle-p2"
            style={{ left: lp2.x - 7, top: lp2.y - 7 }}
            onPointerDown={(e) => handleHandleDown(e, "p2")}
          />
          <button type="button" className="mm-toggle-targets" onClick={toggleTargets}>
            {showMode === "all" ? "仅 1x" : "全部目标"}
          </button>
        </>
      )}
    </div>
  );
}
