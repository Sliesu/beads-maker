import { textOn } from './color';
import type { Bead } from '../types';
import { EMPTY } from '../types';

export function drawPattern(
  ctx: CanvasRenderingContext2D,
  opts: {
    cells: Int16Array;
    cols: number;
    rows: number;
    palette: Bead[];
    cell: number;
    style: 'bead' | 'square';
    focus: number | null;
    showCode: boolean;
    showGrid: boolean;
  },
) {
  const { cells, cols, rows, palette, cell, style, focus, showCode, showGrid } = opts;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = cells[row * cols + col] ?? EMPTY;
      const x = col * cell;
      const y = row * cell;
      const known = index >= 0 && palette[index];
      const dim = focus !== null && index !== focus;
      ctx.save();
      ctx.globalAlpha = dim ? 0.16 : 1;
      if (!known) {
        ctx.fillStyle = 'rgba(106,70,54,0.12)';
        ctx.beginPath();
        if (style === 'bead') ctx.arc(x + cell / 2, y + cell / 2, Math.max(1.5, cell * 0.14), 0, Math.PI * 2);
        else ctx.rect(x, y, cell, cell);
        ctx.fill();
      } else {
        const bead = palette[index];
        ctx.fillStyle = bead.hex;
        if (style === 'bead') {
          const r = cell * 0.43;
          const cx = x + cell / 2;
          const cy = y + cell / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(90,58,46,0.38)';
          ctx.lineWidth = Math.max(1, cell * 0.045);
          ctx.stroke();
          if (!(showCode && cell >= 20)) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.ellipse(cx - r * 0.28, cy - r * 0.32, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.fillRect(x, y, cell, cell);
        }
        if (showGrid && style === 'square') {
          ctx.strokeStyle = 'rgba(90,58,46,0.45)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        }
        if (showCode && cell >= 14 && !dim) {
          ctx.fillStyle = textOn(bead.hex);
          const size = Math.max(7, Math.floor(cell * (bead.code.length > 3 ? 0.28 : 0.34)));
          ctx.font = `700 ${size}px "Zen Maru Gothic", "ZCOOL KuaiLe", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(bead.code, x + cell / 2, y + cell / 2 + (style === 'bead' ? 1 : 0));
        }
      }
      ctx.restore();
    }
  }
}
