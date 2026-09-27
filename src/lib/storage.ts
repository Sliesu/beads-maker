import { toBead } from './color';
import type { Pref } from './process';
import type { Bead, Project } from '../types';

const DRAFT = 'doudoumaru.draft.v1';
const HISTORY = 'doudoumaru.history.v1';
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

export type HistoryRecord = {
  id: string;
  updatedAt: number;
  name: string;
  cols: number;
  rows: number;
  cells: number[];
  palette: [string, string][];
  systemId: string;
  variantId: string;
  systemLabel: string;
};

function toRecord(project: Project, updatedAt: number): HistoryRecord {
  return {
    id: project.id || crypto.randomUUID(),
    updatedAt,
    name: project.name ?? '',
    cols: project.cols,
    rows: project.rows,
    cells: Array.from(project.cells),
    palette: project.palette.map((bead) => [bead.code, bead.hex]),
    systemId: project.systemId,
    variantId: project.variantId,
    systemLabel: project.systemLabel,
  };
}

function toProject(data: HistoryRecord): Project {
  const palette: Bead[] = data.palette.map(([code, hex]) => toBead(code, hex));
  return {
    id: data.id,
    cols: data.cols,
    rows: data.rows,
    cells: Int16Array.from(data.cells),
    palette,
    systemId: data.systemId,
    variantId: data.variantId,
    systemLabel: data.systemLabel,
    name: data.name || undefined,
  };
}

function readHistory(): HistoryRecord[] {
  return (readJson<HistoryRecord[]>(HISTORY) ?? []).filter((item) => item?.id && item.cells?.length && item.palette?.length);
}

function migrateDraft(): HistoryRecord | null {
  const data = readJson<Omit<HistoryRecord, 'id' | 'updatedAt'> & { id?: string; updatedAt?: number; name?: string }>(DRAFT);
  if (!data?.cells?.length || !data.palette?.length) return null;
  const entry: HistoryRecord = {
    id: data.id || crypto.randomUUID(),
    updatedAt: data.updatedAt || Date.now(),
    name: data.name ?? '',
    cols: data.cols,
    rows: data.rows,
    cells: data.cells,
    palette: data.palette,
    systemId: data.systemId,
    variantId: data.variantId,
    systemLabel: data.systemLabel,
  };
  writeJson(HISTORY, [entry]);
  localStorage.removeItem(DRAFT);
  return entry;
}

export function listHistory() {
  const saved = readHistory();
  const list = saved.length ? saved : [migrateDraft()].filter((item): item is HistoryRecord => !!item);
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function hasHistory() {
  return listHistory().length > 0;
}

export function loadHistoryProject(id: string) {
  const found = listHistory().find((item) => item.id === id);
  return found ? toProject(found) : null;
}

export function saveDraft(project: Project) {
  if (!project.id) project.id = crypto.randomUUID();
  const entry = toRecord(project, Date.now());
  const next = [entry, ...readHistory().filter((item) => item.id !== entry.id)].slice(0, 20);
  writeJson(HISTORY, next);
}

export function hasDraft() {
  return hasHistory();
}

export function loadDraft(): Project | null {
  const [latest] = listHistory();
  return latest ? toProject(latest) : null;
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
