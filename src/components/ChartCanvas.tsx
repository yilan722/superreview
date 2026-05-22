import { useCallback, useEffect, useRef, useState } from "react";
import { mergeSlotObjects, objectSlot, objectsForSlot } from "../canvas/slots";
import type { CanvasObject, CanvasTool, ImageSlot } from "../types";
import { CONTEXT_SLOTS } from "../types";
import { WEDGE_COLORS } from "../types";
import { findTemplate } from "../palette";
import type { CanvasBounds } from "../legEq/clamp";
import { createLegEqObject, duplicateLeg2 } from "../legEq/create";
import { createMmObject } from "../mm/create";
import { canvasPoint, type Point } from "../mm/math";
import {
  getDisplayedImageRect,
  isLikelyPixelCoords,
  migrateObjectsToNorm,
  normalizeNoteColor,
  canvasToLayer,
  objectToLayerDisplay,
  objectToNorm,
  patchLayerToNorm,
  type ImageLayout,
} from "../chart/imageLayout";
import { createWedgeObject } from "../wedge/create";
import { LegEqObject } from "./LegEqObject";
import { LegEqPreview } from "./LegEqPreview";
import { PlacedObject } from "./PlacedObject";
import { MmObject } from "./MmObject";
import { MmPreview } from "./MmPreview";
import { WedgeObject } from "./WedgeObject";
import { WedgePreview } from "./WedgePreview";

interface ChartCanvasProps {
  slot: ImageSlot;
  chartImage: string | null;
  objects: CanvasObject[];
  selectedId: string | null;
  activeTool: CanvasTool;
  allowUpload?: boolean;
  onToolChange: (tool: CanvasTool) => void;
  onSelect: (id: string | null) => void;
  onAddObject: (obj: CanvasObject) => void;
  onUpdateObject: (id: string, patch: Partial<CanvasObject>) => void;
  onDeleteSelected: () => void;
  onRemoveObject: (id: string) => void;
  onImageLoad: (dataUrl: string) => void;
  onNormalizeObjects?: (objects: CanvasObject[]) => void;
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

export function ChartCanvas({
  slot,
  chartImage,
  objects: allObjects,
  selectedId,
  activeTool,
  allowUpload = true,
  onToolChange,
  onSelect,
  onAddObject,
  onUpdateObject,
  onDeleteSelected,
  onRemoveObject,
  onImageLoad,
  onNormalizeObjects,
  compact = false,
}: ChartCanvasProps) {
  const objects = objectsForSlot(allObjects, slot);
  const slotLabel =
    slot === "main"
      ? "主图"
      : (CONTEXT_SLOTS.find((s) => s.id === slot)?.label ?? slot);
  const canvasRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageLayout, setImageLayout] = useState<ImageLayout | null>(null);

  const [mmDraftP1, setMmDraftP1] = useState<Point | null>(null);
  const [mmCursor, setMmCursor] = useState<Point | null>(null);

  const [wedgeP1, setWedgeP1] = useState<Point | null>(null);
  const [wedgeCursor, setWedgeCursor] = useState<Point | null>(null);

  const [canvasBounds, setCanvasBounds] = useState<CanvasBounds>({
    width: 800,
    height: 600,
    margin: 40,
  });

