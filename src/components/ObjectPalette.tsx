import { ALL_SECTIONS } from "../palette";
import { AnnotationGuide } from "./AnnotationGuide";
import type { CanvasTool } from "../types";
import type { PaletteTemplate } from "../types";
import { ArrowSvg } from "./ArrowSvg";

function PalettePreview({ item }: { item: PaletteTemplate }) {
  const p = item.props;
  if (item.kind === "text-label") {
    return (
      <span className="palette-text" style={{ color: String(p.color) }}>
        {String(p.text)}
      </span>
    );
  }
  if (item.kind === "rect-small" || item.kind === "rect-tall") {
    return (
      <span
        className="palette-swatch"
        style={{
          background: String(p.fill),
          width: item.kind === "rect-small" ? 14 : 12,
          height: item.kind === "rect-small" ? 14 : 28,
          opacity: p.outlined ? 0.4 : 0.85,
          border: p.outlined ? `1.5px solid ${String(p.fill)}` : "none",
        }}
      />
    );
  }
  if (item.kind === "rect-zone") {
    return (
      <span
        className="palette-zone-preview"
        style={{ borderColor: String(p.fill), color: String(p.fill) }}
      >
        ▭
      </span>
    );
  }
  if (item.kind === "hline") {
    return <span className="palette-line" style={{ background: String(p.color) }} />;
  }
  if (item.kind === "arrow") {
    return (
      <ArrowSvg
        direction={p.direction as import("../types").ArrowDirection}
        color={String(p.color)}
        width={28}
        height={28}
      />
    );
  }
  if (item.kind === "note") {
    return <span className="palette-note-icon">📝</span>;
  }
  return <span>{item.label}</span>;
}

interface ObjectPaletteProps {
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  onDragStart: (templateId: string) => void;
}

export function ObjectPalette({ activeTool, onToolChange, onDragStart }: ObjectPaletteProps) {
  return (
    <aside className="palette">
      <header className="palette-header">
        <h2>标注工具</h2>
        <p>拖到图表上 · 双击文字可改</p>
      </header>
      <div className="palette-scroll">
        <AnnotationGuide />
        <section className="palette-section palette-mm-section">
          <h3>Measured Move</h3>
          <div className="palette-mm-tools">
            <button
              type="button"
              className={`palette-mm-btn ${activeTool === "leg-eq" ? "active" : ""}`}
              onClick={() => onToolChange(activeTool === "leg-eq" ? null : "leg-eq")}
            >
              <span className="palette-mm-icon palette-leg-eq-icon">L1=L2</span>
              <span className="palette-mm-label">
                <strong>Leg1 = Leg2</strong>
                <small>点两下画 Leg1，选中后复制成 Leg2</small>
              </span>
            </button>
            <button
              type="button"
              className={`palette-mm-btn ${activeTool === "mm-auto" ? "active" : ""}`}
              onClick={() => onToolChange(activeTool === "mm-auto" ? null : "mm-auto")}
            >
              <span className="palette-mm-icon">◎→</span>
              <span className="palette-mm-label">
                <strong>Auto MM</strong>
                <small>点两下：Leg1 起→止，多条 MM 目标线</small>
              </span>
            </button>
          </div>
          <p className="palette-mm-note">
            Leg1=L2 专用于等长第二段 · Auto MM 含 2x/TR/½PB 等
          </p>
        </section>

        <section className="palette-section palette-wedge-section">
          <h3>Wedge 楔形线</h3>
          <div className="palette-wedge-tools">
            <button
              type="button"
              className={`palette-mm-btn palette-wedge-btn ${activeTool === "wedge-green" ? "active" : ""}`}
              onClick={() =>
                onToolChange(activeTool === "wedge-green" ? null : "wedge-green")
              }
            >
              <span className="palette-wedge-swatch" style={{ background: "#16a34a" }} />
              <span className="palette-mm-label">
                <strong>绿色楔形</strong>
                <small>牛楔形 / 支撑线</small>
              </span>
            </button>
            <button
              type="button"
              className={`palette-mm-btn palette-wedge-btn ${activeTool === "wedge-red" ? "active" : ""}`}
              onClick={() =>
                onToolChange(activeTool === "wedge-red" ? null : "wedge-red")
              }
            >
              <span className="palette-wedge-swatch" style={{ background: "#dc2626" }} />
              <span className="palette-mm-label">
                <strong>红色楔形</strong>
                <small>熊楔形 / 压力线</small>
              </span>
            </button>
          </div>
          <p className="palette-mm-note">
            点击画折线 · 按住拖拽自由画 · Enter / 双击 /「完成楔形」结束
          </p>
        </section>

        {ALL_SECTIONS.map((section) => (
          <section key={section.title} className="palette-section">
            <h3>{section.title}</h3>
            <div
              className={[
                "palette-grid",
                section.title.includes("箭头") && "palette-grid-arrows",
                section.items[0]?.kind === "text-label" && "palette-grid-labels",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="palette-item"
                  draggable
                  title={item.label}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-template-id", item.id);
                    e.dataTransfer.effectAllowed = "copy";
                    onDragStart(item.id);
                  }}
                >
                  <PalettePreview item={item} />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
