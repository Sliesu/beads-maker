import type { Crop } from '../types';
import type { Raster } from './process';

type Sized = CanvasImageSource & { width: number; height: number };

export function rasterFromBitmap(image: Sized, crop: Crop, maxEdge = 720): Raster {
  const sx = crop.x * image.width;
  const sy = crop.y * image.height;
  const sw = Math.max(1, crop.w * image.width);
  const sh = Math.max(1, crop.h * image.height);
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('画布不可用');
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  return { data: imageData.data, width: w, height: h };
}

export async function bitmapFromRaster(raster: Raster) {
  const canvas = document.createElement('canvas');
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('画布不可用');
  const copy = new Uint8ClampedArray(raster.data);
  ctx.putImageData(new ImageData(copy, raster.width, raster.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('图片导出失败');
  return createImageBitmap(blob);
}

export function gridCell(grid: { cols: number; rows: number }) {
  return Math.max(1, Math.floor(1024 / Math.max(grid.cols, grid.rows)));
}

export async function blobForUpload(image: Sized, crop: Crop, grid?: { cols: number; rows: number }) {
  const max = 1280;
  const sw = Math.max(1, crop.w * image.width);
  const sh = Math.max(1, crop.h * image.height);
  const scale = Math.min(1, max / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画布不可用');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, crop.x * image.width, crop.y * image.height, sw, sh, 0, 0, canvas.width, canvas.height);
  if (!grid) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) throw new Error('图片导出失败');
    return blob;
  }
  const small = document.createElement('canvas');
  small.width = grid.cols;
  small.height = grid.rows;
  const smallCtx = small.getContext('2d');
  if (!smallCtx) throw new Error('画布不可用');
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.imageSmoothingQuality = 'high';
  smallCtx.drawImage(canvas, 0, 0, grid.cols, grid.rows);
  const cell = gridCell(grid);
  const big = document.createElement('canvas');
  big.width = grid.cols * cell;
  big.height = grid.rows * cell;
  const bigCtx = big.getContext('2d');
  if (!bigCtx) throw new Error('画布不可用');
  bigCtx.imageSmoothingEnabled = false;
  bigCtx.drawImage(small, 0, 0, big.width, big.height);
  const blob = await new Promise<Blob | null>((resolve) => big.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('图片导出失败');
  return blob;
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片打不开'));
    img.src = src;
  });
}
