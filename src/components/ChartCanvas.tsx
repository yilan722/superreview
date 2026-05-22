import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasObject, CanvasTool } from "../types";
import { WEDGE_COLORS } from "../types";
import { findTemplate } from "../palette";
import type { CanvasBounds } from "../legEq/clamp";
import { createLegEqObject, duplicateLeg2 } from "../legEq/create";
import { createMmObject } from "../mm/create";
import { canvasPoint, type Point } from "../mm/math";
import { createWedgeObject } from "../wedge/create";
import { LegEqObject } from "./LegEqObject";
import { LegEqPreview } from "./LegEqPreview";
import { PlacedObject } from "./PlacedObject";
import { MmObject } from "./MmObject";
import { MmPreview } from "./MmPreview";
import { WedgeObject } from "./WedgeObject";
import { WedgePreview } from "./WedgePreview";

interface ChartCanvasProps {
  chartImage: string | null;
  objects: CanvasObject[];
  selectedId: string | null;
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  onSelect: (id: string | null) => void;
  onAddObject: (obj: CanvasObject) => void;
  onUpdateObject: (id: string, patch: Partial<CanvasObject>) => void;
  onDeleteSelected: () => void;
  onRemoveObject: (id: string) => void;
  onImageLoad: (dataUrl: string) => void;
  compact?: boolean;
}

let idCounter = 0;
function newId() {
  return `obj-${Date.now()}-${++idCounter}`;
}

function isWedgeTool(t: CanvasTool): t is "wedge-red" | "wedge-green" {
  return t === "wedge-red" || t === "wedge-green";
}

function wedgeColor(t: "wedge-red" | "wedge-green") {
  return t === "wedge-red" ? WEDGE_COLORS.red : WEDGE_COLORS.green;
}

const FREEHAND_THRESHOLD = 10;
const FREEHAND_STEP = 6;

