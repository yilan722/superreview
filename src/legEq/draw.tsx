import type { LegEqLayout } from "./layout";
import type { Point } from "../mm/math";

function cap(ax: number, ay: number, bx: number, by: number, color: string) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * 5;
  const py = (dx / len) * 5;
  return (
    <g stroke={color}>
      <line x1={ax + px} y1={ay + py} x2={ax - px} y2={ay - py} strokeWidth={2} />
      <line x1={bx + px} y1={by + py} x2={bx - px} y2={by - py} strokeWidth={2} />
    </g>
  );
}

function bracketSeg(
  a: Point,
  b: Point,
  color: string,
  dash: string | undefined,
  label: string,
  labelAt: Point,
  ox: number,
  oy: number,
  hit = false,
) {
  const ax = a.x - ox;
  const ay = a.y - oy;
  const bx = b.x - ox;
  const by = b.y - oy;
  return (
    <g>
      {hit && (
        <line
          x1={ax}
          y1={ay}
          x2={bx}
          y2={by}
          stroke="transparent"
          strokeWidth={18}
          style={{ pointerEvents: "stroke" }}
          className="leg-eq-leg2-hit"
        />
      )}
      <line
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray={dash}
        strokeLinecap="round"
        style={{ pointerEvents: hit ? "none" : "auto" }}
      />
      {cap(ax, ay, bx, by, color)}
      <text
        x={labelAt.x - ox}
        y={labelAt.y - oy}
        fill={color}
        fontSize={11}
        fontFamily="IBM Plex Mono, monospace"
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ pointerEvents: "none" }}
      >
        {label}
      </text>
    </g>
  );
}

interface LegEqSvgProps {
  layout: LegEqLayout;
  origin: Point;
  opacity?: number;
  leg2Draggable?: boolean;
}

export function LegEqSvg({ layout, origin, opacity = 1, leg2Draggable }: LegEqSvgProps) {
  const ox = origin.x;
  const oy = origin.y;

  return (
    <g opacity={opacity}>
      <line
        x1={layout.p1.x - ox}
        y1={layout.p1.y - oy}
        x2={layout.p2.x - ox}
        y2={layout.p2.y - oy}
        stroke="#94a3b8"
        strokeWidth={1.5}
        strokeDasharray="5 4"
        opacity={0.8}
      />

      {bracketSeg(layout.b1a, layout.b1b, "#e2e8f0", "7 5", "Leg 1", layout.label1, ox, oy)}

      {layout.hasLeg2 && layout.l2a && layout.l2b && layout.b2a && layout.b2b && layout.label2 && (
        <>
          {Math.hypot(layout.l2a.x - layout.p2.x, layout.l2a.y - layout.p2.y) > 12 && (
            <line
              x1={layout.p2.x - ox}
              y1={layout.p2.y - oy}
              x2={layout.l2a.x - ox}
              y2={layout.l2a.y - oy}
              stroke="#475569"
              strokeWidth={1}
              strokeDasharray="3 4"
              opacity={0.6}
            />
          )}
          {leg2Draggable && (
            <line
              x1={layout.l2a.x - ox}
              y1={layout.l2a.y - oy}
              x2={layout.l2b.x - ox}
              y2={layout.l2b.y - oy}
              stroke="transparent"
              strokeWidth={20}
              style={{ pointerEvents: "stroke" }}
              className="leg-eq-leg2-hit"
            />
          )}
          <line
            x1={layout.l2a.x - ox}
            y1={layout.l2a.y - oy}
            x2={layout.l2b.x - ox}
            y2={layout.l2b.y - oy}
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            opacity={0.8}
            style={{ pointerEvents: leg2Draggable ? "none" : "auto" }}
          />
          {bracketSeg(
            layout.b2a,
            layout.b2b,
            "#22c55e",
            undefined,
            "Leg 2",
            layout.label2,
            ox,
            oy,
            leg2Draggable,
          )}
          {layout.targetA && layout.targetB && (
            <>
              <line
                x1={layout.targetA.x - ox}
                y1={layout.targetA.y - oy}
                x2={layout.targetB.x - ox}
                y2={layout.targetB.y - oy}
                stroke="#22c55e"
                strokeWidth={2.5}
              />
              {layout.targetLabel && (
                <text
                  x={layout.targetLabel.x - ox}
                  y={layout.targetLabel.y - oy}
                  fill="#22c55e"
                  fontSize={10}
                  fontWeight={600}
                  fontFamily="IBM Plex Mono, monospace"
                  textAnchor="middle"
                >
                  Leg1 = Leg2
                </text>
              )}
            </>
          )}
        </>
      )}
    </g>
  );
}
