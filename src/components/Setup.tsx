import { cmOf } from '../lib/color';
import { fitGrid } from '../lib/process';
import { SYSTEMS, getSystem } from '../data/palettes';

type Props = {
  width: number;
  height: number;
  cropW: number;
  cropH: number;
  longSide: number;
  systemId: string;
  variantId: string;
  merge: number;
  denoise: number;
  enabledCount: number;
  hasProject: boolean;
  onLongSide: (value: number) => void;
  onSystem: (id: string) => void;
  onVariant: (id: string) => void;
  onMerge: (value: number) => void;
  onDenoise: (value: number) => void;
  onPalette: () => void;
  onBack: () => void;
  onGenerate: () => void;
};

const SIZES = [24, 32, 48, 64];
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

export function Setup(props: Props) {
  const aspect = (props.width * props.cropW) / (props.height * props.cropH);
  const grid = fitGrid(props.longSide, aspect);
  const system = getSystem(props.systemId);
  return (
    <section className="screen">
      <header className="topbar">
        <button className="text-btn" onClick={props.onBack}>
          返回
        </button>
        <strong>尺寸和色号</strong>
        <span />
      </header>
      <div className="screen-body setup-body">
        <div className="size-hero">
          <p className="num">
            {grid.cols} × {grid.rows}
          </p>
          <span>
            大约 {cmOf(grid.cols).toFixed(1)} × {cmOf(grid.rows).toFixed(1)} cm
          </span>
        </div>
        <div className="chip-row">
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
          <span className="num">长边 {props.longSide} 颗</span>
          <button onClick={() => props.onLongSide(props.longSide + 2)} aria-label="多两颗">
            +
          </button>
        </div>
        <p className="hint">按 2.6mm 小豆估算，长边决定精细程度</p>
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
        <button className="text-btn left" onClick={props.onPalette}>
          调整色板 · 可用 {props.enabledCount} 色
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
    </section>
  );
}