export function ChartCanvas({
  chartImage,
  objects,
  selectedId,
  activeTool,
  onToolChange,
  onSelect,
  onAddObject,
  onUpdateObject,
  onDeleteSelected,
  onRemoveObject,
  onImageLoad,
  compact = false,
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [mmDraftP1, setMmDraftP1] = useState<Point | null>(null);
  const [mmCursor, setMmCursor] = useState<Point | null>(null);

  const [wedgeDraft, setWedgeDraft] = useState<Point[]>([]);
  const [wedgeCursor, setWedgeCursor] = useState<Point | null>(null);
  const wedgeDrawRef = useRef<{
    freehand: boolean;
    points: Point[];
    start: Point;
  } | null>(null);

  const [canvasBounds, setCanvasBounds] = useState<CanvasBounds>({
    width: 800,
    height: 600,
    margin: 40,
  });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const sync = () => {
      setCanvasBounds({
        width: el.clientWidth,
        height: el.clientHeight,
        margin: 40,
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chartImage]);

  const getCanvasBounds = useCallback((): CanvasBounds => {
    const el = canvasRef.current;
    if (!el) return canvasBounds;
    return { width: el.clientWidth, height: el.clientHeight, margin: 40 };
  }, [canvasBounds]);

  const getCanvasPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvasPoint(clientX, clientY, canvas);
  }, []);

  const clearToolDrafts = useCallback(() => {
    setMmDraftP1(null);
    setMmCursor(null);
    setWedgeDraft([]);
    setWedgeCursor(null);
    wedgeDrawRef.current = null;
  }, []);

  const finishMm = useCallback(
    (p1: Point, p2: Point) => {
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 8) return;
      onAddObject(createMmObject(p1, p2, "auto", "all"));
      clearToolDrafts();
      onToolChange(null);
    },
    [onAddObject, onToolChange, clearToolDrafts],
  );

  const finishLegEq = useCallback(
    (p1: Point, p2: Point) => {
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 8) return;
      const legEq = createLegEqObject(p1, p2, getCanvasBounds());
      if (legEq) {
        onAddObject(legEq);
        onSelect(legEq.id);
      }
      clearToolDrafts();
      onToolChange(null);
    },
    [onAddObject, onSelect, onToolChange, clearToolDrafts, getCanvasBounds],
  );

  const finishWedge = useCallback(
    (pts: Point[]) => {
      if (!isWedgeTool(activeTool) || pts.length < 2) return;
      const obj = createWedgeObject(pts, wedgeColor(activeTool), activeTool);
      if (obj) onAddObject(obj);
      setWedgeDraft([]);
      setWedgeCursor(null);
      wedgeDrawRef.current = null;
    },
    [activeTool, onAddObject],
  );

  const dropObject = useCallback(
    (templateId: string, clientX: number, clientY: number) => {
      const template = findTemplate(templateId);
      const canvas = canvasRef.current;
      if (!template || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left - template.defaultWidth / 2;
      const y = clientY - rect.top - template.defaultHeight / 2;
      onAddObject({
        id: newId(),
        templateId: template.id,
        kind: template.kind,
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: template.defaultWidth,
        height: template.defaultHeight,
        rotation: 0,
        props: { ...template.props },
      });
    },
    [onAddObject],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const templateId = e.dataTransfer.getData("application/x-template-id");
      if (templateId) dropObject(templateId, e.clientX, e.clientY);
    },
    [dropObject],
  );

  const handleFile = (file: File | undefined) => {
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onImageLoad(reader.result as string);
    reader.readAsDataURL(file);
  };

  const hitsAnnotation = (e: React.PointerEvent) =>
    !!(e.target as HTMLElement).closest(
      ".placed-object, .mm-object, .wedge-object, .leg-eq-object",
    );

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (!chartImage || !activeTool || hitsAnnotation(e)) return;
    const pt = getCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;

    if (activeTool === "mm-auto" || activeTool === "leg-eq") {
      e.preventDefault();
      e.stopPropagation();
      if (!mmDraftP1) {
        setMmDraftP1(pt);
        setMmCursor(pt);
      } else if (activeTool === "mm-auto") {
        finishMm(mmDraftP1, pt);
      } else {
        finishLegEq(mmDraftP1, pt);
      }
      return;
    }

    if (isWedgeTool(activeTool)) {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      wedgeDrawRef.current = { freehand: false, points: [], start: pt };
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    const pt = getCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;

    if ((activeTool === "mm-auto" || activeTool === "leg-eq") && mmDraftP1) {
      setMmCursor(pt);
      return;
    }

    const draw = wedgeDrawRef.current;
    if (!draw || !isWedgeTool(activeTool)) return;

    const dist = Math.hypot(pt.x - draw.start.x, pt.y - draw.start.y);
    if (!draw.freehand && dist > FREEHAND_THRESHOLD) {
      draw.freehand = true;
      draw.points = [draw.start];
    }

    if (draw.freehand) {
      const last = draw.points[draw.points.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= FREEHAND_STEP) {
        draw.points.push(pt);
        setWedgeDraft([...draw.points]);
      }
    } else {
      setWedgeCursor(pt);
    }
  };

  const handleCanvasPointerUp = () => {
    const draw = wedgeDrawRef.current;
    if (!draw || !isWedgeTool(activeTool)) return;

    if (draw.freehand) {
      finishWedge(draw.points);
    } else {
      setWedgeDraft((prev) => [...prev, draw.start]);
    }
    wedgeDrawRef.current = null;
    setWedgeCursor(null);
  };

  const handleCanvasDoubleClick = () => {
    if (isWedgeTool(activeTool) && wedgeDraft.length >= 2) {
      finishWedge(wedgeDraft);
    }
  };

  const toolHint = (() => {
    if (activeTool === "leg-eq") {
      return mmDraftP1
        ? "点击 Leg 1 终点，再点「复制 → Leg 2」"
        : "Leg1=Leg2：先点 Leg 1 起点";
    }
    if (activeTool === "mm-auto") {
      return mmDraftP1 ? "点击 Leg 1 终点（或 Esc 取消）" : "Auto MM：点击 Leg 1 起点";
    }
    if (isWedgeTool(activeTool)) {
      const color = activeTool === "wedge-red" ? "红" : "绿";
      return wedgeDraft.length > 0
        ? `${color}楔形：继续点击 / 拖拽 · Enter 或双击完成`
        : `${color}楔形：点击画点，或按住拖拽自由画线`;
    }
    return null;
  })();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearToolDrafts();
        if (activeTool) onToolChange(null);
        return;
      }
      if (e.key === "Enter" && isWedgeTool(activeTool) && wedgeDraft.length >= 2) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        finishWedge(wedgeDraft);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, wedgeDraft, clearToolDrafts, finishWedge, onToolChange]);

  const placedObjects = objects.filter(
    (o) => o.kind !== "mm" && o.kind !== "wedge-line" && o.kind !== "leg-eq",
  );
  const mmObjects = objects.filter((o) => o.kind === "mm");
  const legEqObjects = objects.filter((o) => o.kind === "leg-eq");
  const wedgeObjects = objects.filter((o) => o.kind === "wedge-line");

  const activeWedgeColor = isWedgeTool(activeTool) ? wedgeColor(activeTool) : null;
  const selectedObj = objects.find((o) => o.id === selectedId);
  const canCopyLeg2 =
    selectedObj?.kind === "leg-eq" && !selectedObj.props.hasLeg2;

  return (
    <div className={`canvas-area ${compact ? "canvas-area-compact" : ""}`}>
      <div className="canvas-toolbar">
        <button type="button" onClick={() => fileRef.current?.click()}>
          上传截图
        </button>
        <span className="toolbar-hint">Ctrl+V 粘贴到当前选中格 · 拖放标注到主图</span>
        {toolHint && <span className="toolbar-hint toolbar-mm-hint">{toolHint}</span>}
        {isWedgeTool(activeTool) && wedgeDraft.length >= 2 && (
          <button type="button" onClick={() => finishWedge(wedgeDraft)}>
            完成楔形
          </button>
        )}
        {activeTool && (
          <button type="button" className="btn-ghost" onClick={() => {
            clearToolDrafts();
            onToolChange(null);
          }}>
            取消工具 (Esc)
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {canCopyLeg2 && selectedObj && (
          <button
            type="button"
            className="btn-leg-copy"
            onClick={() =>
              onUpdateObject(selectedObj.id, duplicateLeg2(selectedObj, getCanvasBounds()))
            }
          >
            复制 → Leg 2
          </button>
        )}
        {selectedId && (
          <button type="button" className="btn-danger" onClick={onDeleteSelected}>
            删除选中 (Del)
          </button>
        )}
      </div>
      <div
        ref={canvasRef}
        className={[
          "chart-canvas",
          chartImage ? "has-image" : "empty",
          activeTool && `tool-${activeTool}`,
        ]
          .filter(Boolean)
          .join(" ")}
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={handleDrop}
        onClick={(e) => {
          if (activeTool) return;
          if (
            (e.target as HTMLElement).closest(
              ".placed-object, .mm-object, .wedge-object, .leg-eq-object",
            )
          )
            return;
          onSelect(null);
        }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onDoubleClick={handleCanvasDoubleClick}
        onPaste={(e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          for (const item of items) {
            if (item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (!file) continue;
              handleFile(file);
              e.preventDefault();
            }
          }
        }}
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDropCapture={(e) => {
          if (e.dataTransfer.files?.[0]?.type.startsWith("image/")) {
            e.preventDefault();
            e.stopPropagation();
            handleFile(e.dataTransfer.files[0]);
          }
        }}
      >
        {!chartImage ? (
          <div className="canvas-placeholder">
            <p>把 K 线截图拖到这里</p>
            <p className="sub">支持上传、粘贴、拖放</p>
          </div>
        ) : (
          <img src={chartImage} alt="Chart" className="chart-image" draggable={false} />
        )}

        {activeTool === "mm-auto" && mmDraftP1 ? (
          <MmPreview p1={mmDraftP1} p2={null} cursor={mmCursor} />
        ) : null}

        {activeTool === "leg-eq" && mmDraftP1 ? (
          <LegEqPreview p1={mmDraftP1} p2={null} cursor={mmCursor} />
        ) : null}

        {isWedgeTool(activeTool) && (wedgeDraft.length > 0 || wedgeCursor) && activeWedgeColor ? (
          <WedgePreview
            points={wedgeDraft}
            cursor={wedgeCursor}
            color={activeWedgeColor}
          />
        ) : null}

        {placedObjects.map((obj) => (
          <PlacedObject
            key={obj.id}
            obj={obj}
            selected={obj.id === selectedId}
            canvasRef={canvasRef}
            onSelect={onSelect}
            onMove={(id, x, y) => onUpdateObject(id, { x, y })}
            onResize={(id, width, height) => onUpdateObject(id, { width, height })}
            onEditText={(id, text) => {
              const target = objects.find((o) => o.id === id);
              if (!target) return;
              onUpdateObject(id, { props: { ...target.props, text } });
            }}
            onDelete={onRemoveObject}
          />
        ))}

        {mmObjects.map((obj) => (
          <MmObject
            key={obj.id}
            obj={obj}
            selected={obj.id === selectedId}
            canvasRef={canvasRef}
            onSelect={onSelect}
            onUpdate={onUpdateObject}
          />
        ))}

        {legEqObjects.map((obj) => (
          <LegEqObject
            key={obj.id}
            obj={obj}
            selected={obj.id === selectedId}
            canvasRef={canvasRef}
            canvasBounds={getCanvasBounds()}
            onSelect={onSelect}
            onUpdate={onUpdateObject}
          />
        ))}

        {wedgeObjects.map((obj) => (
          <WedgeObject
            key={obj.id}
            obj={obj}
            selected={obj.id === selectedId}
            canvasRef={canvasRef}
            onSelect={onSelect}
            onUpdate={onUpdateObject}
          />
        ))}
      </div>
    </div>
  );
}
