import { useEffect, useRef, useState } from 'react';
import { getVariant, SYSTEMS, getSystem } from '../data/palettes';
import { cmOf } from '../lib/color';
import { AXIS, drawRuler, fitBoard, holdBoard, zoomBoard, type BoardView } from '../lib/gridBoard';
import { rasterFromBitmap } from '../lib/image';
import { fitGrid, generatePattern, makePalette, summarize } from '../lib/process';
import { loadPref } from '../lib/storage';
import type { Crop, Swatch } from '../types';
import { UsedColorsSheet } from './Sheets';
import { SwatchBook } from './SwatchBook';

type Props = {
  image: ImageBitmap;
  crop: Crop;
  longSide: number;
  systemId: string;
  variantId: string;
  merge: number;
  denoise: number;
  hasProject: boolean;
  onLongSide: (value: number) => void;
  onSystem: (id: string) => void;
  onVariant: (id: string) => void;
  onMerge: (value: number) => void;
  onDenoise: (value: number) => void;
  onBack: () => void;
  onGenerate: () => void;
};

const SIZES = [32, 48, 64, 96, 128, 192, 256];
const MERGE = [
  { id: 0, label: '关' },
  { id: 8, label: '轻' },
  { id: 14, label: '强' },
];
const NOISE = [
  { id: 0, label: '关' },
  { id: 1, label: '轻' },
  { id: 2, label: '强' },
];

