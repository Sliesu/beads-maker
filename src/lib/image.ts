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

export async function blobForUpload(image: Sized, crop: Crop) {
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
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
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
