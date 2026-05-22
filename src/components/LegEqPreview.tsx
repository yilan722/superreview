import type { Point } from "../mm/math";
import { LegEqSvg } from "../legEq/draw";
import { computeLegEqLayout } from "../legEq/layout";

interface LegEqPreviewProps {
  p1: Point | null;
  p2: Point | null;
  cursor: Point | null;
}

export function LegEqPreview({ p1, p2, cursor }: LegEqPreviewProps) {
  if (!p1) return null;
  const end = p2 ?? cursor;
  if (!end) {
    return (
      <svg className="leg-eq-preview-layer">
        <circle cx={p1.x} cy={p1.y} r={5} fill="#eab308" />
      </svg>
    );
  }

  const layout = computeLegEqLayout(p1, end, false);
  if (!layout) {
    return (
      <svg className="leg-eq-preview-layer">
        <circle cx={p1.x} cy={p1.y} r={5} fill="#eab308" />
      </svg>
    );
  }

  return (
    <svg className="leg-eq-preview-layer">
      <LegEqSvg layout={layout} origin={{ x: 0, y: 0 }} opacity={0.85} />
      <circle cx={p1.x} cy={p1.y} r={4} fill="#eab308" />
      <circle cx={end.x} cy={end.y} r={4} fill="#3b82f6" />
    </svg>
  );
}
