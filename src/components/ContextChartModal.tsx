import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { CanvasObject, CanvasTool, ContextSlot } from "../types";
import { ChartCanvas } from "./ChartCanvas";

interface ContextChartModalProps {
  open: boolean;
  slot: ContextSlot;
  title: string;
  image: string;
  sidebarOpen: boolean;
  objects: CanvasObject[];
  selectedId: string | null;
  activeTool: CanvasTool;
  onClose: () => void;
  onImageChange: (url: string) => void;
  onToolChange: (tool: CanvasTool) => void;
  onSelect: (id: string | null) => void;
  onAddObject: (obj: CanvasObject) => void;
  onUpdateObject: (id: string, patch: Partial<CanvasObject>) => void;
  onDeleteSelected: () => void;
  onRemoveObject: (id: string) => void;
  onNormalizeObjects?: (objects: CanvasObject[]) => void;
}

function toggleTool(current: CanvasTool, tool: CanvasTool): CanvasTool {
  return current === tool ? null : tool;
}

export function ContextChartModal({
  open,
  slot,
  title,
  image,
  sidebarOpen,
  objects,
  selectedId,
  activeTool,
  onClose,
  onImageChange,
  onToolChange,
  onSelect,
  onAddObject,
  onUpdateObject,
  onDeleteSelected,
  onRemoveObject,
  onNormalizeObjects,
}: ContextChartModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !activeTool) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeTool, onClose]);

  if (!open) return null;

  const modal = (
    <div
      className={`context-chart-modal ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 放大标注`}
    >
      <button
        type="button"
        className="context-chart-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="context-chart-panel">
        <header className="context-chart-header">
          <div>
            <h3>{title}</h3>
            <p className="context-chart-sub">
              在图上点击绘制 · 右侧「标注工具」可拖入 DT / 箭头等
            </p>
          </div>
          <div className="context-chart-header-actions">
            <div className="context-chart-quick-tools" role="toolbar" aria-label="快捷工具">
              <button
                type="button"
                className={activeTool === "wedge-green" ? "active" : ""}
                onClick={() => onToolChange(toggleTool(activeTool, "wedge-green"))}
              >
                绿楔形
              </button>
              <button
                type="button"
                className={activeTool === "wedge-red" ? "active" : ""}
                onClick={() => onToolChange(toggleTool(activeTool, "wedge-red"))}
              >
                红楔形
              </button>
              <button
                type="button"
                className={activeTool === "mm-auto" ? "active" : ""}
                onClick={() => onToolChange(toggleTool(activeTool, "mm-auto"))}
              >
                MM
              </button>
              <button
                type="button"
                className={activeTool === "leg-eq" ? "active" : ""}
                onClick={() => onToolChange(toggleTool(activeTool, "leg-eq"))}
              >
                L1=L2
              </button>
            </div>
            <button type="button" className="context-chart-close" onClick={onClose}>
              退出全屏
            </button>
          </div>
        </header>
        <ChartCanvas
          slot={slot}
          chartImage={image}
          objects={objects}
          selectedId={selectedId}
          activeTool={activeTool}
          allowUpload
          onToolChange={onToolChange}
          onSelect={onSelect}
          onAddObject={onAddObject}
          onUpdateObject={onUpdateObject}
          onDeleteSelected={onDeleteSelected}
          onRemoveObject={onRemoveObject}
          onImageLoad={onImageChange}
          onNormalizeObjects={onNormalizeObjects}
          compact={false}
        />
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