  const syncImageLayout = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const layout = getDisplayedImageRect(el, imgRef.current);
    setImageLayout(layout);
    if (layout) {
      setCanvasBounds({
        width: layout.w,
        height: layout.h,
        margin: Math.max(12, layout.w * 0.04),
      });
    } else {
      setCanvasBounds({
        width: el.clientWidth,
        height: el.clientHeight,
        margin: 40,
      });
    }
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    syncImageLayout();
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth) syncImageLayout();
    const ro = new ResizeObserver(syncImageLayout);
    ro.observe(el);
    if (img) {
      img.addEventListener("load", syncImageLayout);
      return () => {
        ro.disconnect();
        img.removeEventListener("load", syncImageLayout);
      };
    }
    return () => ro.disconnect();
  }, [chartImage, syncImageLayout]);

  useEffect(() => {
    if (!imageLayout || !onNormalizeObjects) return;
    const needsPixel = objects.some(isLikelyPixelCoords);
    const needsNoteColor = objects.some(
      (o) => o.kind === "note" && o.props.color !== "#ffffff",
    );
    if (!needsPixel && !needsNoteColor) return;
    let nextSlot = objects;
    if (needsPixel) nextSlot = migrateObjectsToNorm(objects, imageLayout);
    else if (needsNoteColor) nextSlot = objects.map(normalizeNoteColor);
    onNormalizeObjects(mergeSlotObjects(allObjects, slot, nextSlot));
  }, [imageLayout, allObjects, objects, slot, onNormalizeObjects]);

  const getCanvasBounds = useCallback((): CanvasBounds => {
    if (imageLayout) {
      return {
        width: imageLayout.w,
        height: imageLayout.h,
        margin: Math.max(12, imageLayout.w * 0.04),
      };
    }
    const el = canvasRef.current;
    if (!el) return canvasBounds;
    return { width: el.clientWidth, height: el.clientHeight, margin: 40 };
  }, [canvasBounds, imageLayout]);

  const layout = imageLayout;

  const toLayer = useCallback(
    (obj: CanvasObject) => (layout ? objectToLayerDisplay(obj, layout) : obj),
    [layout],
  );

  const updateNorm = useCallback(
    (id: string, patch: Partial<CanvasObject>) => {
      if (!layout) {
        onUpdateObject(id, patch);
        return;
      }
      onUpdateObject(id, patchLayerToNorm(patch, layout));
    },
    [layout, onUpdateObject],
  );

  const addNorm = useCallback(
    (obj: CanvasObject) => {
      const tagged = { ...obj, slot };
      onAddObject(layout ? objectToNorm(tagged, layout) : tagged);
    },
    [layout, onAddObject, slot],
  );

  const getCanvasPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvasPoint(clientX, clientY, canvas);
  }, []);

  const clearToolDrafts = useCallback(() => {
    setMmDraftP1(null);
    setMmCursor(null);
    setWedgeP1(null);
    setWedgeCursor(null);
  }, []);

  const finishMm = useCallback(
    (p1: Point, p2: Point) => {
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 8) return;
      const obj = createMmObject(p1, p2, "auto", "all");
      addNorm(obj);
      clearToolDrafts();
      onToolChange(null);
    },
    [addNorm, onToolChange, clearToolDrafts],
  );

  const finishLegEq = useCallback(
    (p1: Point, p2: Point) => {
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 8) return;
      const legEq = createLegEqObject(p1, p2, getCanvasBounds());
      if (legEq) {
        addNorm(legEq);
        onSelect(legEq.id);
      }
      clearToolDrafts();
      onToolChange(null);
    },
    [addNorm, onSelect, onToolChange, clearToolDrafts, getCanvasBounds],
  );

  const finishWedge = useCallback(
    (p1: Point, p2: Point) => {
      if (!isWedgeTool(activeTool)) return;
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 8) return;
      const obj = createWedgeObject([p1, p2], wedgeColor(activeTool), activeTool);
      if (obj) {
        addNorm(obj);
        onSelect(obj.id);
      }
      clearToolDrafts();
      onToolChange(null);
    },
    [activeTool, addNorm, onSelect, onToolChange, clearToolDrafts],
  );

  const dropObject = useCallback(
    (templateId: string, clientX: number, clientY: number) => {
      const template = findTemplate(templateId);
      const canvas = canvasRef.current;
      if (!template || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left - template.defaultWidth / 2;
      const y = clientY - rect.top - template.defaultHeight / 2;
      addNorm({
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
    [addNorm],
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
      if (!wedgeP1) {
        setWedgeP1(pt);
        setWedgeCursor(pt);
      } else {
        finishWedge(wedgeP1, pt);
      }
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    const pt = getCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;

    if ((activeTool === "mm-auto" || activeTool === "leg-eq") && mmDraftP1) {
      setMmCursor(pt);
      return;
    }

    if (isWedgeTool(activeTool) && wedgeP1) {
      setWedgeCursor(pt);
    }
  };

  const handleCanvasPointerUp = () => {};

  const handleCanvasDoubleClick = () => {};

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
      return wedgeP1
        ? `${color}楔形：点击第 2 个点（自动完成，可拖端点拉长/缩短）`
        : `${color}楔形：点击第 1 个点`;
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, clearToolDrafts, onToolChange]);

  const placedObjects = objects.filter(
    (o) => o.kind !== "mm" && o.kind !== "wedge-line" && o.kind !== "leg-eq",
  );
  const mmObjects = objects.filter((o) => o.kind === "mm");
  const legEqObjects = objects.filter((o) => o.kind === "leg-eq");
  const wedgeObjects = objects.filter((o) => o.kind === "wedge-line");

  const activeWedgeColor = isWedgeTool(activeTool) ? wedgeColor(activeTool) : null;
  const selectedObj = objects.find((o) => o.id === selectedId);
  const effectiveSelectedId =
    selectedObj && objectSlot(selectedObj) === slot ? selectedId : null;
  const canCopyLeg2 =
    selectedObj?.kind === "leg-eq" && !selectedObj.props.hasLeg2;

  return (
    <div className={`canvas-area ${compact ? "canvas-area-compact" : ""}`}>
      <div className="canvas-toolbar">
        {allowUpload && (
          <button type="button" onClick={() => fileRef.current?.click()}>
            {slot === "main" ? "上传截图" : "替换截图"}
          </button>
        )}
        <span className="toolbar-hint">
          Ctrl+V 粘贴到「{slotLabel}」· 拖放标注到此图
        </span>
        {toolHint && <span className="toolbar-hint toolbar-mm-hint">{toolHint}</span>}
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
        {effectiveSelectedId && (
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
          <img
            ref={imgRef}
            src={chartImage}
            alt="Chart"
            className="chart-image"
            draggable={false}
            onLoad={syncImageLayout}
          />
        )}

        {layout && (
          <div
            ref={layerRef}
            className="chart-annotation-layer"
            style={{
              left: layout.x,
              top: layout.y,
              width: layout.w,
              height: layout.h,
            }}
          >
            {activeTool === "mm-auto" && mmDraftP1 ? (
              <MmPreview
                p1={canvasToLayer(mmDraftP1, layout)}
                p2={null}
                cursor={mmCursor ? canvasToLayer(mmCursor, layout) : null}
              />
            ) : null}

            {activeTool === "leg-eq" && mmDraftP1 ? (
              <LegEqPreview
                p1={canvasToLayer(mmDraftP1, layout)}
                p2={null}
                cursor={mmCursor ? canvasToLayer(mmCursor, layout) : null}
              />
            ) : null}

            {isWedgeTool(activeTool) && wedgeP1 && activeWedgeColor ? (
              <WedgePreview
                points={[canvasToLayer(wedgeP1, layout)]}
                cursor={wedgeCursor ? canvasToLayer(wedgeCursor, layout) : null}
                color={activeWedgeColor}
              />
            ) : null}

            {placedObjects.map((obj) => (
              <PlacedObject
                key={obj.id}
                obj={toLayer(obj)}
                selected={obj.id === effectiveSelectedId}
                coordRef={layerRef}
                onSelect={onSelect}
                onMove={(id, x, y) => updateNorm(id, { x, y })}
                onResize={(id, width, height) => updateNorm(id, { width, height })}
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
                obj={toLayer(obj)}
                selected={obj.id === effectiveSelectedId}
                coordRef={layerRef}
                onSelect={onSelect}
                onUpdate={updateNorm}
              />
            ))}

            {legEqObjects.map((obj) => (
              <LegEqObject
                key={obj.id}
                obj={toLayer(obj)}
                selected={obj.id === effectiveSelectedId}
                coordRef={layerRef}
                canvasBounds={getCanvasBounds()}
                onSelect={onSelect}
                onUpdate={updateNorm}
              />
            ))}

            {wedgeObjects.map((obj) => (
              <WedgeObject
                key={obj.id}
                obj={toLayer(obj)}
                selected={obj.id === effectiveSelectedId}
                coordRef={layerRef}
                onSelect={onSelect}
                onUpdate={updateNorm}
                onDelete={onRemoveObject}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
