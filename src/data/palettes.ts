import mard221 from './mard221.json';
import mard291 from './mard291.json';
import coco from './coco.json';
import manman from './manman.json';
import panpan from './panpan.json';
import mixiaowo from './mixiaowo.json';
import type { Swatch } from '../types';

type Row = [string, string, string];

function rows(data: Row[]): Swatch[] {
  return data.map(([code, hex, group]) => ({ code, hex, group }));
}

export type Variant = { id: string; label: string; colors: Swatch[] };
export type System = { id: string; name: string; variants: Variant[] };

export const SYSTEMS: System[] = [
  {
    id: 'mard',
    name: 'MARD',
    variants: [
      { id: '221', label: '221', colors: rows(mard221 as Row[]) },
      { id: '291', label: '291', colors: rows(mard291 as Row[]) },
    ],
  },
  { id: 'coco', name: 'COCO', variants: [{ id: '291', label: '291', colors: rows(coco as Row[]) }] },
  { id: 'manman', name: '漫漫', variants: [{ id: '278', label: '278', colors: rows(manman as Row[]) }] },
  { id: 'panpan', name: '盼盼', variants: [{ id: '285', label: '色卡', colors: rows(panpan as Row[]) }] },
  { id: 'mixiaowo', name: '咪小窝', variants: [{ id: '286', label: '色卡', colors: rows(mixiaowo as Row[]) }] },
];

export function getSystem(id: string) {
  return SYSTEMS.find((item) => item.id === id) ?? SYSTEMS[0];
}

export function getVariant(systemId: string, variantId: string) {
  const system = getSystem(systemId);
  return system.variants.find((item) => item.id === variantId) ?? system.variants[0];
}
