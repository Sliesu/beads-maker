import { useEffect, useRef, useState } from 'react';
import { getVariant, SYSTEMS, getSystem } from '../data/palettes';
import { cmOf } from '../lib/color';
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

function fitBox(width: number, height: number, imageW: number, imageH: number) {
  const scale = Math.min(width / imageW, height / imageH);
  const dw = imageW * scale;
  const dh = imageH * scale;
  return { ox: (width - dw) / 2, oy: (height - dh) / 2, dw, dh };
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function Setup(props: Props) {
  const [book, setBook] = useState(false);
  const [usedOpen, setUsedOpen] = useState(false);
  const [used, setUsed] = useState<Swatch[] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aspect = (props.image.width * props.crop.w) / Math.max(1, props.image.height * props.crop.h);
  const grid = fitGrid(props.longSide, aspect);
  const system = getSystem(props.systemId);

  useEffect(() => {
    let cancel = false;
    const timer = window.setTimeout(() => {
      const variant = getVariant(props.systemId, props.variantId);
      const palette = makePalette(variant.colors, loadPref(props.systemId, variant.id));
      if (palette.length < 2) {
        if (!cancel) setUsed([]);
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
      const list = summarize(cells, palette).items
        .map((item) => byCode.get(item.bead.code) ?? { code: item.bead.code, hex: item.bead.hex, group: '自定义' })
        .sort((a, b) => (order.get(a.code) ?? 9999) - (order.get(b.code) ?? 9999) || a.code.localeCompare(b.code, 'en'));
      if (!cancel) setUsed(list);
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
    const boardCtx = board.getContext('2d');
    if (!boardCtx) return;

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sw = Math.max(1, props.crop.w * props.image.width);
      const sh = Math.max(1, props.crop.h * props.image.height);
      const fit = fitBox(rect.width, rect.height, sw, sh);
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
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(board, fit.ox, fit.oy, fit.dw, fit.dh);
      ctx.restore();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    return () => observer.disconnect();
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
          共使用到 {used ? used.length : '…'} 色
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
      {usedOpen && <UsedColorsSheet colors={used} onClose={() => setUsedOpen(false)} />}
    </section>
  );
}
