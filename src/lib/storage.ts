import { toBead } from './color';
import type { Pref } from './process';
import type { Bead, Project } from '../types';

const DRAFT = 'doudoumaru.draft.v1';
const PREFS = 'doudoumaru.prefs.v1';
const EXPORTS = 'doudoumaru.export.v1';
const TIP = 'doudoumaru.tip.v1';

export type ExportSettings = {
  showCode: boolean;
  showGrid: boolean;
  showLegend: boolean;
  cell: number;
};

const defaultExport: ExportSettings = { showCode: true, showGrid: true, showLegend: true, cell: 18 };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage */
  }
}

export function hasDraft() {
  return !!localStorage.getItem(DRAFT);
}

export function saveDraft(project: Project) {
  writeJson(DRAFT, {
    cols: project.cols,
    rows: project.rows,
    cells: Array.from(project.cells),
    palette: project.palette.map((b) => [b.code, b.hex]),
    systemId: project.systemId,
    variantId: project.variantId,
    systemLabel: project.systemLabel,
  });
}

export function loadDraft(): Project | null {
  const data = readJson<{
    cols: number;
    rows: number;
    cells: number[];
    palette: [string, string][];
    systemId: string;
    variantId: string;
    systemLabel: string;
  }>(DRAFT);
  if (!data?.cells || !data.palette?.length) return null;
  const palette: Bead[] = data.palette.map(([code, hex]) => toBead(code, hex));
  return {
    cols: data.cols,
    rows: data.rows,
    cells: Int16Array.from(data.cells),
    palette,
    systemId: data.systemId,
    variantId: data.variantId,
    systemLabel: data.systemLabel,
  };
}

export function clearDraft() {
  localStorage.removeItem(DRAFT);
}

type PrefMap = Record<string, Pref>;

function prefKey(systemId: string, variantId: string) {
  return `${systemId}:${variantId}`;
}

export function loadPref(systemId: string, variantId: string): Pref {
  const all = readJson<PrefMap>(PREFS) ?? {};
  const pref = all[prefKey(systemId, variantId)];
  return { disabled: pref?.disabled ?? [], custom: pref?.custom ?? [] };
}

export function savePref(systemId: string, variantId: string, pref: Pref) {
  const all = readJson<PrefMap>(PREFS) ?? {};
  all[prefKey(systemId, variantId)] = pref;
  writeJson(PREFS, all);
}

export function loadExportSettings(): ExportSettings {
  return { ...defaultExport, ...(readJson<Partial<ExportSettings>>(EXPORTS) ?? {}) };
}

export function saveExportSettings(settings: ExportSettings) {
  writeJson(EXPORTS, settings);
}

export function tipSeen() {
  return localStorage.getItem(TIP) === '1';
}

export function markTip() {
  localStorage.setItem(TIP, '1');
}
