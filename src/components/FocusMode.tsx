import { useMemo } from 'react';
import { drawPattern } from '../lib/draw';
import { summarize } from '../lib/process';
import { CELL } from '../lib/view';
import { useBoard } from '../hooks/useBoard';
import type { Project } from '../types';

type Props = {
  project: Project;
  editRev: number;
  colorIndex: number;
  onChange: (index: number) => void;
  onClose: () => void;
};

export function FocusMode(props: Props) {
  const stats = useMemo(() => summarize(props.project.cells, props.project.palette), [props.project, props.editRev]);
  const order = stats.items.map((item) => item.index);
  const place = Math.max(0, order.indexOf(props.colorIndex));
  const current = stats.items[place] ?? stats.items[0];
  const board = useBoard(props.project.cols, props.project.rows, props.editRev + place);

  board.drawRef.current = (_ctx, view) => {
    drawPattern(_ctx, {
      cells: props.project.cells,
      cols: props.project.cols,
      rows: props.project.rows,
      palette: props.project.palette,
      cell: CELL,
      style: 'bead',
      focus: current?.index ?? null,
      showCode: CELL * view.scale >= 22,
      showGrid: false,
    });
  };

  const go = (step: number) => {
    if (!order.length || !current) return;
    const next = (place + step + order.length) % order.length;
    props.onChange(order[next]);
  };

  return (
    <section className="screen focus-screen">
      <header className="topbar">
        <button className="text-btn" onClick={props.onClose}>
          退出
        </button>
        <strong>专心拼</strong>
        <span className="num quiet-num">
          {order.length ? place + 1 : 0}/{order.length}
        </span>
      </header>
      {current ? (
        <div className="focus-card">
          <i style={{ background: current.bead.hex }} />
          <div>
            <b className="num">{current.bead.code}</b>
            <span>{current.count} 颗 · 先把这一种摆上</span>
          </div>
        </div>
      ) : (
        <p className="hint">这张图还没有豆子</p>
      )}
      <div className="stage focus-stage" ref={board.stageRef}>
        <canvas ref={board.canvasRef} {...board.handlers} />
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
      </div>
      <div className="screen-foot focus-foot">
        <button className="btn btn-ghost" onClick={() => go(-1)} disabled={!order.length}>
          上一种
        </button>
        <button className="btn btn-primary" onClick={() => go(1)} disabled={!order.length}>
          下一种
        </button>
      </div>
    </section>
  );
}
