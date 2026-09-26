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
  onChange: (crop: Crop) => void;
};

function fitBox(width: number, height: number, imageW: number, imageH: number) {
  const scale = Math.min(width / imageW, height / imageH);
  const dw = imageW * scale;
  const dh = imageH * scale;
  return { ox: (width - dw) / 2, oy: (height - dh) / 2, dw, dh };
}

export function CropStage({ image, crop, aspect, onChange }: Props) {
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
      ctx.imageSmoothingEnabled = true;
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

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [image, crop]);

  const geometry = () => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { rect, fit: fitBox(rect.width, rect.height, image.width, image.height) };
  };

  return (
    <div
      className="crop-stage"
      ref={wrapRef}
      onPointerDown={(event) => {
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
    </div>
  );
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