export function Setup(props: Props) {
  const [book, setBook] = useState(false);
  const [usedOpen, setUsedOpen] = useState(false);
  const [used, setUsed] = useState<{ colors: Swatch[]; beads: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  const viewKey = useRef('');
  const aspect = (props.image.width * props.crop.w) / Math.max(1, props.image.height * props.crop.h);
  const grid = fitGrid(props.longSide, aspect);
  const system = getSystem(props.systemId);

  useEffect(() => {
    let cancel = false;
    const timer = window.setTimeout(() => {
      const variant = getVariant(props.systemId, props.variantId);
      const palette = makePalette(variant.colors, loadPref(props.systemId, variant.id));
      if (palette.length < 2) {
        if (!cancel) setUsed({ colors: [], beads: 0 });
        return;
      }
      const aspect = (props.image.width * props.crop.w) / Math.max(1, props.image.height * props.crop.h);
      const { cols, rows } = fitGrid(props.longSide, aspect);
      const raster = rasterFromBitmap(props.image, props.crop, 720);
      const cells = generatePattern(raster, palette, {
        cols,
        rows,
        pooling: 'average',
        mergeDelta: props.merge,
        denoise: props.denoise,
      });
      const order = new Map(variant.colors.map((item, index) => [item.code, index]));
      const byCode = new Map(variant.colors.map((item) => [item.code, item]));
      const stats = summarize(cells, palette);
      const colors = stats.items
        .map((item) => byCode.get(item.bead.code) ?? { code: item.bead.code, hex: item.bead.hex, group: '自定义' })
        .sort((a, b) => (order.get(a.code) ?? 9999) - (order.get(b.code) ?? 9999) || a.code.localeCompare(b.code, 'en'));
      if (!cancel) setUsed({ colors, beads: stats.total });
    }, 60);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [props.image, props.crop, props.longSide, props.systemId, props.variantId, props.merge, props.denoise]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const board = document.createElement('canvas');
    const boardCtx = board.getContext('2d', { willReadFrequently: true });
    if (!boardCtx) return;

    const sw = Math.max(1, props.crop.w * props.image.width);
    const sh = Math.max(1, props.crop.h * props.image.height);
    board.width = grid.cols;
    board.height = grid.rows;
    boardCtx.imageSmoothingEnabled = true;
    boardCtx.drawImage(
      props.image,
      props.crop.x * props.image.width,
      props.crop.y * props.image.height,
      sw,
      sh,
      0,
      0,
      grid.cols,
      grid.rows,
    );

    const paint = () => {
      const rect = wrap.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width < 8 || height < 8) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.max(1, Math.floor(width * dpr));
      const bh = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const key = `${grid.cols}x${grid.rows}`;
      if (!viewRef.current || viewKey.current !== key) {
        viewRef.current = fitBoard(width, height, grid.cols, grid.rows);
        viewKey.current = key;
      } else {
        viewRef.current = holdBoard(viewRef.current, width, height, grid.cols, grid.rows);
      }
      const view = viewRef.current;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(AXIS, AXIS, width - AXIS, height - AXIS);
      ctx.clip();
      ctx.fillStyle = '#F7F1EA';
      ctx.fillRect(view.tx, view.ty, grid.cols * view.scale, grid.rows * view.scale);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(board, view.tx, view.ty, grid.cols * view.scale, grid.rows * view.scale);
      if (view.scale >= 3) {
        const c0 = Math.max(0, Math.floor((AXIS - view.tx) / view.scale));
        const c1 = Math.min(grid.cols, Math.ceil((width - view.tx) / view.scale));
        const r0 = Math.max(0, Math.floor((AXIS - view.ty) / view.scale));
        const r1 = Math.min(grid.rows, Math.ceil((height - view.ty) / view.scale));
        ctx.beginPath();
        for (let col = c0; col <= c1; col++) {
          const x = Math.round(view.tx + col * view.scale) + 0.5;
          ctx.moveTo(x, Math.max(AXIS, view.ty));
          ctx.lineTo(x, Math.min(height, view.ty + grid.rows * view.scale));
        }
        for (let row = r0; row <= r1; row++) {
          const y = Math.round(view.ty + row * view.scale) + 0.5;
          ctx.moveTo(Math.max(AXIS, view.tx), y);
          ctx.lineTo(Math.min(width, view.tx + grid.cols * view.scale), y);
        }
        ctx.strokeStyle = 'rgba(90,58,46,0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
      drawRuler(ctx, view, width, height, grid.cols, grid.rows);
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let pan: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
    let pinch: { dist: number; view: BoardView; mx: number; my: number } | null = null;
    const local = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, local(event));
      if (pointers.size >= 2 && viewRef.current) {
        const [a, b] = [...pointers.values()];
        pinch = {
          dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          view: { ...viewRef.current },
          mx: (a.x + b.x) / 2,
          my: (a.y + b.y) / 2,
        };
        pan = null;
        return;
      }
      if (!viewRef.current) return;
      pan = { ...local(event), tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false };
    };
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId) || !viewRef.current) return;
      pointers.set(event.pointerId, local(event));
      const rect = canvas.getBoundingClientRect();
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const zoomed = zoomBoard(pinch.view, pinch.mx, pinch.my, dist / pinch.dist, rect.width, rect.height, grid.cols, grid.rows);
        const wx = (pinch.mx - pinch.view.tx) / pinch.view.scale;
        const wy = (pinch.my - pinch.view.ty) / pinch.view.scale;
        viewRef.current = holdBoard(
          { scale: zoomed.scale, tx: mx - wx * zoomed.scale, ty: my - wy * zoomed.scale },
          rect.width,
          rect.height,
          grid.cols,
          grid.rows,
        );
        paint();
        return;
      }
      if (!pan) return;
      const point = local(event);
      const dx = point.x - pan.x;
      const dy = point.y - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 10) return;
      pan.moved = true;
      viewRef.current = holdBoard(
        { scale: viewRef.current.scale, tx: pan.tx + dx, ty: pan.ty + dy },
        rect.width,
        rect.height,
        grid.cols,
        grid.rows,
      );
      paint();
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) pan = null;
    };
    const onWheel = (event: WheelEvent) => {
      if (!viewRef.current) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      viewRef.current = zoomBoard(
        viewRef.current,
        event.clientX - rect.left,
        event.clientY - rect.top,
        event.deltaY < 0 ? 1.08 : 1 / 1.08,
        rect.width,
        rect.height,
        grid.cols,
        grid.rows,
      );
      paint();
    };
    const onDouble = (event: MouseEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      viewRef.current = fitBoard(rect.width, rect.height, grid.cols, grid.rows);
      paint();
    };

    paint();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDouble);
    const observer = new ResizeObserver(paint);
    observer.observe(wrap);
    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDouble);
    };
  }, [props.image, props.crop, grid.cols, grid.rows]);

  return (
    <section className="screen">
      <header className="topbar">
        <button className="text-btn" onClick={props.onBack}>
          返回
        </button>
        <strong>尺寸和色号</strong>
        <button className="text-btn" onClick={() => setBook(true)}>
          色卡
        </button>
      </header>
      <div className="screen-body setup-body">
        <div className="setup-preview" ref={wrapRef}>
          <canvas ref={canvasRef} />
        </div>
        <p className="field-label">像素度</p>
        <div className="chip-row scroll">
          {SIZES.map((size) => (
            <button key={size} className={props.longSide === size ? 'chip on' : 'chip'} onClick={() => props.onLongSide(size)}>
              {size}
            </button>
          ))}
        </div>
        <div className="stepper">
          <button onClick={() => props.onLongSide(props.longSide - 2)} aria-label="少两颗">
            −
          </button>
          <span className="stepper-readout">
            <strong className="num">
              {grid.cols} × {grid.rows}
            </strong>
            <span>
              大约 {cmOf(grid.cols).toFixed(1)} × {cmOf(grid.rows).toFixed(1)} cm
            </span>
          </span>
          <button onClick={() => props.onLongSide(props.longSide + 2)} aria-label="多两颗">
            +
          </button>
        </div>
        <p className="field-label">色号</p>
        <div className="chip-row scroll">
          {SYSTEMS.map((item) => (
            <button key={item.id} className={props.systemId === item.id ? 'chip on' : 'chip'} onClick={() => props.onSystem(item.id)}>
              {item.name}
            </button>
          ))}
        </div>
        {system.variants.length > 1 && (
          <div className="chip-row">
            {system.variants.map((item) => (
              <button
                key={item.id}
                className={props.variantId === item.id ? 'chip on' : 'chip'}
                onClick={() => props.onVariant(item.id)}
              >
                {item.label} 色
              </button>
            ))}
          </div>
        )}
        <button className="text-btn left" onClick={() => setUsedOpen(true)}>
          共使用到 {used ? used.colors.length : '…'} 色{used ? ` · 约 ${used.beads} 颗` : ''}
        </button>
        <label className="field">
          <span>相近色合并</span>
          <span className="seg">
            {MERGE.map((item) => (
              <button key={item.id} className={props.merge === item.id ? 'on' : ''} onClick={() => props.onMerge(item.id)}>
                {item.label}
              </button>
            ))}
          </span>
        </label>
        <label className="field">
          <span>清理杂点</span>
          <span className="seg">
            {NOISE.map((item) => (
              <button key={item.id} className={props.denoise === item.id ? 'on' : ''} onClick={() => props.onDenoise(item.id)}>
                {item.label}
              </button>
            ))}
          </span>
        </label>
      </div>
      <div className="screen-foot">
        <button className="btn btn-primary btn-block" onClick={props.onGenerate}>
          {props.hasProject ? '重新生成图纸' : '生成图纸'}
        </button>
      </div>
      {book && <SwatchBook systemId={props.systemId} variantId={props.variantId} onBack={() => setBook(false)} />}
      {usedOpen && <UsedColorsSheet colors={used?.colors ?? null} onClose={() => setUsedOpen(false)} />}
    </section>
  );
}
