import type { Crop } from '../types';

export type AspectId = 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

export const ASPECTS: { id: AspectId; label: string; value: number | null }[] = [
  { id: 'free', label: '自由', value: null },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '3:4', label: '3:4', value: 3 / 4 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '9:16', label: '9:16', value: 9 / 16 },
];

const MIN = 0.12;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function normRatio(aspect: number, imageW: number, imageH: number) {
  return (aspect * imageH) / Math.max(1, imageW);
}

export function cropForAspect(imageW: number, imageH: number, aspect: number): Crop {
  const imageAspect = imageW / Math.max(1, imageH);
  const limit = 0.96;
  let w = limit;
  let h = limit;
  if (imageAspect > aspect) {
    h = limit;
    w = (aspect / imageAspect) * h;
  } else {
    w = limit;
    h = (imageAspect / aspect) * w;
  }
  w = clamp(w, MIN, 1);
  h = clamp(h, MIN, 1);
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

export function clampCrop(crop: Crop): Crop {
  const w = clamp(crop.w, MIN, 1);
  const h = clamp(crop.h, MIN, 1);
  return { x: clamp(crop.x, 0, 1 - w), y: clamp(crop.y, 0, 1 - h), w, h };
}

export function resizeCrop(base: Crop, handle: string, dx: number, dy: number): Crop {
  let { x, y, w, h } = base;
  if (handle.includes('w')) {
    const next = clamp(x + dx, 0, x + w - MIN);
    w = w + (x - next);
    x = next;
  }
  if (handle.includes('e')) w = clamp(w + dx, MIN, 1 - x);
  if (handle.includes('n')) {
    const next = clamp(y + dy, 0, y + h - MIN);
    h = h + (y - next);
    y = next;
  }
  if (handle.includes('s')) h = clamp(h + dy, MIN, 1 - y);
  return { x, y, w, h };
}

function anchorOf(base: Crop, handle: string) {
  const right = base.x + base.w;
  const bottom = base.y + base.h;
  const cx = base.x + base.w / 2;
  const cy = base.y + base.h / 2;
  if (handle === 'n') return { x: cx, y: bottom };
  if (handle === 's') return { x: cx, y: base.y };
  if (handle === 'e') return { x: base.x, y: cy };
  if (handle === 'w') return { x: right, y: cy };
  return {
    x: handle.includes('w') ? right : base.x,
    y: handle.includes('n') ? bottom : base.y,
  };
}

function place(anchorX: number, anchorY: number, w: number, h: number, handle: string): Crop {
  let x = anchorX;
  let y = anchorY;
  if (handle.includes('w')) x = anchorX - w;
  else if (handle === 'n' || handle === 's') x = anchorX - w / 2;
  if (handle.includes('n')) y = anchorY - h;
  else if (handle === 'e' || handle === 'w') y = anchorY - h / 2;
  return { x, y, w, h };
}

function fits(crop: Crop) {
  return crop.w >= MIN - 0.001 && crop.h >= MIN - 0.001 && crop.x >= -0.001 && crop.y >= -0.001 && crop.x + crop.w <= 1.001 && crop.y + crop.h <= 1.001;
}

export function resizeLocked(base: Crop, handle: string, dx: number, dy: number, k: number): Crop {
  const free = resizeCrop(base, handle, dx, dy);
  const anchor = anchorOf(base, handle);
  let w = free.w;
  let h = free.h;
  if (handle === 'n' || handle === 's') w = h * k;
  else if (handle === 'e' || handle === 'w') h = w / k;
  else if (Math.abs(dx) >= Math.abs(dy)) h = w / k;
  else w = h * k;
  let next = place(anchor.x, anchor.y, w, h, handle);
  if (!fits(next)) {
    const roomW = handle.includes('w') ? anchor.x : handle === 'n' || handle === 's' ? Math.min(anchor.x, 1 - anchor.x) * 2 : 1 - anchor.x;
    const roomH = handle.includes('n') ? anchor.y : handle === 'e' || handle === 'w' ? Math.min(anchor.y, 1 - anchor.y) * 2 : 1 - anchor.y;
    w = Math.min(w, Math.max(MIN, roomW));
    h = w / k;
    if (h > roomH) {
      h = Math.max(MIN, roomH);
      w = h * k;
    }
    next = place(anchor.x, anchor.y, w, h, handle);
  }
  return fits(next) ? next : base;
}
