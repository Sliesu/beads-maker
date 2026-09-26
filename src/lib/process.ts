import { deltaE2, rgbToLab, toBead } from './color';
import type { Bead, Pooling, Swatch } from '../types';
import { EMPTY } from '../types';

export type Raster = { data: Uint8ClampedArray; width: number; height: number };

export type Pref = { disabled: string[]; custom: [string, string][] };

export function makePalette(colors: Swatch[], pref: Pref): Bead[] {
  const off = new Set(pref.disabled);
  const beads = colors.filter((c) => !off.has(c.code)).map((c) => toBead(c.code, c.hex));
  for (const [code, hex] of pref.custom) {
    if (/^#[0-9A-Fa-f]{6}$/.test(hex) && code.trim()) beads.push(toBead(code.trim().slice(0, 8), hex));
  }
  return beads;
}

export function fitGrid(longSide: number, aspect: number) {
  const side = Math.max(12, Math.min(80, Math.round(longSide)));
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  if (safe >= 1) {
    const cols = side;
    const rows = Math.max(8, Math.min(80, Math.round(side / safe)));
    return { cols, rows };
  }
  const rows = side;
  const cols = Math.max(8, Math.min(80, Math.round(side * safe)));
  return { cols, rows };
}

function read(data: Uint8ClampedArray, i: number) {
  return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
}

export function removeBackground(src: Raster, threshold = 26) {
  const { data, width, height } = src;
  const out = new Uint8ClampedArray(data);
  const samples: number[][] = [];
  const stepX = Math.max(1, Math.floor(width / 20));
  const stepY = Math.max(1, Math.floor(height / 20));
  for (let x = 0; x < width; x += stepX) {
    samples.push([out[x * 4], out[x * 4 + 1], out[x * 4 + 2]]);
    const b = ((height - 1) * width + x) * 4;
    samples.push([out[b], out[b + 1], out[b + 2]]);
  }
  for (let y = 0; y < height; y += stepY) {
    const l = y * width * 4;
    const r = (y * width + width - 1) * 4;
    samples.push([out[l], out[l + 1], out[l + 2]]);
    samples.push([out[r], out[r + 1], out[r + 2]]);
  }
  const med = (ch: number) => {
    const arr = samples.map((p) => p[ch]).sort((a, b) => a - b);
    return arr[arr.length >> 1] ?? 255;
  };
  const bgLab = rgbToLab(med(0), med(1), med(2));
  const n = width * height;
  const seen = new Uint8Array(n);
  const qx = new Int32Array(n);
  const qy = new Int32Array(n);
  let qs = 0;
  let qe = 0;

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (seen[i]) return;
    seen[i] = 1;
    const o = i * 4;
    if (out[o + 3] < 20) return;
    const lab = rgbToLab(out[o], out[o + 1], out[o + 2]);
    if (Math.sqrt(deltaE2(lab, bgLab)) > threshold) return;
    qx[qe] = x;
    qy[qe] = y;
    qe++;
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  let removed = 0;
  while (qs < qe) {
    const x = qx[qs];
    const y = qy[qs];
    qs++;
    out[(y * width + x) * 4 + 3] = 0;
    removed++;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return { raster: { data: out, width, height }, removedRatio: removed / n };
}

export function stylizeFlat(src: Raster): Raster {
  const out = new Uint8ClampedArray(src.data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < 16) continue;
    for (let k = 0; k < 3; k++) {
      const c = (out[i + k] / 255 - 0.5) * 1.22 + 0.5;
      out[i + k] = Math.round(Math.min(1, Math.max(0, c)) * 255);
    }
  }
  return { data: out, width: src.width, height: src.height };
}

function nearest(r: number, g: number, b: number, palette: Bead[]) {
  const lab = rgbToLab(r, g, b);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = deltaE2(lab, palette[i].lab);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function pool(pixels: number[][], method: Pooling): [number, number, number] {
  if (method === 'center') {
    const p = pixels[pixels.length >> 1] ?? pixels[0];
    return [p[0], p[1], p[2]];
  }
  if (method === 'median') {
    const mid = (ch: number) => {
      const arr = pixels.map((p) => p[ch]).sort((a, b) => a - b);
      const m = arr.length >> 1;
      return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
    };
    return [mid(0), mid(1), mid(2)];
  }
  if (method === 'mode') {
    const map = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (const [r, g, b] of pixels) {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const item = map.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      item.n++;
      item.r += r;
      item.g += g;
      item.b += b;
      map.set(key, item);
    }
    let best: { n: number; r: number; g: number; b: number } | null = null;
    for (const item of map.values()) if (!best || item.n > best.n) best = item;
    const hit = best ?? { n: 1, r: pixels[0][0], g: pixels[0][1], b: pixels[0][2] };
    return [hit.r / hit.n, hit.g / hit.n, hit.b / hit.n];
  }
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of pixels) {
    r += p[0];
    g += p[1];
    b += p[2];
  }
  const n = pixels.length;
  return [r / n, g / n, b / n];
}

function mapCells(src: Raster, palette: Bead[], cols: number, rows: number, method: Pooling) {
  const { data, width, height } = src;
  const cells = new Int16Array(cols * rows);
  cells.fill(EMPTY);
  for (let row = 0; row < rows; row++) {
    const y0 = Math.floor((row * height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * height) / rows));
    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor((col * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * width) / cols));
      const area = (x1 - x0) * (y1 - y0);
      const stride = area > 64 ? Math.ceil(Math.sqrt(area / 64)) : 1;
      const pixels: number[][] = [];
      let total = 0;
      for (let y = y0; y < y1; y += stride) {
        for (let x = x0; x < x1; x += stride) {
          total++;
          const px = read(data, (y * width + x) * 4);
          if (px[3] < 128) continue;
          pixels.push([px[0], px[1], px[2]]);
        }
      }
      if (!pixels.length || pixels.length / Math.max(1, total) < 0.35) continue;
      const sample = method === 'center' ? centerPixel(data, width, x0, y0, x1, y1) : pixels;
      const use = sample.length ? sample : pixels;
      const [r, g, b] = pool(use, method === 'center' && sample.length ? 'center' : method);
      cells[row * cols + col] = nearest(r, g, b, palette);
    }
  }
  return cells;
}

