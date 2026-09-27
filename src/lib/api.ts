export const CUTOUT_PROMPT =
  'Remove the background completely and replace it with a flat pure white background. Keep the main subject centered, with clean edges, no cast shadow, no text, and no watermark.';

export const PIXEL_STEPS = [32, 48, 64, 96, 128, 192, 256] as const;

export function withPixels(prompt: string, pixels: number) {
  const detail = pixels <= 48 ? 'simple' : pixels <= 96 ? 'moderate' : pixels >= 192 ? 'fine' : 'clear';
  return `${prompt} Keep about ${pixels} beads of detail along the long side, so the picture stays ${detail}.`;
}

const asset = (file: string) => `${import.meta.env.BASE_URL}${file.replace(/^\//, '')}`;

// 服务端 server/index.mjs 里的风格名单必须和这里一致。页面不能自己写提示词。
export const AI_PRESETS = [
  {
    id: 'toon',
    label: '像素卡通',
    preview: asset('styles/px-toon2.png'),
    prompt: 'Redraw the subject as a cute cartoon, on a plain background.',
  },
  {
    id: 'voxel',
    label: '像素写实',
    preview: asset('styles/px-iso.png'),
    prompt: 'Redraw the subject as pixel art that still looks like the real thing, on a plain background.',
  },
  {
    id: 'flat',
    label: '像素扁平',
    preview: asset('styles/px-flat.png'),
    prompt: 'Redraw the subject as flat, graphic pixel art, on a plain background.',
  },
  {
    id: 'comic',
    label: '红白机',
    preview: asset('styles/px-comic2.png'),
    prompt: 'Redraw the subject in an 8-bit NES game style, on a plain background.',
  },
  {
    id: 'minimal',
    label: '抽象简约',
    preview: asset('styles/px-minimal2.png'),
    prompt: 'Redraw the subject in a simple abstract way, still recognizable, on a plain background.',
  },
  {
    id: 'doodle',
    label: '简笔画',
    preview: asset('styles/px-doodle.png'),
    prompt: 'Redraw the subject as a simple line doodle, on a plain background.',
  },
  {
    id: 'abstract',
    label: '梵高星空',
    preview: asset('styles/px-star.png'),
    prompt: "Redraw the picture in the spirit of Van Gogh's Starry Night, and keep the scene.",
  },
  {
    id: 'photo',
    label: '像素画',
    preview: asset('styles/px-scene128.png'),
    prompt: 'Redraw the whole picture as pixel art, and keep the original scene.',
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

export async function aiEdit(imageUrl: string, preset: string, pixels: number) {
  const res = await fetch('/api/ai/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, preset, pixels }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const created = (await res.json()) as { taskId: string; token: string };
  for (let i = 0; i < 45; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const q = await fetch(`/api/ai/tasks/${encodeURIComponent(created.taskId)}?token=${encodeURIComponent(created.token)}`);
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
