export const CELL = 22;

export type View = { scale: number; tx: number; ty: number };

export function fitView(width: number, height: number, cols: number, rows: number): View {
  const scale = Math.min(width / (cols * CELL), height / (rows * CELL)) * 0.9;
  return {
    scale: Math.max(0.2, scale),
    tx: (width - cols * CELL * Math.max(0.2, scale)) / 2,
    ty: (height - rows * CELL * Math.max(0.2, scale)) / 2,
  };
}

export function clampScale(scale: number) {
  return Math.max(0.25, Math.min(14, scale));
}

export function pinchView(start: View, startMid: { x: number; y: number }, mid: { x: number; y: number }, factor: number): View {
  const scale = clampScale(start.scale * factor);
  const wx = (startMid.x - start.tx) / start.scale;
  const wy = (startMid.y - start.ty) / start.scale;
  return { scale, tx: mid.x - wx * scale, ty: mid.y - wy * scale };
}

export function zoomAt(view: View, cx: number, cy: number, factor: number): View {
  const scale = clampScale(view.scale * factor);
  const k = scale / view.scale;
  return { scale, tx: cx - (cx - view.tx) * k, ty: cy - (cy - view.ty) * k };
}

export function cellAt(view: View, x: number, y: number, cols: number, rows: number) {
  const col = Math.floor((x - view.tx) / view.scale / CELL);
  const row = Math.floor((y - view.ty) / view.scale / CELL);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return { col, row };
}
