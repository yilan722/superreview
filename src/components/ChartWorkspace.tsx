import { useCallback, useEffect, useState } from "react";
import type { CanvasObject, CanvasTool, ContextImages, ContextSlot, ImageSlot } from "../types";
import { CONTEXT_SLOTS } from "../types";
import { objectSlot } from "../canvas/slots";
import { ChartCanvas } from "./ChartCanvas";
import { ContextChartModal } from "./ContextChartModal";
import { ContextImagePane } from "./ContextImagePane";

interface ChartWorkspaceProps {
  sidebarOpen: boolean;
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
  onNormalizeObjects?: (objects: CanvasObject[]) => void;
}

export function ChartWorkspace({
  sidebarOpen,
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
  onNormalizeObjects,
}: ChartWorkspaceProps) {
  const [mainExpanded, setMainExpanded] = useState(false);
  const [expandedContext, setExpandedContext] = useState<ContextSlot | null>(null);

  useEffect(() => {
    if (!mainExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !activeTool) setMainExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mainExpanded, activeTool]);

  const setContext = useCallback(
    (slot: ContextSlot, url: string | null) => {
      onContextImageChange(slot, url);
    },
    [onContextImageChange],
  );

  const openContextExpand = useCallback(
    (slot: ContextSlot) => {
      onPasteTargetChange(slot);
      if (selectedId) {
        const obj = objects.find((o) => o.id === selectedId);
        if (obj && objectSlot(obj) !== slot) onSelect(null);
      }
      setExpandedContext(slot);
    },
    [objects, selectedId, onPasteTargetChange, onSelect],
  );

  const expandedMeta = expandedContext
    ? CONTEXT_SLOTS.find((s) => s.id === expandedContext)
    : null;

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
              onExpand={() => openContextExpand(id)}
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
            slot="main"
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
            onNormalizeObjects={onNormalizeObjects}
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

      {expandedContext && contextImages[expandedContext] && expandedMeta && (
        <ContextChartModal
          open
          slot={expandedContext}
          title={expandedMeta.label}
          image={contextImages[expandedContext]!}
          sidebarOpen={sidebarOpen}
          objects={objects}
          selectedId={selectedId}
          activeTool={activeTool}
          onClose={() => setExpandedContext(null)}
          onImageChange={(url) => setContext(expandedContext, url)}
          onToolChange={onToolChange}
          onSelect={onSelect}
          onAddObject={onAddObject}
          onUpdateObject={onUpdateObject}
          onDeleteSelected={onDeleteSelected}
          onRemoveObject={onRemoveObject}
          onNormalizeObjects={onNormalizeObjects}
        />
      )}
    </div>
  );
}
