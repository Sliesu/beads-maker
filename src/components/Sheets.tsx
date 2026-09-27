import { useMemo, useState } from 'react';
import { getVariant } from '../data/palettes';
import { downloadCsv, downloadPng, downloadSvg, listText, type PatternExport } from '../lib/export';
import type { Pref } from '../lib/process';
import { summarize } from '../lib/process';
import { loadPref, savePref, type ExportSettings } from '../lib/storage';
import type { Bead, Project } from '../types';

export function AboutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet short" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <h2>豆丸怎么干活</h2>
        <p>图纸在手机里算好。选图、裁切、对色号，都不会上传。</p>
        <p>只有点了「变可爱」里的 AI，图片才会先存到腾讯云，再交给 Kie 改图。</p>
        <p>去背景用边缘识色，不下载大模型。色号来自公开色卡，屏幕颜色和实物会有一点差别。</p>
        <button className="btn btn-primary btn-block" onClick={onClose}>
          知道啦
        </button>
      </div>
    </div>
  );
}

export function Confirm({
  text,
  ok,
  onOk,
  onCancel,
}: {
  text: string;
  ok: string;
  onOk: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="backdrop" onClick={onCancel}>
      <div className="sheet short" onClick={(event) => event.stopPropagation()}>
        <h2>{text}</h2>
        <div className="pair">
          <button className="btn btn-ghost" onClick={onCancel}>
            先留着
          </button>
          <button className="btn btn-primary" onClick={onOk}>
            {ok}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ColorPickSheet({
  palette,
  selected,
  onPick,
  onEdit,
  onClose,
}: {
  palette: Bead[];
  selected: number;
  onPick: (index: number) => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const items = palette
    .map((bead, index) => ({ bead, index }))
    .filter((item) => item.bead.code.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>选一颗豆子</h2>
          <button className="text-btn" onClick={onClose}>
            完成
          </button>
        </div>
        <input className="search" value={query} placeholder="搜色号" onChange={(event) => setQuery(event.target.value)} />
        <div className="swatch-grid">
          {items.map((item) => (
            <button
              key={`${item.bead.code}-${item.index}`}
              className={item.index === selected ? 'swatch on' : 'swatch'}
              style={{ background: item.bead.hex }}
              onClick={() => onPick(item.index)}
            >
              {item.bead.code}
            </button>
          ))}
        </div>
        <button className="text-btn left" onClick={onEdit}>
          编辑色板，下次生成时生效
        </button>
      </div>
    </div>
  );
}

export function PaletteEditor({
  systemId,
  variantId,
  onClose,
}: {
  systemId: string;
  variantId: string;
  onClose: () => void;
}) {
  const variant = getVariant(systemId, variantId);
  const [pref, setPref] = useState<Pref>(() => loadPref(systemId, variantId));
  const [query, setQuery] = useState('');
  const [code, setCode] = useState('');
  const [hex, setHex] = useState('#F7B7C4');
  const needle = query.trim().toLowerCase();

  const update = (next: Pref) => {
    setPref(next);
    savePref(systemId, variantId, next);
  };

  const colors = useMemo(
    () => variant.colors.filter((item) => !needle || item.code.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle)),
    [variant.colors, needle],
  );

  let lastGroup = '';
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>色板</h2>
          <button className="text-btn" onClick={onClose}>
            完成
          </button>
        </div>
        <p className="hint left">关掉的颜色，下次生成时不会用到。对不上的公开色号已经先拿掉了。</p>
        <input className="search" value={query} placeholder="搜色号" onChange={(event) => setQuery(event.target.value)} />
        <div className="custom-row">
          <input type="color" value={hex} aria-label="自定义颜色" onChange={(event) => setHex(event.target.value)} />
          <input value={code} maxLength={8} placeholder="色号名" onChange={(event) => setCode(event.target.value)} />
          <button
            className="btn btn-small"
            onClick={() => {
              const name = code.trim();
              if (!name || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
              if (variant.colors.some((item) => item.code === name) || pref.custom.some((item) => item[0] === name)) return;
              update({ ...pref, custom: [...pref.custom, [name, hex.toUpperCase()]] });
              setCode('');
            }}
          >
            加入
          </button>
        </div>
        <div className="swatch-grid">
          {colors.map((item) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            const off = pref.disabled.includes(item.code);
            return (
              <span key={item.code} className="swatch-slot">
                {showGroup && <em>{item.group}</em>}
                <button className={off ? 'swatch off' : 'swatch'} style={{ background: item.hex }} onClick={() => {
                  const disabled = off ? pref.disabled.filter((id) => id !== item.code) : [...pref.disabled, item.code];
                  update({ ...pref, disabled });
                }}>
                  {item.code}
                </button>
              </span>
            );
          })}
        </div>
        {!!pref.custom.length && (
          <div className="swatch-grid">
            {pref.custom.map(([name, color]) => (
              <button key={name} className="swatch" style={{ background: color }} onClick={() => update({ ...pref, custom: pref.custom.filter((item) => item[0] !== name) })}>
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function UsedColorsSheet({
  colors,
  onClose,
}: {
  colors: { code: string; hex: string; group: string }[] | null;
  onClose: () => void;
}) {
  const groups: string[] = [];
  for (const item of colors ?? []) if (!groups.includes(item.group)) groups.push(item.group);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet used-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>用到的颜色</h2>
          <button className="text-btn" onClick={onClose}>
            完成
          </button>
        </div>
        <div className="used-body">
          {colors === null ? (
            <p className="hint left">正在统计用到的颜色</p>
          ) : colors.length === 0 ? (
            <p className="hint left">这张图还没对上颜色</p>
          ) : (
            groups.map((group) => {
              const beads = colors.filter((item) => item.group === group);
              return (
                <section key={group} className="swatch-section" data-group={group}>
                  <header>
                    <b>{group}</b>
                    <span>{beads.length} 色</span>
                  </header>
                  <div className="swatch-beads">
                    {beads.map((item) => (
                      <div key={item.code} className="swatch-cell">
                        <i style={{ background: item.hex }} />
                        <span>{item.code}</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function ListSheet({
  project,
  settings,
  onSettings,
  onDenoise,
  onFocus,
  onClose,
  onToast,
}: {
  project: Project;
  settings: ExportSettings;
  onSettings: (settings: ExportSettings) => void;
  onDenoise: () => void;
  onFocus: (index: number) => void;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const stats = summarize(project.cells, project.palette);
  const pack = (): PatternExport => ({
    cells: project.cells,
    cols: project.cols,
    rows: project.rows,
    palette: project.palette,
    title: project.systemLabel,
    ...settings,
  });
  const max = stats.items[0]?.count ?? 1;
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>清单和导出</h2>
          <button className="text-btn" onClick={onClose}>
            关闭
          </button>
        </div>
        <p className="num list-total">共 {stats.total} 颗</p>
        <div className="export-row">
          <button className="btn btn-small" onClick={() => downloadPng(pack())}>
            PNG 图纸
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => downloadSvg(pack())}>
            SVG
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => downloadCsv(pack())}>
            CSV 清单
          </button>
        </div>
        <button
          className="text-btn left"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(listText(pack()));
              onToast('清单已复制');
            } catch {
              onToast('没能复制，可以改用 CSV');
            }
          }}
        >
          复制采购清单
        </button>
        <div className="toggle-row">
          <Toggle label="写色号" on={settings.showCode} onClick={() => onSettings({ ...settings, showCode: !settings.showCode })} />
          <Toggle label="格子线" on={settings.showGrid} onClick={() => onSettings({ ...settings, showGrid: !settings.showGrid })} />
          <Toggle label="图例" on={settings.showLegend} onClick={() => onSettings({ ...settings, showLegend: !settings.showLegend })} />
        </div>
        <div className="chip-row">
          {[14, 18, 26].map((cell) => (
            <button key={cell} className={settings.cell === cell ? 'chip on' : 'chip'} onClick={() => onSettings({ ...settings, cell })}>
              {cell === 14 ? '小格' : cell === 18 ? '中格' : '大格'}
            </button>
          ))}
        </div>
        <button className="text-btn left" onClick={onDenoise}>
          再清一轮杂点
        </button>
        <div className="stat-list">
          {stats.items.map((item) => (
            <button key={item.bead.code} className="stat-row" onClick={() => onFocus(item.index)}>
              <i style={{ background: item.bead.hex }} />
              <b className="num">{item.bead.code}</b>
              <span>
                <em style={{ width: `${(item.count / max) * 100}%` }} />
              </span>
              <strong className="num">{item.count}</strong>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button className={on ? 'toggle on' : 'toggle'} onClick={onClick} aria-pressed={on}>
      {label}
    </button>
  );
}
