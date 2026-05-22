import { useCallback, useRef } from "react";
import { canvasPoint, type Point } from "../mm/math";

export interface DragSession {
  pointerId: number;
  canvas: HTMLElement;
  startCanvas: Point;
  grab?: Point;
}

export function canvasPointer(
  canvas: HTMLElement,
  clientX: number,
  clientY: number,
): Point {
  return canvasPoint(clientX, clientY, canvas);
}

export function canvasDelta(
  session: DragSession,
  clientX: number,
  clientY: number,
): Point {
  const cur = canvasPointer(session.canvas, clientX, clientY);
  return { x: cur.x - session.startCanvas.x, y: cur.y - session.startCanvas.y };
}

type DragEndHandler = (delta: Point, endCanvas: Point) => void;

/**
 * Window-level pointer drag: canvas coords, optional grab offset, transform preview.
 */
export function useCanvasDrag(
  canvasRef: React.RefObject<HTMLElement | null>,
  previewElRef: React.RefObject<HTMLElement | null>,
) {
  const sessionRef = useRef<(DragSession & { onEnd: DragEndHandler }) | null>(null);

  const clearPreview = useCallback(() => {
    const el = previewElRef.current;
    if (el) el.style.transform = "";
  }, [previewElRef]);

  const endSession = useCallback(
    (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const d = canvasDelta(s, e.clientX, e.clientY);
      const end = canvasPointer(s.canvas, e.clientX, e.clientY);
      s.onEnd(d, end);
      clearPreview();
      sessionRef.current = null;
    },
    [clearPreview],
  );

  const moveSession = useCallback(
    (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const d = canvasDelta(s, e.clientX, e.clientY);
      const el = previewElRef.current;
      if (el) el.style.transform = `translate(${d.x}px, ${d.y}px)`;
    },
    [previewElRef],
  );

  const startDrag = useCallback(
    (
      e: React.PointerEvent,
      onEnd: DragEndHandler,
      options?: { grabOrigin?: Point },
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      e.stopPropagation();
      const startCanvas = canvasPointer(canvas, e.clientX, e.clientY);
      const grab = options?.grabOrigin
        ? { x: startCanvas.x - options.grabOrigin.x, y: startCanvas.y - options.grabOrigin.y }
        : undefined;

      sessionRef.current = {
        pointerId: e.pointerId,
        canvas,
        startCanvas,
        grab,
        onEnd,
      };

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const onMove = (ev: PointerEvent) => moveSession(ev);
      const onUp = (ev: PointerEvent) => {
        endSession(ev);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [canvasRef, moveSession, endSession],
  );

  const cancelDrag = useCallback(() => {
    sessionRef.current = null;
    clearPreview();
  }, [clearPreview]);

  return { startDrag, cancelDrag, isDragging: () => sessionRef.current != null };
}

/** Live drag with canvas delta (for handles / lines that must update while moving). */
export function useCanvasLiveDrag(canvasRef: React.RefObject<HTMLElement | null>) {
  const sessionRef = useRef<
    (DragSession & { onMove: (delta: Point) => void; onEnd: () => void }) | null
  >(null);

  const endSession = useCallback((e: PointerEvent) => {
    const s = sessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    s.onEnd();
    sessionRef.current = null;
  }, []);

  const moveSession = useCallback((e: PointerEvent) => {
    const s = sessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    s.onMove(canvasDelta(s, e.clientX, e.clientY));
  }, []);

  const startLiveDrag = useCallback(
    (
      e: React.PointerEvent,
      onMove: (delta: Point) => void,
      onEnd: () => void,
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      e.stopPropagation();
      sessionRef.current = {
        pointerId: e.pointerId,
        canvas,
        startCanvas: canvasPointer(canvas, e.clientX, e.clientY),
        onMove,
        onEnd,
      };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const onWinMove = (ev: PointerEvent) => moveSession(ev);
      const onWinUp = (ev: PointerEvent) => {
        endSession(ev);
        window.removeEventListener("pointermove", onWinMove);
        window.removeEventListener("pointerup", onWinUp);
        window.removeEventListener("pointercancel", onWinUp);
      };
      window.addEventListener("pointermove", onWinMove);
      window.addEventListener("pointerup", onWinUp);
      window.addEventListener("pointercancel", onWinUp);
    },
    [canvasRef, moveSession, endSession],
  );

  return { startLiveDrag };
}
