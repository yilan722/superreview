import { computeMmTargets, type Point } from "../mm/math";

interface MmPreviewProps {
  p1: Point | null;
  p2: Point | null;
  cursor: Point | null;
}

export function MmPreview({ p1, p2, cursor }: MmPreviewProps) {
  if (!p1) return null;
  const end = p2 ?? cursor;
  if (!end) {
    return (
      <svg className="mm-preview-layer">
        <circle cx={p1.x} cy={p1.y} r={5} fill="#3b82f6" />
      </svg>
    );
  }

  const targets = computeMmTargets(p1, end);
  const lineX1 = Math.min(p1.x, end.x) - 4;
  const lineX2 = Math.max(p1.x, end.x) + 12;

  return (
    <svg className="mm-preview-layer">
      <line
        x1={p1.x}
        y1={p1.y}
        x2={end.x}
        y2={end.y}
        stroke="#93c5fd"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      {targets.map((t) => (
        <line
          key={t.id}
          x1={lineX1}
          y1={t.y}
          x2={lineX2}
          y2={t.y}
          stroke={t.color}
          strokeWidth={1.5}
          strokeDasharray="6 4"
          opacity={0.55}
        />
      ))}
    </svg>
  );
}
