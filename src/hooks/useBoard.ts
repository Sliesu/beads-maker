import { useEffect, useRef, type PointerEvent } from 'react';
import { cellAt, fitView, pinchView, zoomAt, type View } from '../lib/view';

export type PointInfo = { x: number; y: number; col: number | null; row: number | null };

type Gestures = {
  onSingleDown?: (info: PointInfo) => void;
  onSingleMove?: (info: PointInfo) => void;
  onSingleUp?: () => void;
  onCancel?: () => void;
};

export function useBoard(cols: number, rows: number, redrawFlag: number) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const drawRef = useRef<(ctx: CanvasRenderingContext2D, view: View) => void>(() => {});
  const gestures = useRef<Gestures>({});
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; midX: number; midY: number; view: View } | null>(null);
  const sizeRef = useRef({ cols, rows });
  const fitted = useRef(false);
  sizeRef.current = { cols, rows };

  const paint = () => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.max(1, Math.floor(rect.width * dpr));
    const bh = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.translate(viewRef.current.tx, viewRef.current.ty);
    ctx.scale(viewRef.current.scale, viewRef.current.scale);
    drawRef.current(ctx, viewRef.current);
    ctx.restore();
  };

  const refit = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;
    viewRef.current = fitView(rect.width, rect.height, sizeRef.current.cols, sizeRef.current.rows);
    paint();
  };

  useEffect(() => {
    fitted.current = false;
    const stage = stageRef.current;
    if (!stage) return;
    const apply = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      if (!fitted.current) {
        viewRef.current = fitView(rect.width, rect.height, sizeRef.current.cols, sizeRef.current.rows);
        fitted.current = true;
      }
      paint();
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [cols, rows]);

  useEffect(() => {
    paint();
  }, [redrawFlag]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      viewRef.current = zoomAt(
        viewRef.current,
        event.clientX - rect.left,
        event.clientY - rect.top,
        event.deltaY < 0 ? 1.08 : 0.92,
      );
      paint();
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  const pointOf = (event: { clientX: number; clientY: number }): PointInfo => {
    const rect = stageRef.current!.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { cols: c, rows: r } = sizeRef.current;
    const cell = cellAt(viewRef.current, x, y, c, r);
    return { x, y, col: cell?.col ?? null, row: cell?.row ?? null };
  };

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
      event.currentTarget.setPointerCapture(event.pointerId);
      const info = pointOf(event);
      pointers.current.set(event.pointerId, info);
      if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
          view: { ...viewRef.current },
        };
        gestures.current.onCancel?.();
        return;
      }
      gestures.current.onSingleDown?.(info);
    },
    onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
      if (!pointers.current.has(event.pointerId)) return;
      const info = pointOf(event);
      pointers.current.set(event.pointerId, info);
      if (pointers.current.size >= 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        viewRef.current = pinchView(
          pinch.current.view,
          { x: pinch.current.midX, y: pinch.current.midY },
          mid,
          dist / pinch.current.dist,
        );
        paint();
        return;
      }
      gestures.current.onSingleMove?.(info);
    },
    onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      if (pointers.current.size === 0) gestures.current.onSingleUp?.();
    },
  };

  const zoomBy = (factor: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    viewRef.current = zoomAt(viewRef.current, rect.width / 2, rect.height / 2, factor);
    paint();
  };

  return {
    stageRef,
    canvasRef,
    viewRef,
    drawRef,
    gestures,
    handlers,
    paint,
    refit,
    zoomIn: () => zoomBy(1.22),
    zoomOut: () => zoomBy(1 / 1.22),
  };
}
