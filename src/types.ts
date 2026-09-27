export type RGB = [number, number, number];
export type Lab = [number, number, number];

export type Bead = {
  code: string;
  hex: string;
  rgb: RGB;
  lab: Lab;
};

export type Swatch = {
  code: string;
  hex: string;
  group: string;
};

export type Crop = { x: number; y: number; w: number; h: number };

export type Pooling = 'average' | 'center' | 'median' | 'mode';

export type Treat = 'direct' | 'style';

export type Tool = 'paint' | 'eraser' | 'replace' | 'lens';

export type Project = {
  id?: string;
  cols: number;
  rows: number;
  cells: Int16Array;
  palette: Bead[];
  systemId: string;
  variantId: string;
  systemLabel: string;
  name?: string;
};

export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 };

export const EMPTY = -1;
