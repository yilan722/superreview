import type { ArrowDirection } from "../types";

interface ArrowSvgProps {
  direction: ArrowDirection;
  color: string;
  width: number;
  height: number;
}

export function ArrowSvg({ direction, color, width, height }: ArrowSvgProps) {
  const stroke = color;
  const sw = 2.5;
  const head = 9;

  const line = (x1: number, y1: number, x2: number, y2: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
  );

  const headMarker = (x: number, y: number, angle: number) => (
    <polygon
      points={`${x},${y} ${x - head * Math.cos(angle - 0.4)},${y - head * Math.sin(angle - 0.4)} ${x - head * Math.cos(angle + 0.4)},${y - head * Math.sin(angle + 0.4)}`}
      fill={stroke}
    />
  );

  const cx = width / 2;
  const cy = height / 2;
  const pad = 8;

  const render = () => {
    switch (direction) {
      case "up":
        return (
          <>
            {line(cx, height - pad, cx, pad + head)}
            {headMarker(cx, pad, -Math.PI / 2)}
          </>
        );
      case "down":
        return (
          <>
            {line(cx, pad, cx, height - pad - head)}
            {headMarker(cx, height - pad, Math.PI / 2)}
          </>
        );
      case "left":
        return (
          <>
            {line(width - pad, cy, pad + head, cy)}
            {headMarker(pad, cy, Math.PI)}
          </>
        );
      case "right":
        return (
          <>
            {line(pad, cy, width - pad - head, cy)}
            {headMarker(width - pad, cy, 0)}
          </>
        );
      case "up-right":
        return (
          <>
            {line(pad, height - pad, width - pad - head * 0.7, pad + head * 0.7)}
            {headMarker(width - pad, pad, -Math.PI / 4)}
          </>
        );
      case "down-right":
        return (
          <>
            {line(pad, pad, width - pad - head * 0.7, height - pad - head * 0.7)}
            {headMarker(width - pad, height - pad, Math.PI / 4)}
          </>
        );
      case "up-left":
        return (
          <>
            {line(width - pad, height - pad, pad + head * 0.7, pad + head * 0.7)}
            {headMarker(pad, pad, (-3 * Math.PI) / 4)}
          </>
        );
      case "down-left":
        return (
          <>
            {line(width - pad, pad, pad + head * 0.7, height - pad - head * 0.7)}
            {headMarker(pad, height - pad, (3 * Math.PI) / 4)}
          </>
        );
      case "double-h":
        return (
          <>
            {line(pad + head, cy, width - pad - head, cy)}
            {headMarker(pad + head, cy, Math.PI)}
            {headMarker(width - pad - head, cy, 0)}
          </>
        );
      case "double-v":
        return (
          <>
            {line(cx, pad + head, cx, height - pad - head)}
            {headMarker(cx, pad + head, -Math.PI / 2)}
            {headMarker(cx, height - pad - head, Math.PI / 2)}
          </>
        );
      case "bend-ne":
        return (
          <>
            {line(pad, height - pad, pad, pad + head)}
            {line(pad, pad, width - pad - head, pad)}
            {headMarker(pad, pad + head, -Math.PI / 2)}
            {headMarker(width - pad - head, pad, 0)}
          </>
        );
      case "bend-se":
        return (
          <>
            {line(pad, pad, pad, height - pad - head)}
            {line(pad, height - pad, width - pad - head, height - pad)}
            {headMarker(pad, height - pad - head, Math.PI / 2)}
            {headMarker(width - pad - head, height - pad, 0)}
          </>
        );
      case "bend-nw":
        return (
          <>
            {line(width - pad, height - pad, width - pad, pad + head)}
            {line(width - pad, pad, pad + head, pad)}
            {headMarker(width - pad, pad + head, -Math.PI / 2)}
            {headMarker(pad + head, pad, Math.PI)}
          </>
        );
      case "bend-sw":
        return (
          <>
            {line(width - pad, pad, width - pad, height - pad - head)}
            {line(width - pad, height - pad, pad + head, height - pad)}
            {headMarker(width - pad, height - pad - head, Math.PI / 2)}
            {headMarker(pad + head, height - pad, Math.PI)}
          </>
        );
      default:
        return line(pad, cy, width - pad, cy);
    }
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {render()}
    </svg>
  );
}
