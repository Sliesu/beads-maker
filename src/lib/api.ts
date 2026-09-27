export const CUTOUT_PROMPT =
  'Remove the background completely and replace it with a flat pure white background. Keep the main subject centered, with clean edges, no cast shadow, no text, and no watermark.';

export const AI_PRESETS = [
  {
    id: 'toon',
    label: '像素卡通',
    preview: '/styles/px-toon2.png',
    prompt:
      'Redraw the main subject as a very simple cute cartoon for perler beads. Use huge square pixels and only a few flat colors: orange, cream, black, and pink blush. Thick black outline, big eyes made of a few squares. No gray shading, no gradients, no tiny detail. White background. No text, no watermark.',
  },

  {
    id: 'voxel',
    label: '像素写实',
    preview: '/styles/px-iso.png',
    prompt:
      'Redraw the main subject as flat 2D pixel art that only imitates 3D, so it can be built with perler beads. It must be one flat sprite, not a 3D model and not real cubes. Use a three-quarter view and two or three flat shades, lighter on top and darker along the right and bottom, to suggest thickness. Hard square pixels on a 128 by 128 grid, white background, no perspective, no drop shadow, no extruded blocks. No text, no watermark.',
  },
  {
    id: 'flat',
    label: '像素扁平',
    preview: '/styles/px-flat.png',
    prompt:
      'Redraw the main subject as simple flat pixel art with a clear black pixel outline around the whole shape. Use only a few flat colors, large square pixels, and almost no interior detail. White background. Must stay pixelated and easy to build with perler beads. No text, no watermark.',
  }, 
  {
    id: 'comic',
    label: '红白机',
    preview: '/styles/px-comic2.png',
    prompt:
      'Redraw the main subject as a very simple pixel manga for perler beads. Huge square pixels, flat orange and cream only, thick black outline, and simple black square eyes. No iris detail, no toes, no gradients, no shading. White background. No speech bubbles, no text, no watermark.',
  }, 
  {
    id: 'minimal',
    label: '抽象简约',
    preview: '/styles/px-minimal.png',
    prompt:
      'Redraw the main subject as an ultra-simple abstract icon of huge geometric color blocks. No outline stroke, no curves, no texture, no gradients. A few solid rectangles only, like a blocky pixel mascot, on a white background. Easy to build with perler beads. No text, no watermark.',
  },
  {
    id: 'doodle',
    label: '简笔画',
    preview: '/styles/px-doodle.png',
    prompt:
      'Redraw the main subject as a minimal pixel doodle on pure white. Use only thick black square-pixel strokes, no color fills, lots of empty space, like a simple stick drawing. Must stay pixelated, not smooth pen lines. No text, no watermark.',
  },


  {
    id: 'abstract',
    label: '梵高星空',
    preview: '/styles/px-star.png',
    prompt:
      'Redraw the main subject as a very simple perler-bead version of Van Gogh Starry Night. Use huge square pixels and only a few flat colors: dark blue, medium blue, yellow, and the subject color. A few thick swirl bands and big yellow stars. No fine dithering, no tiny pixels, no smooth painting. No text, no watermark.',
  },
  {
    id: 'photo',
    label: '像素画',
    preview: '/styles/px-scene128.png',
    prompt:
      'Redraw the whole picture as flat 2D pixel art on a 128 by 128 grid of hard square pixels. Keep the original background. Do not use huge icon blocks, do not make it 3D, and do not add soft lighting or gradients. The subject and the scenery should both stay readable. Do not cut the subject out and do not replace the background with white. No text, no watermark.',
  },


] as const;

export function keepsBackground(id: (typeof AI_PRESETS)[number]['id']) {
  return id === 'abstract' || id === 'photo';
}

async function readError(res: Response) {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    /* ignore */
  }
  return '网络没有接上';
}

export async function uploadImage(blob: Blob) {
  const res = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function aiEdit(imageUrl: string, prompt: string) {
  const res = await fetch('/api/ai/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, prompt, aspect_ratio: 'auto' }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const created = (await res.json()) as { taskId: string };
  for (let i = 0; i < 45; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const q = await fetch(`/api/ai/tasks/${encodeURIComponent(created.taskId)}`);
    if (!q.ok) throw new Error(await readError(q));
    const info = (await q.json()) as { state: string; imageUrl?: string; failMsg?: string };
    if (info.state === 'success' && info.imageUrl) return info.imageUrl;
    if (info.state === 'fail') throw new Error(info.failMsg || 'AI 生成失败');
  }
  throw new Error('等太久了，稍后再试一次');
}

export function mediaProxy(url: string) {
  return `/api/media?url=${encodeURIComponent(url)}`;
}
