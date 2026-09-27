import { useState } from 'react';
import { AI_PRESETS, PIXEL_STEPS } from '../lib/api';
import { ASPECTS, type AspectId } from '../lib/crop';
import type { Crop, Treat } from '../types';
import { CropStage } from './CropStage';

type Preset = (typeof AI_PRESETS)[number];

type Props = {
  image: ImageBitmap;
  crop: Crop;
  treat: Treat;
  aspectId: AspectId;
  knockout: boolean;
  canRestore: boolean;
  generating: boolean;
  pixelSize: number;
  styled: boolean;
  onCrop: (crop: Crop) => void;
  onTreat: (treat: Treat) => void;
  onAspect: (id: AspectId) => void;
  onKnockoutChange: (on: boolean) => void;
  onRestore: () => void;
  onReset: () => void;
  onGenerate: (preset: Preset) => void;
  onPixelSize: (size: number) => void;
  onNote: (text: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export function Prep(props: Props) {
  const { treat } = props;
  const [styleId, setStyleId] = useState<Preset['id'] | null>(null);
  const [pixelHelp, setPixelHelp] = useState(false);
  const aspect = ASPECTS.find((item) => item.id === props.aspectId)?.value ?? null;
  const preset = AI_PRESETS.find((item) => item.id === styleId) ?? null;
  const generate = () => {
    if (!preset || props.generating) return;
    props.onGenerate(preset);
  };
  return (
    <section className="screen">
      <header className="topbar">
        <button className="text-btn" onClick={props.onBack}>
          返回
        </button>
        <strong>裁一裁</strong>
        <span />
      </header>
      <div className="screen-body prep-body">
        <CropStage
          image={props.image}
          crop={props.crop}
          aspect={aspect}
          generating={props.generating}
          onChange={props.onCrop}
        />
        <p className="hint">拖动方框，拉角可以改大小</p>
        <div className="chip-row scroll">
          {ASPECTS.map((item) => (
            <button
              key={item.id}
              className={props.aspectId === item.id ? 'chip on' : 'chip'}
              onClick={() => props.onAspect(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mode-row">
          <button
            className={treat === 'direct' ? 'mode-card on' : 'mode-card'}
            disabled={props.generating}
            onClick={() => props.onTreat('direct')}
          >
            <b>原图</b>
            <span>直接转</span>
          </button>
          <button
            className={treat === 'style' ? 'mode-card on' : 'mode-card'}
            disabled={props.generating}
            onClick={() => props.onTreat('style')}
          >
            <b>风格化</b>
            <span>AI 改图</span>
          </button>
        </div>
        {treat === 'style' && (
          <div className="chip-row scroll style-row">
            {AI_PRESETS.map((item) => (
              <button
                key={item.id}
                className={styleId === item.id ? 'style-card on' : 'style-card'}
                disabled={props.generating}
                onClick={() => setStyleId(item.id)}
              >
                <img src={item.preview} alt="" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
        {treat === 'style' && (
          <>
            <div className="gen-size-block">
              <p className="hint">生成画质</p>
              <div className="gen-size" role="group" aria-label="生成画质">
                <button type="button" className="chip on" disabled={props.generating}>
                  1K
                </button>
                <button type="button" className="chip locked" onClick={() => props.onNote('2K 还没开放')}>
                  <svg className="lock-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  2K
                </button>
              </div>
            </div>
            <div className="gen-pixel-block">
              <p className="hint hint-line">
                像素度
                <button type="button" className="info-dot" aria-label="像素度说明" onClick={() => setPixelHelp(true)}>
                  ?
                </button>
              </p>
              <div className="chip-row scroll" role="group" aria-label="像素度">
                {PIXEL_STEPS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={props.pixelSize === size ? 'chip on' : 'chip'}
                    disabled={props.generating}
                    onClick={() => props.onPixelSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {treat !== 'style' && (
          <div className="inline-actions">
            <label className="check-line">
              <input
                type="checkbox"
                checked={props.knockout}
                onChange={(event) => props.onKnockoutChange(event.target.checked)}
              />
              <span className="check-box" aria-hidden />
              <span>去掉纯色背景</span>
            </label>
            {props.canRestore && (
              <button className="text-btn" onClick={props.onRestore}>
                恢复原图
              </button>
            )}
          </div>
        )}
      </div>
      <div className="screen-foot">
        {treat === 'style' ? (
          <>
            {props.styled ? (
              <div className="foot-split">
                <button className="btn btn-ghost" disabled={props.generating || !preset} onClick={generate}>
                  重新生成
                </button>
                <button className="btn btn-ghost" disabled={props.generating} onClick={props.onReset}>
                  重置
                </button>
              </div>
            ) : (
              <button className="btn btn-primary btn-block" disabled={props.generating || !preset} onClick={generate}>
                {props.generating ? '生成中…' : '生成'}
              </button>
            )}
            {props.styled && (
              <button className="btn btn-primary btn-block" disabled={props.generating} onClick={props.onNext}>
                选尺寸和色号
              </button>
            )}
          </>
        ) : (
          <button className="btn btn-primary btn-block" onClick={props.onNext}>
            选尺寸和色号
          </button>
        )}
      </div>
      {pixelHelp && (
        <div className="backdrop" onClick={() => setPixelHelp(false)}>
          <div className="sheet short" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <h2>像素度</h2>
            <p>数字越小，格子越大，图更简单，更好拼。</p>
            <p>数字越大，细节越多，后面要用的豆子也更多。</p>
            <p>它只管 AI 画出来的粗细。图纸的颗数，到下一页还可以再改。</p>
            <button className="btn btn-primary btn-block" onClick={() => setPixelHelp(false)}>
              知道啦
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
