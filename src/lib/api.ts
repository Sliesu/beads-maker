export const CUTOUT_PROMPT =
  'Remove the background completely and replace it with a flat pure white background. Keep the main subject centered, with clean edges, no cast shadow, no text, and no watermark.';

export const AI_PRESETS = [
  {
    id: 'manga',
    label: '漫画风格',
    preview: '/styles/manga.png',
    prompt:
      'Redraw the main subject as a clean Japanese manga illustration with bold black ink outlines, flat colors, and light screentone shadows. Keep a clear silhouette, centered on a plain light background. No text, no speech bubbles, no watermark.',
  },
  {
    id: 'anime',
    label: '动漫画风',
    preview: '/styles/anime.png',
    prompt:
      'Redraw the main subject as a modern anime illustration with clean lineart, soft flat colors, and simple large shapes. Keep it recognizable and centered on a plain light background. No text, no watermark.',
  },
  {
    id: 'flat',
    label: '扁平插画',
    preview: '/styles/flat.png',
    prompt:
      'Redraw the main subject as a flat vector illustration made of a few solid color shapes with crisp edges and no gradients. Keep a clear silhouette, centered on a plain light background. No text, no watermark.',
  },
  {
    id: 'watercolor',
    label: '水彩',
    preview: '/styles/watercolor.png',
    prompt:
      'Redraw the main subject as a gentle watercolor illustration with soft edges, paper texture, and a limited palette. Keep it recognizable and centered on a plain light background. No text, no watermark.',
  },
  {
    id: 'line',
    label: '线稿',
    preview: '/styles/line.png',
    prompt:
      'Redraw the main subject as clean black line art on a plain white background. Use confident uniform outlines, no shading, and no color fill. Keep a clear silhouette, centered. No text, no watermark.',
  },
] as const;

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