function centerPixel(data: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number) {
  const x = Math.min(width - 1, Math.floor((x0 + x1) / 2));
  const y = Math.floor((y0 + y1) / 2);
  const px = read(data, (y * width + x) * 4);
  if (px[3] < 128) return [];
  return [[px[0], px[1], px[2]]];
}

export function mergeSimilar(cells: Int16Array, palette: Bead[], threshold: number) {
  if (threshold <= 0) return;
  const counts = new Uint32Array(palette.length);
  for (const c of cells) if (c >= 0) counts[c]++;
  const used: number[] = [];
  for (let i = 0; i < palette.length; i++) if (counts[i] > 0) used.push(i);
  used.sort((a, b) => counts[b] - counts[a]);
  const parent = new Int16Array(palette.length);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const reps: number[] = [];
  for (const i of used) {
    let host = -1;
    for (const r of reps) {
      if (Math.sqrt(deltaE2(palette[i].lab, palette[r].lab)) <= threshold) {
        host = r;
        break;
      }
    }
    if (host >= 0) parent[i] = host;
    else reps.push(i);
  }
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c >= 0) cells[i] = parent[c];
  }
}

export function denoise(cells: Int16Array, cols: number, rows: number, level: number) {
  if (level <= 0) return;
  for (let pass = 0; pass < (level > 1 ? 2 : 1); pass++) {
    const next = new Int16Array(cells);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const c = cells[i];
        if (c < 0) continue;
        const tally = new Map<number, number>();
        let same = 0;
        let colored = 0;
        let around = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            around++;
            const nc = cells[ny * cols + nx];
            if (nc < 0) continue;
            colored++;
            if (nc === c) same++;
            else tally.set(nc, (tally.get(nc) ?? 0) + 1);
          }
        }
        if (same === 0 && colored === 0 && around >= 3) {
          next[i] = EMPTY;
          continue;
        }
        if (level < 2 || same > 1) continue;
        let best = EMPTY;
        let bestN = 0;
        for (const [k, v] of tally) {
          if (v > bestN) {
            bestN = v;
            best = k;
          }
        }
        if (best >= 0 && bestN >= 4) next[i] = best;
      }
    }
    cells.set(next);
  }
}

export function generatePattern(
  src: Raster,
  palette: Bead[],
  opts: { cols: number; rows: number; pooling: Pooling; mergeDelta: number; denoise: number },
) {
  const cells = mapCells(src, palette, opts.cols, opts.rows, opts.pooling);
  mergeSimilar(cells, palette, opts.mergeDelta);
  denoise(cells, opts.cols, opts.rows, opts.denoise);
  return cells;
}

export type ColorStat = { index: number; count: number; bead: Bead };

export function summarize(cells: Int16Array, palette: Bead[]) {
  const map = new Map<number, number>();
  let total = 0;
  for (const c of cells) {
    if (c < 0 || !palette[c]) continue;
    total++;
    map.set(c, (map.get(c) ?? 0) + 1);
  }
  const items: ColorStat[] = [...map.entries()]
    .map(([index, count]) => ({ index, count, bead: palette[index] }))
    .sort((a, b) => b.count - a.count || a.bead.code.localeCompare(b.bead.code, 'en', { numeric: true }));
  return { total, items };
}

export function replaceColor(cells: Int16Array, from: number, to: number) {
  if (from === to) return;
  for (let i = 0; i < cells.length; i++) if (cells[i] === from) cells[i] = to;
}
