import { useEffect, useMemo, useRef, useState } from 'react';
import { getSystem, getVariant } from '../data/palettes';
import { textOn, toBead } from '../lib/color';
import { downloadCsv, downloadSvg, type PatternExport } from '../lib/export';
import { AXIS, cellAt, drawRuler, fitBoard, holdBoard, zoomBoard, type BoardView } from '../lib/gridBoard';
import { replaceColor, summarize } from '../lib/process';
import type { Project, Swatch, Tool } from '../types';
import { EMPTY } from '../types';
import { SwatchBook } from './SwatchBook';

type Props = {
  project: Project;
  editRev: number;
  canUndo: boolean;
  onStrokeStart: () => void;
  onEdited: () => void;
  onUndo: () => void;
  onBack: () => void;
};

export function Studio(props: Props) {
  const { project } = props;
  const stats = useMemo(() => summarize(project.cells, project.palette), [project, props.editRev]);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>('paint');
  const [selected, setSelected] = useState(() => stats.items[0]?.index ?? 0);
  const [swap, setSwap] = useState<{ from: number; pick: Swatch | null } | null>(null);
  const openSwapRef = useRef<(index: number) => void>(() => {});
  openSwapRef.current = (index: number) => {
    if (index < 0 || !project.palette[index]) return;
    setSwap({ from: index, pick: null });
  };
  const [book, setBook] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  const viewKey = useRef('');
  const paintRef = useRef<() => void>(() => {});
  const editingRef = useRef(editing);
  const toolRef = useRef(tool);
  const selectedRef = useRef(selected);
  const pushed = useRef(false);
  const callbacks = useRef(props);
  callbacks.current = props;
  editingRef.current = editing;
  toolRef.current = tool;
  selectedRef.current = selected;

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cols = project.cols;
    const rows = project.rows;

    const paint = () => {
      const rect = stage.getBoundingClientRect();
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
      const key = `${cols}x${rows}`;
      if (!viewRef.current || viewKey.current !== key) {
        viewRef.current = fitBoard(width, height, cols, rows);
        viewKey.current = key;
      } else {
        viewRef.current = holdBoard(viewRef.current, width, height, cols, rows);
      }
      const view = viewRef.current;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(AXIS, AXIS, width - AXIS, height - AXIS);
      ctx.clip();
      ctx.fillStyle = '#F7F1EA';
      ctx.fillRect(view.tx, view.ty, cols * view.scale, rows * view.scale);
      const c0 = Math.max(0, Math.floor((AXIS - view.tx) / view.scale));
      const c1 = Math.min(cols, Math.ceil((width - view.tx) / view.scale));
      const r0 = Math.max(0, Math.floor((AXIS - view.ty) / view.scale));
      const r1 = Math.min(rows, Math.ceil((height - view.ty) / view.scale));
      for (let row = r0; row < r1; row++) {
        for (let col = c0; col < c1; col++) {
          const value = project.cells[row * cols + col] ?? EMPTY;
          const x = view.tx + col * view.scale;
          const y = view.ty + row * view.scale;
          const bead = value >= 0 ? project.palette[value] : undefined;
          if (!bead) {
            if (view.scale >= 8) {
              ctx.fillStyle = 'rgba(106,70,54,0.16)';
              ctx.beginPath();
              ctx.arc(x + view.scale / 2, y + view.scale / 2, Math.max(0.6, view.scale * 0.12), 0, Math.PI * 2);
              ctx.fill();
            }
            continue;
          }
          ctx.fillStyle = bead.hex;
          ctx.fillRect(x, y, view.scale + 0.5, view.scale + 0.5);
          if (view.scale >= 16) {
            ctx.fillStyle = textOn(bead.hex);
            ctx.font = `700 ${Math.max(8, Math.floor(view.scale * 0.32))}px "Zen Maru Gothic", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(bead.code, x + view.scale / 2, y + view.scale / 2);
          }
        }
      }
      if (view.scale >= 3) {
        ctx.beginPath();
        for (let col = c0; col <= c1; col++) {
          const x = Math.round(view.tx + col * view.scale) + 0.5;
          ctx.moveTo(x, Math.max(AXIS, view.ty));
          ctx.lineTo(x, Math.min(height, view.ty + rows * view.scale));
        }
        for (let row = r0; row <= r1; row++) {
          const y = Math.round(view.ty + row * view.scale) + 0.5;
          ctx.moveTo(Math.max(AXIS, view.tx), y);
          ctx.lineTo(Math.min(width, view.tx + cols * view.scale), y);
        }
        ctx.strokeStyle = 'rgba(90,58,46,0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
      drawRuler(ctx, view, width, height, cols, rows);
    };
    paintRef.current = paint;

    const pointers = new Map<number, { x: number; y: number }>();
    let pan: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
    let pinch: { dist: number; view: BoardView; mx: number; my: number } | null = null;
    let painting = false;
    let replaceAt: { x: number; y: number } | null = null;
    const local = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const openReplace = (x: number, y: number) => {
      if (!viewRef.current) return;
      const hit = cellAt(viewRef.current, x, y, cols, rows);
      if (!hit) return;
      const value = project.cells[hit.row * cols + hit.col] ?? EMPTY;
      if (value >= 0) openSwapRef.current(value);
    };
    const paintAt = (x: number, y: number) => {
      if (!viewRef.current || !editingRef.current) return false;
      if (toolRef.current !== 'paint' && toolRef.current !== 'eraser') return false;
      const hit = cellAt(viewRef.current, x, y, cols, rows);
      if (!hit) return false;
      const next = toolRef.current === 'eraser' ? EMPTY : selectedRef.current;
      const index = hit.row * cols + hit.col;
      if (project.cells[index] === next) return true;
      if (!pushed.current) {
        callbacks.current.onStrokeStart();
        pushed.current = true;
      }
      project.cells[index] = next;
      paint();
      return true;
    };
    const onDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      const point = local(event);
      pointers.set(event.pointerId, point);
      if (pointers.size >= 2 && viewRef.current) {
        const [a, b] = [...pointers.values()];
        pinch = {
          dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          view: { ...viewRef.current },
          mx: (a.x + b.x) / 2,
          my: (a.y + b.y) / 2,
        };
        pan = null;
        painting = false;
        return;
      }
      if (editingRef.current && toolRef.current === 'replace') {
        replaceAt = point;
        return;
      }
      if (editingRef.current && (toolRef.current === 'paint' || toolRef.current === 'eraser')) {
        painting = paintAt(point.x, point.y);
        if (painting) return;
      }
      if (!viewRef.current || editingRef.current) return;
      pan = { ...point, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false };
    };
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId) || !viewRef.current) return;
      const point = local(event);
      pointers.set(event.pointerId, point);
      const rect = canvas.getBoundingClientRect();
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const zoomed = zoomBoard(pinch.view, pinch.mx, pinch.my, dist / pinch.dist, rect.width, rect.height, cols, rows);
        const wx = (pinch.mx - pinch.view.tx) / pinch.view.scale;
        const wy = (pinch.my - pinch.view.ty) / pinch.view.scale;
        viewRef.current = holdBoard(
          { scale: zoomed.scale, tx: mx - wx * zoomed.scale, ty: my - wy * zoomed.scale },
          rect.width,
          rect.height,
          cols,
          rows,
        );
        paint();
        return;
      }
      if (replaceAt && Math.hypot(point.x - replaceAt.x, point.y - replaceAt.y) > 8) replaceAt = null;
      if (painting) {
        paintAt(point.x, point.y);
        return;
      }
      if (!pan || editingRef.current) return;
      const dx = point.x - pan.x;
      const dy = point.y - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 10) return;
      pan.moved = true;
      viewRef.current = holdBoard(
        { scale: viewRef.current.scale, tx: pan.tx + dx, ty: pan.ty + dy },
        rect.width,
        rect.height,
        cols,
        rows,
      );
      paint();
    };
    const finishStroke = () => {
      if (!pushed.current) return;
      pushed.current = false;
      callbacks.current.onEdited();
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        if (replaceAt) openReplace(replaceAt.x, replaceAt.y);
        replaceAt = null;
        pan = null;
        if (painting) finishStroke();
        painting = false;
      }
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
        cols,
        rows,
      );
      paint();
    };
    const onDouble = (event: MouseEvent) => {
      if (editingRef.current) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      viewRef.current = fitBoard(rect.width, rect.height, cols, rows);
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
    observer.observe(stage);
    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDouble);
    };
  }, [project]);

  useEffect(() => {
    paintRef.current();
  }, [props.editRev, editing]);

  const pack = (): PatternExport => ({
    cells: project.cells,
    cols: project.cols,
    rows: project.rows,
    palette: project.palette,
    title: project.systemLabel,
    showCode: true,
    showGrid: true,
    showLegend: true,
    cell: 18,
  });
  const card = useMemo(() => {
    const variant = getVariant(project.systemId, project.variantId);
    const groups = [...new Set(variant.colors.map((item) => item.group))];
    return { name: getSystem(project.systemId).name, colors: variant.colors, groups };
  }, [project.systemId, project.variantId]);
  const fromBead = swap ? project.palette[swap.from] : null;
  const confirmSwap = () => {
    if (!swap?.pick || !fromBead) return;
    if (fromBead.code === swap.pick.code) {
      setSwap(null);
      return;
    }
    let to = project.palette.findIndex((bead) => bead.code === swap.pick!.code);
    if (to < 0) {
      project.palette.push(toBead(swap.pick.code, swap.pick.hex));
      to = project.palette.length - 1;
    }
    props.onStrokeStart();
    replaceColor(project.cells, swap.from, to);
    props.onEdited();
    setSelected(to);
    setSwap(null);
  };

  return (
    <section className={editing ? 'screen studio editing' : 'screen studio'}>
      <header className="topbar">
        <button className="text-btn" onClick={props.onBack}>
          返回
        </button>
        <span className="count-pill num">
          {stats.total} 颗 · {stats.items.length} 色
        </span>
        <button className="text-btn" onClick={() => setBook(true)}>
          色卡
        </button>
      </header>
      <div className="stage" ref={stageRef}>
        <canvas ref={canvasRef} />
      </div>
      {editing && (
        <div className="edit-tray">
          <div className="edit-colors">
            {stats.items.map((item) => (
              <button
                key={item.bead.code}
                type="button"
                className={
                  (tool === 'replace' ? swap?.from === item.index : item.index === selected) ? 'edit-swatch on' : 'edit-swatch'
                }
                onClick={() => {
                  if (tool === 'replace') openSwapRef.current(item.index);
                  else setSelected(item.index);
                }}
                aria-label={item.bead.code}
                aria-pressed={tool === 'replace' ? swap?.from === item.index : item.index === selected}
              >
                <i style={{ background: item.bead.hex }} />
                <span>{item.bead.code}</span>
              </button>
            ))}
          </div>
          <div className="edit-tools">
            <button type="button" className={tool === 'paint' ? 'edit-tool on' : 'edit-tool'} onClick={() => setTool('paint')}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M14 5l5 5L8 21H3v-5L14 5z" />
              </svg>
              画笔
            </button>
            <button type="button" className={tool === 'eraser' ? 'edit-tool on' : 'edit-tool'} onClick={() => setTool('eraser')}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M16 5l3 3-9 9H7v-3L16 5z" />
                <path d="M5 19h14" />
              </svg>
              橡皮
            </button>
            <button type="button" className={tool === 'replace' ? 'edit-tool on' : 'edit-tool'} onClick={() => setTool('replace')}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M7 7h10" />
                <path d="M14 4l3 3-3 3" />
                <path d="M17 17H7" />
                <path d="M10 14l-3 3 3 3" />
              </svg>
              换色
            </button>
            <button type="button" className="edit-tool" disabled={!props.canUndo} onClick={props.onUndo}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M9 7H4v5" />
                <path d="M4 12a8 8 0 1 0 2.5-5.5L4 8" />
              </svg>
              撤销
            </button>
          </div>
          {tool === 'replace' && <p className="replace-line">点画布上的一格，或点上面用过的颜色</p>}
        </div>
      )}
      <div className="studio-bar">
        <button className="studio-act" aria-pressed={editing} onClick={() => setEditing((on) => !on)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M14 5l5 5L8 21H3v-5L14 5z" />
          </svg>
          修改
        </button>
        <button className="studio-act studio-act-go" onClick={() => setExportOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 4v10" />
            <path d="M8 10l4 4 4-4" />
            <path d="M5 19h14" />
          </svg>
          导出图纸
        </button>
      </div>
      {exportOpen && (
        <div className="backdrop" onClick={() => setExportOpen(false)}>
          <div className="sheet short" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <h2>导出图纸</h2>
              <button className="text-btn" onClick={() => setExportOpen(false)}>
                完成
              </button>
            </div>
            <div className="export-row">
              <button className="btn btn-small" onClick={() => downloadSvg(pack())}>
                图纸 SVG
              </button>
              <button className="btn btn-small btn-ghost" onClick={() => downloadCsv(pack())}>
                采购清单
              </button>
            </div>
          </div>
        </div>
      )}
      {swap && fromBead && (
        <div className="backdrop" onClick={() => setSwap(null)}>
          <div className="sheet used-sheet replace-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <h2>{card.name} 色卡</h2>
              <button className="text-btn" onClick={() => setSwap(null)}>
                取消
              </button>
            </div>
            <p className="replace-from">
              <span>把</span>
              <i style={{ background: fromBead.hex }} />
              <b>{fromBead.code}</b>
              <span>全部换成</span>
              {swap.pick ? (
                <>
                  <i style={{ background: swap.pick.hex }} />
                  <b>{swap.pick.code}</b>
                </>
              ) : (
                <span className="quiet">点下面一种颜色</span>
              )}
            </p>
            <div className="used-body">
              {card.groups.map((group) => {
                const beads = card.colors.filter((item) => item.group === group);
                return (
                  <section key={group} className="swatch-section">
                    <header>
                      <b>{group}</b>
                      <span>{beads.length} 色</span>
                    </header>
                    <div className="swatch-beads">
                      {beads.map((item) => (
                        <button
                          key={item.code}
                          type="button"
                          className={swap.pick?.code === item.code ? 'swatch-cell on' : 'swatch-cell'}
                          onClick={() => setSwap({ from: swap.from, pick: item })}
                        >
                          <i style={{ background: item.hex }} />
                          <span>{item.code}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="replace-confirm">
              <button className="btn btn-primary btn-block" disabled={!swap.pick || swap.pick.code === fromBead.code} onClick={confirmSwap}>
                确认替换
              </button>
            </div>
          </div>
        </div>
      )}
      {book && <SwatchBook systemId={project.systemId} variantId={project.variantId} onBack={() => setBook(false)} />}
    </section>
  );
}
