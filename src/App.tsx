import { useEffect, useRef, useState } from 'react';
import { History } from './components/History';
import { AboutSheet, Confirm, ListSheet, PaletteEditor } from './components/Sheets';
import { FocusMode } from './components/FocusMode';
import { Home } from './components/Home';
import { Mascot } from './components/Mascot';
import { Prep } from './components/Prep';
import { Setup } from './components/Setup';
import { Studio } from './components/Studio';
import { getSystem, getVariant } from './data/palettes';
import { aiEdit, keepsBackground, mediaProxy, uploadImage } from './lib/api';
import { ASPECTS, cropForAspect, type AspectId } from './lib/crop';
import { bitmapFromRaster, blobForUpload, gridCell, loadImage, rasterFromBitmap } from './lib/image';
import { denoise, fitGrid, generatePattern, makePalette, pixelColorCount, removeBackground, toPixelArt } from './lib/process';
import { hasHistory, loadExportSettings, loadHistoryProject, loadPref, saveDraft, saveExportSettings } from './lib/storage';
import type { Crop, Project, Treat } from './types';
import { FULL_CROP } from './types';

const START_CROP: Crop = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };

export function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const history = useRef<Int16Array[]>([]);
  const [step, setStep] = useState<'home' | 'history' | 'prep' | 'setup' | 'studio'>('home');
  const resumeFrom = useRef<'home' | 'history'>('home');
  const [original, setOriginal] = useState<ImageBitmap | null>(null);
  const [working, setWorking] = useState<ImageBitmap | null>(null);
  const [crop, setCrop] = useState<Crop>(START_CROP);
  const [treat, setTreat] = useState<Treat>('direct');
  const [painting, setPainting] = useState(false);
  const [styled, setStyled] = useState(false);
  const styleBase = useRef<ImageBitmap | null>(null);
  const styleCrop = useRef<Crop | null>(null);
  const generatedImage = useRef<ImageBitmap | null>(null);
  const generatedCrop = useRef<Crop | null>(null);
  const directCrop = useRef<Crop | null>(null);
  const styleViewCrop = useRef<Crop | null>(null);
  const [aspectId, setAspectId] = useState<AspectId>('free');
  const [knockout, setKnockout] = useState(false);
  const beforeKnockout = useRef<ImageBitmap | null>(null);
  const [longSide, setLongSide] = useState(32);
  const [pixelSize, setPixelSize] = useState(128);
  const [systemId, setSystemId] = useState('mard');
  const [variantId, setVariantId] = useState('221');
  const [merge, setMerge] = useState(8);
  const [noise, setNoise] = useState(1);
  const [project, setProject] = useState<Project | null>(null);
  const [editRev, setEditRev] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [exportSettings, setExportSettings] = useState(loadExportSettings);
  const [ask, setAsk] = useState<{ text: string; ok: string; run: () => void } | null>(null);
  const toastTimer = useRef(0);

  useEffect(() => {
    setDraftReady(hasHistory());
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  };

  const openBitmap = (bitmap: ImageBitmap) => {
    setOriginal(bitmap);
    setWorking(bitmap);
    setCrop(START_CROP);
    setAspectId('free');
    setTreat('direct');
    setKnockout(false);
    setStyled(false);
    setPainting(false);
    styleBase.current = null;
    styleCrop.current = null;
    generatedImage.current = null;
    generatedCrop.current = null;
    directCrop.current = null;
    styleViewCrop.current = null;
    beforeKnockout.current = null;
    setStep('prep');
  };

  const touch = () => {
    if (!project) return;
    saveDraft(project);
    setDirty(true);
    setDraftReady(true);
    setEditRev((value) => value + 1);
  };

  const rememberStroke = () => {
    if (!project) return;
    history.current.push(project.cells.slice());
    if (history.current.length > 30) history.current.shift();
    setCanUndo(true);
  };

  const undo = () => {
    const prev = history.current.pop();
    if (!prev || !project) return;
    project.cells.set(prev);
    setCanUndo(history.current.length > 0);
    touch();
  };

  const generate = async () => {
    if (!working) return;
    const variant = getVariant(systemId, variantId);
    const palette = makePalette(variant.colors, loadPref(systemId, variant.id));
    if (palette.length < 2) {
      showToast('色板太空了，至少留两种颜色');
      return;
    }
    setBusy('正在数格子…');
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const aspect = (working.width * crop.w) / Math.max(1, working.height * crop.h);
      const { cols, rows } = fitGrid(longSide, aspect);
      const raster = rasterFromBitmap(working, crop, 720);
      const cells = generatePattern(raster, palette, {
        cols,
        rows,
        pooling: 'average',
        mergeDelta: merge,
        denoise: noise,
      });
      const next: Project = {
        id: crypto.randomUUID(),
        cols,
        rows,
        cells,
        palette,
        systemId,
        variantId: variant.id,
        systemLabel: `${getSystem(systemId).name} · ${palette.length} 色`,
      };
      resumeFrom.current = 'home';
      history.current = [];
      setCanUndo(false);
      setDirty(false);
      setProject(next);
      saveDraft(next);
      setDraftReady(true);
      setGeneration((value) => value + 1);
      setEditRev((value) => value + 1);
      setStep('studio');
    } finally {
      setBusy(null);
    }
  };

  const requestGenerate = () => {
    if (dirty && project) {
      setAsk({
        text: '重新生成会盖掉手动改过的格子',
        ok: '重新生成',
        run: () => {
          setAsk(null);
          void generate();
        },
      });
      return;
    }
    void generate();
  };

  return (
    <div className="shell">
      <div className="phone">
        {step === 'home' && (
          <Home
            hasDraft={draftReady}
            onPick={() => fileRef.current?.click()}
            onHistory={() => setStep('history')}
            onAbout={() => setAbout(true)}
          />
        )}
        {step === 'history' && (
          <History
            onBack={() => setStep('home')}
            onOpen={(id) => {
              const draft = loadHistoryProject(id);
              if (!draft) return;
              history.current = [];
              setCanUndo(false);
              setDirty(false);
              setProject(draft);
              setSystemId(draft.systemId);
              setVariantId(draft.variantId);
              resumeFrom.current = 'history';
              setGeneration((value) => value + 1);
              setStep('studio');
            }}
          />
        )}
        {step === 'prep' && working && (
          <Prep
            image={working}
            crop={crop}
            treat={treat}
            aspectId={aspectId}
            knockout={knockout}
            canRestore={working !== original}
            generating={painting}
            pixelSize={pixelSize}
            styled={styled}
            onCrop={setCrop}
            onTreat={(next) => {
              if (painting || next === treat) return;
              if (!generatedImage.current) {
                setTreat(next);
                return;
              }
              if (next === 'direct') {
                if (!original) return;
                styleViewCrop.current = crop;
                setWorking(original);
                setKnockout(false);
                setCrop(directCrop.current ?? START_CROP);
                setTreat('direct');
                return;
              }
              directCrop.current = crop;
              setWorking(generatedImage.current);
              setCrop(styleViewCrop.current ?? generatedCrop.current ?? START_CROP);
              setTreat('style');
            }}
            onReset={() => {
              if (!generatedImage.current || !generatedCrop.current) return;
              setWorking(generatedImage.current);
              styleViewCrop.current = generatedCrop.current;
              setCrop(generatedCrop.current);
              setKnockout(false);
            }}
            onAspect={(id) => {
              setAspectId(id);
              const item = ASPECTS.find((entry) => entry.id === id);
              if (item?.value) setCrop(cropForAspect(working.width, working.height, item.value));
            }}
            onKnockoutChange={(on) => {
              if (!on) {
                const prev = beforeKnockout.current;
                beforeKnockout.current = null;
                setKnockout(false);
                if (prev) setWorking(prev);
                return;
              }
              void (async () => {
                setBusy('正在找背景…');
                try {
                  const raster = rasterFromBitmap(working, FULL_CROP, 640);
                  const { raster: next, removedRatio } = removeBackground(raster);
                  if (removedRatio < 0.02) {
                    showToast('没找到好分开的纯色背景');
                    return;
                  }
                  if (removedRatio > 0.97) {
                    showToast('背景和主体太像了，可以切到风格化再去掉背景');
                    return;
                  }
                  beforeKnockout.current = working;
                  setWorking(await bitmapFromRaster(next));
                  setKnockout(true);
                  showToast('纯色背景已经空出来了');
                } finally {
                  setBusy(null);
                }
              })();
            }}
            onRestore={() => {
              if (!original) return;
              const item = ASPECTS.find((entry) => entry.id === aspectId);
              const next = item?.value ? cropForAspect(original.width, original.height, item.value) : START_CROP;
              directCrop.current = next;
              setWorking(original);
              setCrop(next);
              setKnockout(false);
              beforeKnockout.current = null;
            }}
            onPixelSize={(size) => {
              setPixelSize(size);
              setLongSide(size);
            }}
            onNote={showToast}
            onGenerate={(preset) => {
              const pixels = pixelSize;
              void (async () => {
                if (!styleBase.current) {
                  styleBase.current = working;
                  styleCrop.current = crop;
                  directCrop.current = crop;
                }
                const base = styleBase.current;
                const baseCrop = styleCrop.current ?? crop;
                setPainting(true);
                try {
                  const blob = await blobForUpload(base, baseCrop);
                  const url = await uploadImage(blob);
                  const result = await aiEdit(url, preset.id, pixels);
                  const image = await loadImage(mediaProxy(result));
                  const fresh = await createImageBitmap(image);
                  let raster = rasterFromBitmap(fresh, FULL_CROP, Math.max(fresh.width, fresh.height));
                  let cutoutNote = keepsBackground(preset.id) ? '新图好了，可以再裁一裁' : '新图好了，背景也去掉了';
                  if (!keepsBackground(preset.id)) {
                    const { raster: next, removedRatio } = removeBackground(raster);
                    if (removedRatio < 0.02) cutoutNote = '新图好了，但没找到好分开的背景';
                    else raster = next;
                  }
                  const outGrid = fitGrid(pixels, fresh.width / fresh.height);
                  const bitmap = await bitmapFromRaster(
                    toPixelArt(raster, outGrid.cols, outGrid.rows, gridCell(outGrid), pixelColorCount(pixels)),
                  );
                  setLongSide(pixels);
                  const item = ASPECTS.find((entry) => entry.id === aspectId);
                  const nextCrop = item?.value ? cropForAspect(bitmap.width, bitmap.height, item.value) : FULL_CROP;
                  generatedImage.current = bitmap;
                  generatedCrop.current = nextCrop;
                  styleViewCrop.current = nextCrop;
                  setWorking(bitmap);
                  setCrop(nextCrop);
                  setKnockout(false);
                  beforeKnockout.current = null;
                  setStyled(true);
                  showToast(cutoutNote);
                } catch (error) {
                  showToast(error instanceof Error ? error.message : 'AI 没做成');
                } finally {
                  setPainting(false);
                }
              })();
            }}
            onBack={() => setStep('home')}
            onNext={() => setStep('setup')}
          />
        )}
        {step === 'setup' && working && (
          <Setup
            image={working}
            crop={crop}
            longSide={longSide}
            systemId={systemId}
            variantId={variantId}
            merge={merge}
            denoise={noise}
            hasProject={!!project}
            onLongSide={(value) => {
              const next = Math.max(12, Math.min(256, value));
              setLongSide(next);
              setPixelSize(next);
            }}
            onSystem={(id) => {
              setSystemId(id);
              const system = getSystem(id);
              if (!system.variants.some((item) => item.id === variantId)) setVariantId(system.variants[0].id);
            }}
            onVariant={setVariantId}
            onMerge={setMerge}
            onDenoise={setNoise}
            onBack={() => setStep('prep')}
            onGenerate={requestGenerate}
          />
        )}
        {step === 'studio' && project && (
          <Studio
            key={generation}
            project={project}
            editRev={editRev}
            canUndo={canUndo}
            onStrokeStart={rememberStroke}
            onEdited={touch}
            onUndo={undo}
            onBack={() => setStep(resumeFrom.current === 'history' ? 'history' : working ? 'setup' : 'home')}
          />
        )}
        {focusIndex !== null && project && (
          <FocusMode
            project={project}
            editRev={editRev}
            colorIndex={focusIndex}
            onChange={setFocusIndex}
            onClose={() => setFocusIndex(null)}
          />
        )}
        {about && <AboutSheet onClose={() => setAbout(false)} />}
        {paletteOpen && (
          <PaletteEditor systemId={systemId} variantId={variantId} onClose={() => setPaletteOpen(false)} />
        )}
        {listOpen && project && (
          <ListSheet
            project={project}
            settings={exportSettings}
            onSettings={(settings) => {
              setExportSettings(settings);
              saveExportSettings(settings);
            }}
            onDenoise={() => {
              rememberStroke();
              denoise(project.cells, project.cols, project.rows, 2);
              touch();
              showToast('又清了一轮杂点');
            }}
            onFocus={(index) => {
              setListOpen(false);
              setFocusIndex(index);
            }}
            onClose={() => setListOpen(false)}
            onToast={showToast}
          />
        )}
        {ask && (
          <Confirm
            text={ask.text}
            ok={ask.ok}
            onCancel={() => setAsk(null)}
            onOk={ask.run}
          />
        )}
        {busy && (
          <div className="busy">
            <Mascot mood="think" />
            <p>{busy}</p>
          </div>
        )}
        {toast && <div className="toast">{toast}</div>}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void createImageBitmap(file, { imageOrientation: 'from-image' })
              .then(openBitmap)
              .catch(() => showToast('这个格式打不开，换 jpg 或 png'));
          }}
        />
      </div>
    </div>
  );
}
