import { useEffect, useMemo, useRef, useState } from 'react';
import { getSystem, getVariant } from '../data/palettes';
import { deltaE2, hexToRgb, rgbToLab, textOn, toBead } from '../lib/color';
import { downloadCsv, downloadSvg, type ListOptions, type PatternExport } from '../lib/export';
import { AXIS, cellAt, drawRuler, fitBoard, scaleAround, slideBoard, type BoardView } from '../lib/gridBoard';
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
  const [usageOpen, setUsageOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [paper, setPaper] = useState({ grid: true, axis: true, code: true, legend: true, block: 0 as 0 | 5 | 10 });
  const [listOpts, setListOpts] = useState<ListOptions>({ group: true, hex: true, sort: 'count' });
  const [exportKind, setExportKind] = useState<'svg' | 'list'>('svg');
  const [pieceName, setPieceName] = useState(project.name ?? '');
  const [viewOpen, setViewOpen] = useState(false);
  const [show, setShow] = useState({ grid: true, axis: true, block: 0 as 0 | 5 | 10, code: true });
  const showRef = useRef(show);
  showRef.current = show;
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
    const edge = () => (showRef.current.axis ? AXIS : 0);

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
        viewRef.current = fitBoard(width, height, cols, rows, edge());
        viewKey.current = key;
      } else {
        viewRef.current = slideBoard(viewRef.current, width, height, cols, rows, edge());
      }
      const view = viewRef.current;
      const gutter = edge();
      const marks = showRef.current;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(gutter, gutter, width - gutter, height - gutter);
      ctx.clip();
      ctx.fillStyle = '#F7F1EA';
      ctx.fillRect(view.tx, view.ty, cols * view.scale, rows * view.scale);
      const c0 = Math.max(0, Math.floor((gutter - view.tx) / view.scale));
      const c1 = Math.min(cols, Math.ceil((width - view.tx) / view.scale));
      const r0 = Math.max(0, Math.floor((gutter - view.ty) / view.scale));
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
          if (marks.code && view.scale >= 16) {
            ctx.fillStyle = textOn(bead.hex);
            ctx.font = `700 ${Math.max(8, Math.floor(view.scale * 0.32))}px "Zen Maru Gothic", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(bead.code, x + view.scale / 2, y + view.scale / 2);
          }
        }
      }
      const strokeLines = (step: number, color: string, widthPx: number) => {
        ctx.beginPath();
        for (let col = 0; col <= cols; col += step) {
          if (col < c0 || col > c1) continue;
          const x = Math.round(view.tx + col * view.scale) + 0.5;
          ctx.moveTo(x, Math.max(gutter, view.ty));
          ctx.lineTo(x, Math.min(height, view.ty + rows * view.scale));
        }
        for (let row = 0; row <= rows; row += step) {
          if (row < r0 || row > r1) continue;
          const y = Math.round(view.ty + row * view.scale) + 0.5;
          ctx.moveTo(Math.max(gutter, view.tx), y);
          ctx.lineTo(Math.min(width, view.tx + cols * view.scale), y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = widthPx;
        ctx.stroke();
      };
      if (marks.grid && view.scale >= 3) strokeLines(1, 'rgba(90,58,46,0.28)', 1);
      if (marks.block) strokeLines(marks.block, 'rgba(90,58,46,0.72)', 2);
      ctx.restore();
      if (marks.axis) drawRuler(ctx, view, width, height, cols, rows);
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
      const hit = cellAt(viewRef.current, x, y, cols, rows, edge());
      if (!hit) return;
      const value = project.cells[hit.row * cols + hit.col] ?? EMPTY;
      if (value >= 0) openSwapRef.current(value);
    };
    const paintAt = (x: number, y: number) => {
      if (!viewRef.current || !editingRef.current) return false;
      if (toolRef.current !== 'paint' && toolRef.current !== 'eraser') return false;
      const hit = cellAt(viewRef.current, x, y, cols, rows, edge());
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
        const zoomed = scaleAround(pinch.view, pinch.mx, pinch.my, dist / pinch.dist, rect.width, rect.height, cols, rows, edge());
        const wx = (pinch.mx - pinch.view.tx) / pinch.view.scale;
        const wy = (pinch.my - pinch.view.ty) / pinch.view.scale;
        viewRef.current = slideBoard(
          { scale: zoomed.scale, tx: mx - wx * zoomed.scale, ty: my - wy * zoomed.scale },
          rect.width,
          rect.height,
          cols,
          rows,
          edge(),
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
      if (!pan.moved && Math.hypot(dx, dy) < 2) return;
      pan.moved = true;
      viewRef.current = slideBoard(
        { scale: viewRef.current.scale, tx: pan.tx + dx, ty: pan.ty + dy },
        rect.width,
        rect.height,
        cols,
        rows,
        edge(),
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
      if (event.ctrlKey || event.metaKey) {
        viewRef.current = slideBoard(
          scaleAround(
            viewRef.current,
            event.clientX - rect.left,
            event.clientY - rect.top,
            event.deltaY < 0 ? 1.08 : 1 / 1.08,
            rect.width,
            rect.height,
            cols,
            rows,
            edge(),
          ),
          rect.width,
          rect.height,
          cols,
          rows,
          edge(),
        );
      } else {
        viewRef.current = slideBoard(
          { scale: viewRef.current.scale, tx: viewRef.current.tx - event.deltaX, ty: viewRef.current.ty - event.deltaY },
          rect.width,
          rect.height,
          cols,
          rows,
          edge(),
        );
      }
      paint();
    };
    const onDouble = (event: MouseEvent) => {
      if (editingRef.current) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      viewRef.current = fitBoard(rect.width, rect.height, cols, rows, edge());
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
  }, [project, show]);

  useEffect(() => {
    paintRef.current();
  }, [props.editRev, editing, show]);

  const pack = (): PatternExport => ({
    cells: project.cells,
    cols: project.cols,
    rows: project.rows,
    palette: project.palette,
    title: pieceName.trim() || project.systemLabel,
    fileName: pieceName.trim(),
    brand: project.systemLabel,
    showCode: paper.code,
    showGrid: paper.grid,
    showLegend: paper.legend,
    showAxis: paper.axis,
    block: paper.block,
    cell: 18,
  });
  const card = useMemo(() => {
    const variant = getVariant(project.systemId, project.variantId);
    const groups = [...new Set(variant.colors.map((item) => item.group))];
    return { name: getSystem(project.systemId).name, colors: variant.colors, groups };
  }, [project.systemId, project.variantId]);
  const usage = useMemo(() => {
    const groupOf = new Map(card.colors.map((item) => [item.code, item.group]));
    const buckets = new Map<string, { code: string; hex: string; count: number }[]>();
    for (const item of stats.items) {
      const group = groupOf.get(item.bead.code) ?? '其他';
      const list = buckets.get(group) ?? [];
      list.push({ code: item.bead.code, hex: item.bead.hex, count: item.count });
      buckets.set(group, list);
    }
    const order = [...card.groups, '其他'];
    return order
      .filter((group) => buckets.has(group))
      .map((group) => {
        const beads = buckets.get(group)!.sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, 'en', { numeric: true }));
        return { group, beads, total: beads.reduce((sum, bead) => sum + bead.count, 0) };
      });
  }, [card.colors, card.groups, stats.items]);
  const fromBead = swap ? project.palette[swap.from] : null;
  const near = useMemo(() => {
    if (!fromBead) return [];
    return card.colors
      .filter((item) => item.code !== fromBead.code)
      .map((item) => {
        const [r, g, b] = hexToRgb(item.hex);
        return { item, d: deltaE2(fromBead.lab, rgbToLab(r, g, b)) };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map((entry) => entry.item);
  }, [card.colors, fromBead]);
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
        <button type="button" className="count-pill num" onClick={() => setUsageOpen(true)}>
          {stats.total} 颗 · {stats.items.length} 色
        </button>
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
        <button className="studio-act" aria-pressed={viewOpen} onClick={() => setViewOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          显示
        </button>
        <button className="studio-act" aria-pressed={editing} onClick={() => setEditing((on) => !on)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M14 5l5 5L8 21H3v-5L14 5z" />
          </svg>
          修改
        </button>
        <button
          className="studio-act studio-act-go"
          onClick={() => {
            setPaper({ grid: show.grid, axis: show.axis, code: show.code, legend: true, block: show.block });
            setExportKind('svg');
            setExportOpen(true);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 4v10" />
            <path d="M8 10l4 4 4-4" />
            <path d="M5 19h14" />
          </svg>
          导出图纸
        </button>
      </div>
      {viewOpen && (
        <div
          className="backdrop"
          onClick={() => {
            props.onEdited();
            setViewOpen(false);
          }}
        >
          <div className="sheet short" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <h2>显示</h2>
              <button
                className="text-btn"
                onClick={() => {
                  props.onEdited();
                  setViewOpen(false);
                }}
              >
                完成
              </button>
            </div>
            <label className="export-name">
              <span>名称</span>
              <input
                value={pieceName}
                maxLength={40}
                placeholder="给这张图纸起个名字"
                aria-label="图纸名称"
                onChange={(event) => {
                  const next = event.target.value;
                  setPieceName(next);
                  project.name = next.trim();
                }}
                onBlur={() => props.onEdited()}
              />
            </label>
            <label className="field">
              <span>格子线</span>
              <button type="button" className={show.grid ? 'toggle on' : 'toggle'} aria-pressed={show.grid} onClick={() => setShow((item) => ({ ...item, grid: !item.grid }))}>
                {show.grid ? '开' : '关'}
              </button>
            </label>
            <label className="field">
              <span>坐标轴</span>
              <button
                type="button"
                className={show.axis ? 'toggle on' : 'toggle'}
                aria-pressed={show.axis}
                onClick={() => {
                  const axis = !show.axis;
                  const view = viewRef.current;
                  const stage = stageRef.current;
                  if (view && stage) {
                    const delta = (axis ? AXIS : 0) - (show.axis ? AXIS : 0);
                    const rect = stage.getBoundingClientRect();
                    viewRef.current = slideBoard(
                      { ...view, tx: view.tx + delta, ty: view.ty + delta },
                      rect.width,
                      rect.height,
                      project.cols,
                      project.rows,
                      axis ? AXIS : 0,
                    );
                  }
                  setShow((item) => ({ ...item, axis }));
                }}
              >
                {show.axis ? '开' : '关'}
              </button>
            </label>
            <label className="field">
              <span>色号</span>
              <button type="button" className={show.code ? 'toggle on' : 'toggle'} aria-pressed={show.code} onClick={() => setShow((item) => ({ ...item, code: !item.code }))}>
                {show.code ? '开' : '关'}
              </button>
            </label>
            <label className="field">
              <span>分区线</span>
              <span className="seg">
                <button type="button" className={show.block === 0 ? 'on' : ''} onClick={() => setShow((item) => ({ ...item, block: 0 }))}>
                  关
                </button>
                <button type="button" className={show.block === 5 ? 'on' : ''} onClick={() => setShow((item) => ({ ...item, block: 5 }))}>
                  5×5
                </button>
                <button type="button" className={show.block === 10 ? 'on' : ''} onClick={() => setShow((item) => ({ ...item, block: 10 }))}>
                  10×10
                </button>
              </span>
            </label>
          </div>
        </div>
      )}
      {exportOpen && (
        <div className="backdrop" onClick={() => setExportOpen(false)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <h2>导出图纸</h2>
              <button className="text-btn" onClick={() => setExportOpen(false)}>
                完成
              </button>
            </div>
            <div className="seg export-switch" role="tablist">
              <button type="button" className={exportKind === 'svg' ? 'on' : ''} onClick={() => setExportKind('svg')}>
                图纸 SVG
              </button>
              <button type="button" className={exportKind === 'list' ? 'on' : ''} onClick={() => setExportKind('list')}>
                采购清单
              </button>
            </div>
            <label className="export-name">
              <span>名称</span>
              <input
                value={pieceName}
                maxLength={40}
                placeholder="给这张图纸起个名字"
                aria-label="图纸名称"
                onChange={(event) => {
                  const next = event.target.value;
                  setPieceName(next);
                  project.name = next.trim();
                }}
                onBlur={() => props.onEdited()}
              />
            </label>
            {exportKind === 'svg' ? (
            <section className="export-block">
              <label className="field">
                <span>格子线</span>
                <button type="button" className={paper.grid ? 'toggle on' : 'toggle'} aria-pressed={paper.grid} onClick={() => setPaper((item) => ({ ...item, grid: !item.grid }))}>
                  {paper.grid ? '开' : '关'}
                </button>
              </label>
              <label className="field">
                <span>坐标轴</span>
                <button type="button" className={paper.axis ? 'toggle on' : 'toggle'} aria-pressed={paper.axis} onClick={() => setPaper((item) => ({ ...item, axis: !item.axis }))}>
                  {paper.axis ? '开' : '关'}
                </button>
              </label>
              <label className="field">
                <span>色号</span>
                <button type="button" className={paper.code ? 'toggle on' : 'toggle'} aria-pressed={paper.code} onClick={() => setPaper((item) => ({ ...item, code: !item.code }))}>
                  {paper.code ? '开' : '关'}
                </button>
              </label>
              <label className="field">
                <span>图例</span>
                <button type="button" className={paper.legend ? 'toggle on' : 'toggle'} aria-pressed={paper.legend} onClick={() => setPaper((item) => ({ ...item, legend: !item.legend }))}>
                  {paper.legend ? '开' : '关'}
                </button>
              </label>
              <label className="field">
                <span>分区线</span>
                <span className="seg">
                  <button type="button" className={paper.block !== 10 ? 'on' : ''} onClick={() => setPaper((item) => ({ ...item, block: 5 }))}>
                    5×5
                  </button>
                  <button type="button" className={paper.block === 10 ? 'on' : ''} onClick={() => setPaper((item) => ({ ...item, block: 10 }))}>
                    10×10
                  </button>
                </span>
              </label>
              <button className="btn btn-primary btn-block" onClick={() => downloadSvg(pack())}>
                下载图纸 SVG
              </button>
            </section>
            ) : (
            <section className="export-block">
              <label className="field">
                <span>色系</span>
                <button type="button" className={listOpts.group ? 'toggle on' : 'toggle'} aria-pressed={listOpts.group} onClick={() => setListOpts((item) => ({ ...item, group: !item.group }))}>
                  {listOpts.group ? '开' : '关'}
                </button>
              </label>
              <label className="field">
                <span>颜色值</span>
                <button type="button" className={listOpts.hex ? 'toggle on' : 'toggle'} aria-pressed={listOpts.hex} onClick={() => setListOpts((item) => ({ ...item, hex: !item.hex }))}>
                  {listOpts.hex ? '开' : '关'}
                </button>
              </label>
              <label className="field">
                <span>排序</span>
                <span className="seg">
                  <button type="button" className={listOpts.sort === 'count' ? 'on' : ''} onClick={() => setListOpts((item) => ({ ...item, sort: 'count' }))}>
                    按用量
                  </button>
                  <button type="button" className={listOpts.sort === 'code' ? 'on' : ''} onClick={() => setListOpts((item) => ({ ...item, sort: 'code' }))}>
                    按色号
                  </button>
                </span>
              </label>
              <button
                className="btn btn-block"
                onClick={() => downloadCsv(pack(), listOpts, new Map(card.colors.map((item) => [item.code, item.group])), card.groups)}
              >
                下载采购清单
              </button>
            </section>
            )}
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
              {near.length > 0 && (
                <section className="swatch-section">
                  <header>
                    <b>相近色</b>
                    <span>{near.length} 色</span>
                  </header>
                  <div className="swatch-beads">
                    {near.map((item) => (
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
              )}
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
      {usageOpen && (
        <div className="backdrop" onClick={() => setUsageOpen(false)}>
          <div className="sheet used-sheet usage-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <h2>用到的颜色</h2>
              <button className="text-btn" onClick={() => setUsageOpen(false)}>
                完成
              </button>
            </div>
            <p className="usage-total num">
              共 {stats.total} 颗 · {stats.items.length} 色
            </p>
            <div className="used-body">
              {usage.map((group) => (
                <section key={group.group} className="swatch-section">
                  <header>
                    <b>{group.group}</b>
                    <span>
                      {group.beads.length} 色 · {group.total} 颗
                    </span>
                  </header>
                  <div className="swatch-beads">
                    {group.beads.map((item) => (
                      <div key={item.code} className="swatch-cell">
                        <i style={{ background: item.hex }} />
                        <span>{item.code}</span>
                        <em className="num">{item.count}颗</em>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
      {book && <SwatchBook systemId={project.systemId} variantId={project.variantId} onBack={() => setBook(false)} />}
    </section>
  );
}
