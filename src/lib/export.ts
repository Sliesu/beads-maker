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
  showCode: boolean;
  showGrid: boolean;
  showLegend: boolean;
  cell: number;
};

function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function legendLayout(count: number, width: number) {
  const cols = Math.max(1, Math.floor(width / 168));
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

export function downloadSvg(opts: PatternExport) {
  const { cells, cols, rows, palette, cell, showCode, showGrid, showLegend, title } = opts;
  const stats = summarize(cells, palette);
  const pad = 24;
  const gridW = cols * cell;
  const legend = showLegend ? legendLayout(stats.items.length, gridW) : { cols: 1, rows: 0 };
  const width = pad * 2 + gridW;
  const height = pad + 56 + rows * cell + (legend.rows ? 16 + legend.rows * 32 : 0) + pad;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#FFF6EC"/>`,
    `<text x="${pad}" y="${pad + 22}" font-family="sans-serif" font-size="22" fill="#6A4636">${esc(title)}</text>`,
    `<text x="${pad}" y="${pad + 44}" font-family="sans-serif" font-size="13" fill="#8C6858">${cols}×${rows} · ${stats.total} 颗</text>`,
  ];
  const ox = pad;
  const oy = pad + 56;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = cells[row * cols + col];
      const x = ox + col * cell;
      const y = oy + row * cell;
      if (index < 0 || !palette[index]) continue;
      const bead = palette[index];
      parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${bead.hex}"/>`);
      if (showGrid) parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="none" stroke="rgba(90,58,46,.4)"/>`);
      if (showCode && cell >= 14) {
        parts.push(
          `<text x="${x + cell / 2}" y="${y + cell / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.max(8, Math.floor(cell * 0.32))}" font-family="sans-serif" fill="${textOn(bead.hex)}">${esc(bead.code)}</text>`,
        );
      }
    }
  }
  if (showLegend) {
    stats.items.forEach((item, i) => {
      const lx = pad + (i % legend.cols) * 168;
      const ly = oy + rows * cell + 20 + Math.floor(i / legend.cols) * 32;
      parts.push(`<circle cx="${lx + 10}" cy="${ly + 8}" r="8" fill="${item.bead.hex}" stroke="#6A4636"/>`);
      parts.push(
        `<text x="${lx + 24}" y="${ly + 12}" font-family="sans-serif" font-size="13" fill="#6A4636">${esc(item.bead.code)}  ${item.count}</text>`,
      );
    });
  }
  parts.push('</svg>');
  download(new Blob([parts.join('')], { type: 'image/svg+xml' }), `豆豆丸-${cols}x${rows}.svg`);
}

export function downloadCsv(opts: PatternExport) {
  const stats = summarize(opts.cells, opts.palette);
  const lines = ['\uFEFF色号,HEX,颗数,品牌'];
  for (const item of stats.items) {
    lines.push(`${item.bead.code},${item.bead.hex},${item.count},${opts.title}`);
  }
  lines.push(`合计,,${stats.total},${opts.cols}x${opts.rows}`);
  download(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `豆豆丸-采购清单-${opts.cols}x${opts.rows}.csv`);
}

export function listText(opts: PatternExport) {
  const stats = summarize(opts.cells, opts.palette);
  const lines = [`豆豆丸采购清单`, `${opts.title} · ${opts.cols}×${opts.rows}`, `共 ${stats.total} 颗`, ''];
  for (const item of stats.items) lines.push(`${item.bead.code}  ${item.count}`);
  return lines.join('\n');
}
