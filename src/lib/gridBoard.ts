export const AXIS = 28;

export type BoardView = { scale: number; tx: number; ty: number };

export function fitBoard(width: number, height: number, cols: number, rows: number): BoardView {
  const scale = Math.min((width - AXIS) / cols, (height - AXIS) / rows);
  const gw = cols * scale;
  const gh = rows * scale;
  return { scale, tx: AXIS + (width - AXIS - gw) / 2, ty: AXIS + (height - AXIS - gh) / 2 };
}

function limitScale(scale: number, width: number, height: number, cols: number, rows: number) {
  const fit = Math.min((width - AXIS) / cols, (height - AXIS) / rows);
  return Math.max(fit, Math.min(40, scale));
}

export function scaleAround(
  view: BoardView,
  cx: number,
  cy: number,
  factor: number,
  width: number,
  height: number,
  cols: number,
  rows: number,
): BoardView {
  const scale = limitScale(view.scale * factor, width, height, cols, rows);
  const k = scale / view.scale;
  return { scale, tx: cx - (cx - view.tx) * k, ty: cy - (cy - view.ty) * k };
}

export function zoomBoard(
  view: BoardView,
  cx: number,
  cy: number,
  factor: number,
  width: number,
  height: number,
  cols: number,
  rows: number,
) {
  return holdBoard(scaleAround(view, cx, cy, factor, width, height, cols, rows), width, height, cols, rows);
}

function clampRange(value: number, a: number, b: number) {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return Math.min(max, Math.max(min, value));
}

export function slideBoard(view: BoardView, width: number, height: number, cols: number, rows: number): BoardView {
  const gw = cols * view.scale;
  const gh = rows * view.scale;
  const keep = 72;
  return {
    scale: view.scale,
    tx: clampRange(view.tx, AXIS + keep - gw, width - keep),
    ty: clampRange(view.ty, AXIS + keep - gh, height - keep),
  };
}

export function holdBoard(view: BoardView, width: number, height: number, cols: number, rows: number): BoardView {
  const gw = cols * view.scale;
  const gh = rows * view.scale;
  const innerW = width - AXIS;
  const innerH = height - AXIS;
  return {
    scale: view.scale,
    tx: gw <= innerW ? AXIS + (innerW - gw) / 2 : Math.min(AXIS, Math.max(width - gw, view.tx)),
    ty: gh <= innerH ? AXIS + (innerH - gh) / 2 : Math.min(AXIS, Math.max(height - gh, view.ty)),
  };
}

function numberStep(scale: number) {
  if (scale >= 18) return 1;
  if (scale >= 2.4) return 5;
  if (scale >= 1.4) return 10;
  return 20;
}

function wantsNumber(index: number, count: number, step: number) {
  const n = index + 1;
  if (n === 1 || n % step === 0) return true;
  if (n !== count) return false;
  const prev = Math.floor((count - 1) / step) * step;
  return prev !== count && count - prev >= Math.ceil(step * 0.6);
}

export function cellAt(view: BoardView, x: number, y: number, cols: number, rows: number) {
  if (x < AXIS || y < AXIS) return null;
  const col = Math.floor((x - view.tx) / view.scale);
  const row = Math.floor((y - view.ty) / view.scale);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return { col, row };
}

export function drawRuler(
  ctx: CanvasRenderingContext2D,
  view: BoardView,
  width: number,
  height: number,
  cols: number,
  rows: number,
) {
  ctx.fillStyle = '#FFF6EC';
  ctx.fillRect(0, 0, width, AXIS);
  ctx.fillRect(0, AXIS, AXIS, height - AXIS);
  ctx.strokeStyle = 'rgba(106,70,54,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(AXIS + 0.5, 0);
  ctx.lineTo(AXIS + 0.5, height);
  ctx.moveTo(0, AXIS + 0.5);
  ctx.lineTo(width, AXIS + 0.5);
  ctx.stroke();
  const step = numberStep(view.scale);
  ctx.font = '11px "Zen Maru Gothic", "ZCOOL KuaiLe", sans-serif';
  ctx.textBaseline = 'middle';
  const c0 = Math.max(0, Math.floor((AXIS - view.tx) / view.scale) - 1);
  const c1 = Math.min(cols, Math.ceil((width - view.tx) / view.scale) + 1);
  const r0 = Math.max(0, Math.floor((AXIS - view.ty) / view.scale) - 1);
  const r1 = Math.min(rows, Math.ceil((height - view.ty) / view.scale) + 1);
  ctx.textAlign = 'center';
  let lastColLabel = -999;
  for (let col = c0; col < c1; col++) {
    const x = view.tx + (col + 0.5) * view.scale;
    if (x < AXIS + 6 || x > width - 6) continue;
    const numbered = wantsNumber(col, cols, step) && x - lastColLabel >= 14;
    const mid = (col + 1) % 5 === 0;
    if (!numbered && !mid && view.scale < 6) continue;
    const len = numbered ? 7 : mid ? 5 : 3;
    ctx.strokeStyle = numbered ? '#6A4636' : mid ? 'rgba(106,70,54,0.45)' : 'rgba(106,70,54,0.22)';
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, AXIS - len);
    ctx.lineTo(Math.round(x) + 0.5, AXIS - 1);
    ctx.stroke();
    if (numbered) {
      ctx.fillStyle = '#6A4636';
      ctx.fillText(String(col + 1), x, 10);
      lastColLabel = x;
    }
  }
  ctx.textAlign = 'right';
  let lastRowLabel = -999;
  for (let row = r0; row < r1; row++) {
    const y = view.ty + (row + 0.5) * view.scale;
    if (y < AXIS + 6 || y > height - 6) continue;
    const numbered = wantsNumber(row, rows, step) && y - lastRowLabel >= 14;
    const mid = (row + 1) % 5 === 0;
    if (!numbered && !mid && view.scale < 6) continue;
    const len = numbered ? 7 : mid ? 5 : 3;
    ctx.strokeStyle = numbered ? '#6A4636' : mid ? 'rgba(106,70,54,0.45)' : 'rgba(106,70,54,0.22)';
    ctx.beginPath();
    ctx.moveTo(AXIS - len, Math.round(y) + 0.5);
    ctx.lineTo(AXIS - 1, Math.round(y) + 0.5);
    ctx.stroke();
    if (numbered) {
      ctx.fillStyle = '#6A4636';
      ctx.fillText(String(row + 1), AXIS - 9, y);
      lastRowLabel = y;
    }
  }
}
