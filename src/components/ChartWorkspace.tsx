import { useCallback, useEffect, useState } from "react";
import type { CanvasObject, CanvasTool, ContextImages, ContextSlot, ImageSlot } from "../types";
import { CONTEXT_SLOTS } from "../types";
import { ChartCanvas } from "./ChartCanvas";
import { ContextImagePane } from "./ContextImagePane";

interface ChartWorkspaceProps {
  chartImage: string | null;
  contextImages: ContextImages;
  objects: CanvasObject[];
  selectedId: string | null;
  activeTool: CanvasTool;
  pasteTarget: ImageSlot;
  onPasteTargetChange: (slot: ImageSlot) => void;
  onMainImageChange: (url: string | null) => void;
  onContextImageChange: (slot: ContextSlot, url: string | null) => void;
  onToolChange: (tool: CanvasTool) => void;
  onSelect: (id: string | null) => void;
  onAddObject: (obj: CanvasObject) => void;
  onUpdateObject: (id: string, patch: Partial<CanvasObject>) => void;
  onDeleteSelected: () => void;
  onRemoveObject: (id: string) => void;
}

export function ChartWorkspace({
  chartImage,
  contextImages,
  objects,
  selectedId,
  activeTool,
  pasteTarget,
  onPasteTargetChange,
  onMainImageChange,
  onContextImageChange,
  onToolChange,
  onSelect,
  onAddObject,
  onUpdateObject,
  onDeleteSelected,
  onRemoveObject,
}: ChartWorkspaceProps) {
  const [mainExpanded, setMainExpanded] = useState(false);

  useEffect(() => {
    if (!mainExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMainExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mainExpanded]);

  const setContext = useCallback(
    (slot: ContextSlot, url: string | null) => {
      onContextImageChange(slot, url);
    },
    [onContextImageChange],
  );

  return (
    <div className={`chart-workspace ${mainExpanded ? "main-expanded" : ""}`}>
      <div className="chart-grid">
        <aside className="chart-grid-context">
          {CONTEXT_SLOTS.map(({ id, label }) => (
            <ContextImagePane
              key={id}
              slot={id}
              label={label}
              image={contextImages[id]}
              active={pasteTarget === id}
              onActivate={() => onPasteTargetChange(id)}
              onImageChange={(url) => setContext(id, url)}
            />
          ))}
        </aside>

        <div
          className={`chart-grid-main ${pasteTarget === "main" ? "is-active" : ""}`}
          onPointerDown={() => onPasteTargetChange("main")}
        >
          <div className="chart-grid-main-bar">
            <span className="chart-grid-main-title">主图 · 复盘标注</span>
            <button
              type="button"
              className="chart-expand-btn"
              onClick={() => setMainExpanded((v) => !v)}
              title={mainExpanded ? "退出全屏 (Esc)" : "放大主图"}
            >
              {mainExpanded ? "退出全屏" : "⛶ 放大主图"}
            </button>
          </div>
          <ChartCanvas
            chartImage={chartImage}
            objects={objects}
            selectedId={selectedId}
            activeTool={activeTool}
            onToolChange={onToolChange}
            onSelect={onSelect}
            onAddObject={onAddObject}
            onUpdateObject={onUpdateObject}
            onDeleteSelected={onDeleteSelected}
            onRemoveObject={onRemoveObject}
            onImageLoad={(url) => onMainImageChange(url)}
            compact={!mainExpanded}
          />
        </div>
      </div>

      {mainExpanded && (
        <button
          type="button"
          className="chart-expand-backdrop"
          aria-label="退出全屏"
          onClick={() => setMainExpanded(false)}
        />
      )}
    </div>
  );
}
