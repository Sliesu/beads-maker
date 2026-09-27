import { textOn } from './color';
import { drawPattern } from './draw';
import { summarize } from './process';
import type { Bead } from '../types';

export type PatternExport = {
  cells: Int16Array;
  cols: number;
  rows: number;
  palette: Bead[];
  title: string;
  fileName?: string;
  brand?: string;
  showCode: boolean;
  showGrid: boolean;
  showLegend: boolean;
  showAxis?: boolean;
  block?: 0 | 5 | 10;
  cell: number;
};

export type ListOptions = {
  group: boolean;
  hex: boolean;
  sort: 'count' | 'code';
};

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|\n\r]/g, '').trim().slice(0, 40);
}

function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function legendLayout(count: number, width: number, colWidth = 168) {
  const cols = Math.max(1, Math.floor(width / colWidth));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

export async function downloadPng(opts: PatternExport) {
  await document.fonts.load('700 16px "Zen Maru Gothic"');
  await document.fonts.load('28px "ZCOOL KuaiLe"');
  const { cells, cols, rows, palette, cell, showCode, showGrid, showLegend, title } = opts;
  const stats = summarize(cells, palette);
  const pad = 28;
  const gridW = cols * cell;
  const legend = showLegend ? legendLayout(stats.items.length, gridW) : { cols: 1, rows: 0 };
  const width = pad * 2 + gridW;
  const height = pad + 62 + rows * cell + (legend.rows ? 18 + legend.rows * 36 : 0) + pad;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('导出失败');
  ctx.fillStyle = '#FFF6EC';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#6A4636';
  ctx.font = '28px "ZCOOL KuaiLe", sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('豆豆丸图纸', pad, pad);
  ctx.font = '14px "Zen Maru Gothic", sans-serif';
  ctx.fillStyle = '#8C6858';
  ctx.fillText(`${title} · ${cols}×${rows} · ${stats.total} 颗`, pad, pad + 34);
  ctx.save();
  ctx.translate(pad, pad + 62);
  drawPattern(ctx, { cells, cols, rows, palette, cell, style: 'square', focus: null, showCode, showGrid });
  ctx.restore();
  if (showLegend) {
    let i = 0;
    const top = pad + 62 + rows * cell + 16;
    for (const item of stats.items) {
      const lx = pad + (i % legend.cols) * 168;
      const ly = top + Math.floor(i / legend.cols) * 36;
      ctx.fillStyle = item.bead.hex;
      ctx.beginPath();
      ctx.arc(lx + 12, ly + 12, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6A4636';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#6A4636';
      ctx.font = '700 14px "Zen Maru Gothic", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${item.bead.code}  ${item.count}`, lx + 28, ly + 12);
      i++;
    }
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('导出失败');
  download(blob, `豆豆丸-${cols}x${rows}.png`);
}

function esc(value: string) {
  return value.replace(/[&<>]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'));
}

function gridLines(x0: number, y0: number, cols: number, rows: number, cell: number, step: number) {
  const d: string[] = [];
  const x1 = x0 + cols * cell;
  const y1 = y0 + rows * cell;
  for (let col = 0; col <= cols; col += step) {
    d.push(`M${x0 + col * cell} ${y0}V${y1}`);
  }
  for (let row = 0; row <= rows; row += step) {
    d.push(`M${x0} ${y0 + row * cell}H${x1}`);
  }
  return d.join('');
}

function majorLines(ox: number, oy: number, cols: number, rows: number, cell: number, step: number, gutter: number) {
  const x0 = ox - gutter;
  const y0 = oy - gutter;
  const x1 = ox + cols * cell;
  const y1 = oy + rows * cell;
  const d = [`M${x0} ${y0}H${x1}V${y1}H${x0}Z`];
  for (let col = 0; col <= cols; col += step) {
    const x = ox + col * cell;
    if (x <= x0 || x >= x1) continue;
    d.push(`M${x} ${y0}V${y1}`);
  }
  for (let row = 0; row <= rows; row += step) {
    const y = oy + row * cell;
    if (y <= y0 || y >= y1) continue;
    d.push(`M${x0} ${y}H${x1}`);
  }
  return d.join('');
}

function buildSheet(opts: PatternExport) {
  const { cells, cols, rows, palette, cell, showCode, showGrid, showLegend } = opts;
  const showAxis = opts.showAxis ?? false;
  const block = opts.block ?? 0;
  const stats = summarize(cells, palette);
  const pad = 28;
  const gutter = showAxis ? cell : 0;
  const major = showGrid ? (block === 10 ? 10 : 5) : 0;
  const gridW = cols * cell;
  const boardW = gutter + gridW;
  const piece = safeName(opts.fileName ?? '');
  const heading = piece ? `${piece}拼豆设计图` : '拼豆设计图';
  const brand = opts.brand || opts.title;
  const titleSize = heading.length > 18 ? 34 : 46;
  const legendCol = 148;
  const legend = showLegend ? legendLayout(stats.items.length, Math.max(boardW, legendCol), legendCol) : { cols: 1, rows: 0 };
  const legendH = legend.rows ? 20 + legend.rows * 34 : 0;
  const headerH = 140;
  const foot = 72;
  const width = pad * 2 + Math.max(boardW, legend.cols * legendCol, heading.length * titleSize * 0.95, 360);
  const height = pad + headerH + gutter + rows * cell + legendH + foot;
  const cx = width / 2;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#FFF6EC"/>`,
    `<text x="${cx}" y="${pad + 52}" text-anchor="middle" font-family="PingFang SC, Hiragino Sans GB, sans-serif" font-size="${titleSize}" font-weight="700" style="font-weight:700" fill="#6A4636">${esc(heading)}</text>`,
    `<text x="${cx}" y="${pad + 86}" text-anchor="middle" font-family="PingFang SC, Hiragino Sans GB, sans-serif" font-size="16" fill="#8C6858">${esc(brand)}</text>`,
    `<text x="${cx}" y="${pad + 112}" text-anchor="middle" font-family="PingFang SC, Hiragino Sans GB, sans-serif" font-size="16" fill="#6A4636">${stats.total} 颗</text>`,
  ];
  const ox = pad + Math.max(0, (width - pad * 2 - boardW) / 2) + gutter;
  const oy = pad + headerH + gutter;
  const boardX = ox - gutter;
  const boardY = oy - gutter;
  parts.push(`<rect x="${boardX}" y="${boardY}" width="${gutter + gridW}" height="${gutter + rows * cell}" fill="#FFFFFF"/>`);
  if (showAxis) {
    for (let col = 0; col < cols; col++) {
      if (Math.floor(col / 5) % 2 === 0) continue;
      parts.push(`<rect x="${ox + col * cell}" y="${boardY}" width="${cell}" height="${cell}" fill="#EEEEEE"/>`);
    }
    for (let row = 0; row < rows; row++) {
      if (Math.floor(row / 5) % 2 === 0) continue;
      parts.push(`<rect x="${boardX}" y="${oy + row * cell}" width="${cell}" height="${cell}" fill="#EEEEEE"/>`);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = cells[row * cols + col];
      const x = ox + col * cell;
      const y = oy + row * cell;
      if (index < 0 || !palette[index]) continue;
      const bead = palette[index];
      parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${bead.hex}"/>`);
      if (showCode && cell >= 14) {
        parts.push(
          `<text x="${x + cell / 2}" y="${y + cell / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.max(8, Math.floor(cell * 0.32))}" font-family="sans-serif" fill="${textOn(bead.hex)}">${esc(bead.code)}</text>`,
        );
      }
    }
  }
  if (showGrid) {
    const span = gutter ? 1 : 0;
    parts.push(
      `<path d="${gridLines(boardX, boardY, cols + span, rows + span, cell, 1)}" fill="none" stroke="#E2E2E2" stroke-width="1" shape-rendering="crispEdges"/>`,
    );
  }
  if (major) {
    parts.push(
      `<path d="${majorLines(ox, oy, cols, rows, cell, major, gutter)}" fill="none" stroke="#F07070" stroke-width="1.6" shape-rendering="crispEdges"/>`,
    );
  }
  if (showAxis) {
    const numSize = (n: number) => (n >= 100 ? Math.max(6, Math.floor(cell * 0.36)) : Math.max(7, Math.floor(cell * 0.46)));
    for (let col = 0; col < cols; col++) {
      const n = col + 1;
      parts.push(
        `<text x="${ox + col * cell + cell / 2}" y="${boardY + cell / 2}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${numSize(n)}" fill="#A3A3A3">${n}</text>`,
      );
    }
    for (let row = 0; row < rows; row++) {
      const n = row + 1;
      parts.push(
        `<text x="${boardX + cell / 2}" y="${oy + row * cell + cell / 2}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${numSize(n)}" fill="#A3A3A3">${n}</text>`,
      );
    }
  }
  if (showLegend) {
    stats.items.forEach((item, i) => {
      const row = Math.floor(i / legend.cols);
      const col = i % legend.cols;
      const rowCount = Math.min(legend.cols, stats.items.length - row * legend.cols);
      const lx = (width - rowCount * legendCol) / 2 + col * legendCol;
      const ly = oy + rows * cell + 20 + row * 32;
      parts.push(`<circle cx="${lx + 10}" cy="${ly + 8}" r="8" fill="${item.bead.hex}" stroke="#6A4636"/>`);
      parts.push(
        `<text x="${lx + 24}" y="${ly + 12}" font-family="PingFang SC, Hiragino Sans GB, sans-serif" font-size="13" fill="#6A4636">${esc(item.bead.code)}  ${item.count}颗</text>`,
      );
    });
  }
  const site = 'https://sliesu.github.io/beads-maker';
  parts.push(
    `<a href="${site}" target="_blank">`,
    `<text x="${width - pad}" y="${height - pad - 22}" text-anchor="end" font-family="PingFang SC, Hiragino Sans GB, sans-serif" font-size="15" font-weight="700" fill="#6A4636">使用 豆叽制作</text>`,
    `<text x="${width - pad}" y="${height - pad - 4}" text-anchor="end" font-family="PingFang SC, Hiragino Sans GB, sans-serif" font-size="12" fill="#C46B7A" text-decoration="underline">${site}</text>`,
    `</a>`,
  );
  parts.push('</svg>');
  return { svg: parts.join(''), width, height, heading };
}

export async function downloadSheetPng(opts: PatternExport) {
  const { svg, width, height, heading } = buildSheet(opts);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('图纸没能画出来'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('导出失败');
    ctx.drawImage(img, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('导出失败');
    download(png, `${heading}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadCsv(opts: PatternExport, list: ListOptions = { group: false, hex: true, sort: 'count' }, groupOf?: Map<string, string>, order: string[] = []) {
  const stats = summarize(opts.cells, opts.palette);
  const rank = new Map(order.map((group, index) => [group, index]));
  const groupName = (code: string) => groupOf?.get(code) ?? '其他';
  const items = [...stats.items].sort((a, b) => {
    if (list.group) {
      const ga = rank.get(groupName(a.bead.code)) ?? 999;
      const gb = rank.get(groupName(b.bead.code)) ?? 999;
      if (ga !== gb) return ga - gb;
    }
    if (list.sort === 'code') return a.bead.code.localeCompare(b.bead.code, 'en', { numeric: true });
    return b.count - a.count || a.bead.code.localeCompare(b.bead.code, 'en', { numeric: true });
  });
  const heads = [...(list.group ? ['色系'] : []), '色号', ...(list.hex ? ['HEX'] : []), '颗数'];
  const lines = [`\uFEFF${heads.join(',')}`];
  for (const item of items) {
    const cells = [...(list.group ? [groupName(item.bead.code)] : []), item.bead.code, ...(list.hex ? [item.bead.hex] : []), String(item.count)];
    lines.push(cells.join(','));
  }
  lines.push(`${list.group ? ',' : ''}合计,${list.hex ? ',' : ''}${stats.total}`);
  const named = safeName(opts.fileName ?? '');
  download(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `${named ? `${named}拼豆采购清单` : '拼豆采购清单'}.csv`);
}

export function listText(opts: PatternExport) {
  const stats = summarize(opts.cells, opts.palette);
  const lines = [`豆豆丸采购清单`, `${opts.title} · ${opts.cols}×${opts.rows}`, `共 ${stats.total} 颗`, ''];
  for (const item of stats.items) lines.push(`${item.bead.code}  ${item.count}`);
  return lines.join('\n');
}
