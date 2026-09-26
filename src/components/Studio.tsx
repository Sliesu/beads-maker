import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { drawPattern } from '../lib/draw';
import { replaceColor, summarize } from '../lib/process';
import { markTip, tipSeen } from '../lib/storage';
import { CELL } from '../lib/view';
import { useBoard } from '../hooks/useBoard';
import type { Project, Tool } from '../types';
import { EMPTY } from '../types';
import { ColorPickSheet } from './Sheets';

type Props = {
  project: Project;
  editRev: number;
  canUndo: boolean;
  onStrokeStart: () => void;
  onEdited: () => void;
  onUndo: () => void;
  onBack: () => void;
  onFocus: (index: number) => void;
  onOpenList: () => void;
  onOpenPalette: () => void;
};

export function Studio(props: Props) {
  const { project } = props;
  const board = useBoard(project.cols, project.rows, props.editRev);
  const [tool, setTool] = useState<Tool>('paint');
  const [selected, setSelected] = useState(() => summarize(project.cells, project.palette).items[0]?.index ?? 0);
  const [fromIndex, setFromIndex] = useState<number | null>(null);
  const [lens, setLens] = useState<{ x: number; y: number; col: number; row: number } | null>(null);
  const [panel, setPanel] = useState({ x: 12, y: 12 });
  const [showTip, setShowTip] = useState(() => !tipSeen());
  const [showAll, setShowAll] = useState(false);
  const pushed = useRef(false);
  const toolRef = useRef(tool);
  const selectedRef = useRef(selected);
  const lensCanvas = useRef<HTMLCanvasElement>(null);
  toolRef.current = tool;
  selectedRef.current = selected;

  const stats = useMemo(() => summarize(project.cells, project.palette), [project, props.editRev]);

  board.drawRef.current = (ctx, view) => {
    drawPattern(ctx, {
      cells: project.cells,
      cols: project.cols,
      rows: project.rows,
      palette: project.palette,
      cell: CELL,
      style: 'bead',
      focus: null,
      showCode: CELL * view.scale >= 22,
      showGrid: false,
    });
  };

  const paintCell = (col: number | null, row: number | null) => {
    if (col === null || row === null) return;
    const next = toolRef.current === 'eraser' ? EMPTY : selectedRef.current;
    const index = row * project.cols + col;
    if (project.cells[index] === next) return;
    if (!pushed.current) {
      props.onStrokeStart();
      pushed.current = true;
    }
    project.cells[index] = next;
    board.paint();
  };

  board.gestures.current = {
    onSingleDown: (info) => {
      if (toolRef.current === 'lens') {
        if (info.col !== null && info.row !== null) setLens({ x: info.x, y: info.y, col: info.col, row: info.row });
        return;
      }
      if (toolRef.current === 'replace') {
        if (info.col === null || info.row === null) return;
        const value = project.cells[info.row * project.cols + info.col];
        setFromIndex(value >= 0 ? value : null);
        return;
      }
      paintCell(info.col, info.row);
    },
    onSingleMove: (info) => {
      if (toolRef.current === 'lens') {
        if (info.col !== null && info.row !== null) setLens({ x: info.x, y: info.y, col: info.col, row: info.row });
        return;
      }
      if (toolRef.current === 'replace') return;
      paintCell(info.col, info.row);
    },
    onSingleUp: () => {
      if (!pushed.current) return;
      pushed.current = false;
      props.onEdited();
    },
    onCancel: () => {
      if (!pushed.current) return;
      pushed.current = false;
      props.onUndo();
    },
  };

  useEffect(() => {
    const canvas = lensCanvas.current;
    if (!canvas || !lens || tool !== 'lens') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = 132;
    const dpr = 2;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFDF8';
    ctx.fillRect(0, 0, size, size);
    const n = 5;
    const cell = size / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const col = lens.col - 2 + x;
        const row = lens.row - 2 + y;
        const inside = col >= 0 && row >= 0 && col < project.cols && row < project.rows;
        const value = inside ? project.cells[row * project.cols + col] : EMPTY;
        const bead = value >= 0 ? project.palette[value] : undefined;
        ctx.fillStyle = bead ? bead.hex : 'rgba(106,70,54,0.08)';
        ctx.fillRect(x * cell, y * cell, cell, cell);
        ctx.strokeStyle = x === 2 && y === 2 ? '#6A4636' : 'rgba(106,70,54,0.2)';
        ctx.lineWidth = x === 2 && y === 2 ? 3 : 1;
        ctx.strokeRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
        if (bead) {
          ctx.fillStyle = '#5C4033';
          ctx.font = '700 11px "Zen Maru Gothic", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(bead.code, x * cell + cell / 2, y * cell + cell / 2);
        }
      }
    }
  }, [lens, tool, project, props.editRev]);

  const lensBead =
    lens && project.cells[lens.row * project.cols + lens.col] >= 0
      ? project.palette[project.cells[lens.row * project.cols + lens.col]]
      : null;
  const fromBead = fromIndex !== null ? project.palette[fromIndex] : null;
  const target = project.palette[selected];

  return (
    <section className="screen studio">
      <header className="topbar">
        <button className="text-btn" onClick={props.onBack}>
          返回
        </button>
        <button className="count-pill num" onClick={props.onOpenList}>
          {stats.total} 颗 · {stats.items.length} 色
        </button>
        <button className="text-btn" onClick={() => stats.items[0] && props.onFocus(stats.items[0].index)}>
          专心
        </button>
      </header>
      <div className="stage" ref={board.stageRef}>
        <canvas ref={board.canvasRef} {...board.handlers} onPointerCancel={board.handlers.onPointerUp} />
        <div className="zoom-stack">
          <button onClick={board.zoomIn} aria-label="放大">
            +
          </button>
          <button onClick={board.zoomOut} aria-label="缩小">
            −
          </button>
          <button onClick={board.refit} aria-label="适配屏幕">
            适
          </button>
        </div>
        {tool === 'lens' && lens && (
          <div className="lens" style={{ left: lens.x, top: lens.y }}>
            <canvas ref={lensCanvas} />
            <p>
              {lens.row + 1} 行 {lens.col + 1} 列{lensBead ? ` · ${lensBead.code}` : ' · 空'}
            </p>
          </div>
        )}
        <div
          className="float-palette"
          style={{ left: panel.x, bottom: panel.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className="grip"
            aria-label="拖动色盘"
            onPointerDown={(event) => {
              const parent = board.stageRef.current?.getBoundingClientRect();
              if (!parent) return;
              const startX = event.clientX;
              const startY = event.clientY;
              const origin = { ...panel };
              const move = (ev: PointerEvent) => {
                const maxX = Math.max(8, parent.width - 220);
                setPanel({
                  x: Math.max(8, Math.min(maxX, origin.x + ev.clientX - startX)),
                  y: Math.max(8, Math.min(parent.height - 80, origin.y - (ev.clientY - startY))),
                });
              };
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          />
          <div className="palette-scroll">
            {stats.items.map((item) => (
              <button
                key={item.bead.code}
                className={item.index === selected ? 'mini-bead on' : 'mini-bead'}
                style={{ background: item.bead.hex }}
                onClick={() => {
                  setSelected(item.index);
                  setTool((current) => (current === 'replace' || current === 'lens' ? current : 'paint'));
                }}
                aria-label={item.bead.code}
              >
                <i>{item.bead.code}</i>
              </button>
            ))}
          </div>
          <button className="more-colors" onClick={() => setShowAll(true)} aria-label="全部色号">
            全部
          </button>
        </div>
        {showTip && (
          <button
            className="tip"
            onClick={() => {
              markTip();
              setShowTip(false);
            }}
          >
            双指缩放，点格子改颜色
          </button>
        )}
      </div>
      {tool === 'replace' && (
        <div className="replace-bar">
          {fromBead && target ? (
            <>
              <span className="dot" style={{ background: fromBead.hex }} />
              <span>换成</span>
              <span className="dot" style={{ background: target.hex }} />
              <button
                className="btn btn-small"
                onClick={() => {
                  props.onStrokeStart();
                  replaceColor(project.cells, fromIndex!, selected);
                  setFromIndex(null);
                  props.onEdited();
                }}
              >
                全部替换
              </button>
            </>
          ) : (
            <span>点一颗想换掉的豆子</span>
          )}
        </div>
      )}
      <div className="dock">
        <ToolButton name="画笔" active={tool === 'paint'} onClick={() => setTool('paint')}>
          <path d="M14 5l5 5L8 21H3v-5L14 5z" />
        </ToolButton>
        <ToolButton name="橡皮" active={tool === 'eraser'} onClick={() => setTool('eraser')}>
          <path d="M16 5l3 3-9 9H7v-3L16 5z" />
          <path d="M5 19h14" />
        </ToolButton>
        <ToolButton name="换色" active={tool === 'replace'} onClick={() => setTool('replace')}>
          <path d="M4 8h11" />
          <path d="M12 5l3 3-3 3" />
          <path d="M20 16H9" />
          <path d="M12 13l-3 3 3 3" />
        </ToolButton>
        <ToolButton name="放大" active={tool === 'lens'} onClick={() => setTool('lens')}>
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l4 4" />
        </ToolButton>
        <ToolButton name="撤销" active={false} disabled={!props.canUndo} onClick={props.onUndo}>
          <path d="M9 7H4v5" />
          <path d="M4 12a8 8 0 1 0 2.5-5.5L4 8" />
        </ToolButton>
      </div>
      {showAll && (
        <ColorPickSheet
          palette={project.palette}
          selected={selected}
          onPick={(index) => {
            setSelected(index);
            setTool((current) => (current === 'replace' || current === 'lens' ? current : 'paint'));
            setShowAll(false);
          }}
          onEdit={() => {
            setShowAll(false);
            props.onOpenPalette();
          }}
          onClose={() => setShowAll(false)}
        />
      )}
    </section>
  );
}

function ToolButton({
  name,
  active,
  disabled,
  onClick,
  children,
}: {
  name: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className={active ? 'tool on' : 'tool'} disabled={disabled} onClick={onClick} aria-pressed={active}>
      <svg viewBox="0 0 24 24" aria-hidden>
        {children}
      </svg>
      {name}
    </button>
  );
}
