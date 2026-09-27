import { useEffect, useRef } from 'react';
import { clampCrop, normRatio, resizeCrop, resizeLocked } from '../lib/crop';
import type { Crop } from '../types';

type Drag =
  | { kind: 'move'; sx: number; sy: number; crop: Crop }
  | { kind: 'resize'; handle: string; sx: number; sy: number; crop: Crop };

type Props = {
  image: ImageBitmap;
  crop: Crop;
  aspect: number | null;
  generating?: boolean;
  sharp?: boolean;
  onChange: (crop: Crop) => void;
};

function fitBox(width: number, height: number, imageW: number, imageH: number) {
  const scale = Math.min(width / imageW, height / imageH);
  const dw = imageW * scale;
  const dh = imageH * scale;
  return { ox: (width - dw) / 2, oy: (height - dh) / 2, dw, dh };
}

export function CropStage({ image, crop, aspect, generating = false, sharp = false, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const cropRef = useRef(crop);
  cropRef.current = crop;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fit = fitBox(rect.width, rect.height, image.width, image.height);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#F6E4D4';
      round(ctx, fit.ox, fit.oy, fit.dw, fit.dh, 18);
      ctx.fill();
      ctx.save();
      round(ctx, fit.ox, fit.oy, fit.dw, fit.dh, 18);
      ctx.clip();
      const tile = 12;
      for (let y = fit.oy; y < fit.oy + fit.dh; y += tile) {
        for (let x = fit.ox; x < fit.ox + fit.dw; x += tile) {
          const on = (Math.floor((x - fit.ox) / tile) + Math.floor((y - fit.oy) / tile)) % 2 === 0;
          ctx.fillStyle = on ? '#FFFFFF' : '#E8C4B4';
          ctx.fillRect(x, y, tile, tile);
        }
      }
      ctx.imageSmoothingEnabled = !sharp;
      ctx.drawImage(image, fit.ox, fit.oy, fit.dw, fit.dh);
      ctx.restore();
      const box = screenBox(fit, cropRef.current);
      ctx.fillStyle = 'rgba(92,64,51,0.28)';
      ctx.beginPath();
      ctx.rect(fit.ox, fit.oy, fit.dw, fit.dh);
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#6A4636';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.fillStyle = '#FFFDF8';
      for (const point of handles(box)) {
        round(ctx, point.x - 7, point.y - 7, 14, 14, 4);
        ctx.fill();
        ctx.stroke();
      }
    };

    if (!generating) {
      draw();
      const observer = new ResizeObserver(draw);
      observer.observe(wrap);
      return () => observer.disconnect();
    }

    const beads = sampleBeads(image);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let frameId = 0;

    const drawGenerating = (now: number) => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fit = fitBox(rect.width, rect.height, image.width, image.height);
      const t = now - start;
      const enter = still ? 1 : easeOut(Math.min(1, t / ENTER_MS));
      const sweep = -SWEEP_BAND + easeInOut((t % SWEEP_MS) / SWEEP_MS) * (1 + SWEEP_BAND * 2);
      const cw = fit.dw / beads.cols;
      const ch = fit.dh / beads.rows;
      const outer = Math.min(cw, ch) * 0.46;

      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.save();
      round(ctx, fit.ox, fit.oy, fit.dw, fit.dh, 18);
      ctx.clip();
      ctx.fillStyle = '#FBF4EC';
      ctx.fillRect(fit.ox, fit.oy, fit.dw, fit.dh);

      for (const bead of beads.list) {
        const k = still ? 0.6 : smooth(1 - Math.abs(bead.u - sweep) / SWEEP_BAND);
        const r = outer * (0.84 + 0.16 * k);
        const cx = fit.ox + (bead.c + 0.5) * cw;
        const cy = fit.oy + (bead.r + 0.5) * ch;
        ctx.globalAlpha = (0.38 + 0.62 * k) * enter;
        ctx.strokeStyle = bead.color;
        ctx.lineWidth = r * 0.62;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.69, 0, Math.PI * 2);
        ctx.stroke();
        if (k > 0.08) {
          ctx.globalAlpha = 0.55 * k * enter;
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = Math.max(0.8, r * 0.16);
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.78, Math.PI * 1.1, Math.PI * 1.45);
          ctx.stroke();
        }
      }

      if (enter < 1) {
        ctx.globalAlpha = 1 - enter;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(image, fit.ox, fit.oy, fit.dw, fit.dh);
      }
      ctx.restore();
    };

    const loop = (now: number) => {
      drawGenerating(now);
      if (!still) frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    const observer = new ResizeObserver(() => drawGenerating(performance.now()));
    observer.observe(wrap);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [image, crop, generating, sharp]);

  const geometry = () => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { rect, fit: fitBox(rect.width, rect.height, image.width, image.height) };
  };

  return (
    <div
      className={generating ? 'crop-stage generating' : 'crop-stage'}
      ref={wrapRef}
      onPointerDown={(event) => {
        if (generating) return;
        const { rect, fit } = geometry();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const box = screenBox(fit, cropRef.current);
        const handle = hitHandle(x, y, box);
        event.currentTarget.setPointerCapture(event.pointerId);
        if (handle) drag.current = { kind: 'resize', handle, sx: x, sy: y, crop: { ...cropRef.current } };
        else if (x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h) {
          drag.current = { kind: 'move', sx: x, sy: y, crop: { ...cropRef.current } };
        }
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        const { rect, fit } = geometry();
        const dx = (event.clientX - rect.left - current.sx) / fit.dw;
        const dy = (event.clientY - rect.top - current.sy) / fit.dh;
        if (current.kind === 'move') {
          onChange(clampCrop({ ...current.crop, x: current.crop.x + dx, y: current.crop.y + dy }));
          return;
        }
        if (aspect) onChange(resizeLocked(current.crop, current.handle, dx, dy, normRatio(aspect, image.width, image.height)));
        else onChange(resizeCrop(current.crop, current.handle, dx, dy));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      <canvas ref={canvasRef} />
      {generating && (
        <p className="gen-caption">
          图片创作中
          <span className="gen-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
      )}
    </div>
  );
}

const BEAD_COLS = 40;
const ENTER_MS = 700;
const SWEEP_MS = 2600;
const SWEEP_BAND = 0.2;

function sampleBeads(image: ImageBitmap) {
  const cols = BEAD_COLS;
  const rows = Math.max(8, Math.round((cols * image.height) / Math.max(image.width, 1)));
  const board = document.createElement('canvas');
  board.width = cols;
  board.height = rows;
  const boardCtx = board.getContext('2d', { willReadFrequently: true });
  const list: { c: number; r: number; u: number; color: string }[] = [];
  if (!boardCtx) return { cols, rows, list };
  boardCtx.imageSmoothingEnabled = true;
  boardCtx.drawImage(image, 0, 0, cols, rows);
  const data = boardCtx.getImageData(0, 0, cols, rows).data;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      if (data[i + 3] < 24) continue;
      const jitter = (Math.sin(c * 12.9898 + r * 78.233) * 43758.5453) % 1;
      const u = (c / (cols - 1) + r / (rows - 1)) / 2 + jitter * 0.03;
      list.push({ c, r, u, color: `rgb(${data[i]},${data[i + 1]},${data[i + 2]})` });
    }
  }
  return { cols, rows, list };
}

function smooth(v: number) {
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
}

function easeOut(v: number) {
  return 1 - (1 - v) ** 3;
}

function easeInOut(v: number) {
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
}

function screenBox(fit: { ox: number; oy: number; dw: number; dh: number }, crop: Crop) {
  return { x: fit.ox + crop.x * fit.dw, y: fit.oy + crop.y * fit.dh, w: crop.w * fit.dw, h: crop.h * fit.dh };
}

function handles(box: { x: number; y: number; w: number; h: number }) {
  const { x, y, w, h } = box;
  return [
    { id: 'nw', x, y },
    { id: 'n', x: x + w / 2, y },
    { id: 'ne', x: x + w, y },
    { id: 'e', x: x + w, y: y + h / 2 },
    { id: 'se', x: x + w, y: y + h },
    { id: 's', x: x + w / 2, y: y + h },
    { id: 'sw', x, y: y + h },
    { id: 'w', x, y: y + h / 2 },
  ];
}

function hitHandle(x: number, y: number, box: { x: number; y: number; w: number; h: number }) {
  for (const point of handles(box)) {
    if (Math.hypot(point.x - x, point.y - y) <= 20) return point.id;
  }
  return '';
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
