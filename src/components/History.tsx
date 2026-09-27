import { useEffect, useRef } from 'react';
import { listHistory, type HistoryRecord } from '../lib/storage';

type Props = {
  onBack: () => void;
  onOpen: (id: string) => void;
};

export function History({ onBack, onOpen }: Props) {
  const items = listHistory();
  return (
    <section className="screen history">
      <header className="topbar">
        <button className="text-btn" onClick={onBack}>
          返回
        </button>
        <strong>历史记录</strong>
        <span />
      </header>
      {items.length === 0 ? (
        <p className="history-empty">还没有图纸</p>
      ) : (
        <div className="screen-body history-list">
          {items.map((item) => (
            <HistoryCard key={item.id} item={item} onOpen={() => onOpen(item.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryCard({ item, onOpen }: { item: HistoryRecord; onOpen: () => void }) {
  const { total, colors } = tally(item.cells);
  return (
    <button type="button" className="history-card" onClick={onOpen}>
      <span className="history-thumb">
        <Thumb item={item} />
      </span>
      <span className="history-copy">
        <strong>{item.name || '未命名'}</strong>
        <em>{formatEdited(item.updatedAt)}</em>
        <em>
          {item.cols}×{item.rows} · {total} 颗 · {colors} 色
        </em>
        <em>{item.systemLabel}</em>
      </span>
    </button>
  );
}

function Thumb({ item }: { item: HistoryRecord }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const box = 72;
    const cell = Math.max(1, Math.floor(Math.min(box / item.cols, box / item.rows)));
    const width = Math.max(1, item.cols * cell);
    const height = Math.max(1, item.rows * cell);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < item.cells.length; i++) {
      const index = item.cells[i];
      const bead = index >= 0 ? item.palette[index] : undefined;
      if (!bead) continue;
      ctx.fillStyle = bead[1];
      ctx.fillRect((i % item.cols) * cell, Math.floor(i / item.cols) * cell, cell, cell);
    }
  }, [item]);
  return <canvas ref={ref} />;
}

function tally(cells: number[]) {
  const used = new Set<number>();
  let total = 0;
  for (const cell of cells) {
    if (cell < 0) continue;
    total += 1;
    used.add(cell);
  }
  return { total, colors: used.size };
}

function formatEdited(ts: number) {
  const date = new Date(ts);
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((start.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return `今天 ${time}`;
  if (diff === 1) return `昨天 ${time}`;
  if (date.getFullYear() === start.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}
