import type { Point } from "../mm/math";

interface WedgePreviewProps {
  points: Point[];
  cursor: Point | null;
  color: string;
}

export function WedgePreview({ points, cursor, color }: WedgePreviewProps) {
  if (points.length === 0 && !cursor) return null;

  const all = cursor ? [...points, cursor] : points;
  if (all.length < 1) return null;

  const polyline = all.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg className="wedge-preview-layer">
      {all.length >= 2 && (
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray="10 6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
      )}
      {all.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill={color} opacity={0.9} />
      ))}
    </svg>
  );
}
