export const CUTOUT_PROMPT =
  'Remove the background completely and replace it with a flat pure white background. Keep the main subject centered, with clean edges, no cast shadow, no text, and no watermark.';

const BEAD =
  'Draw it as one flat 128 by 128 pixel picture for perler beads. Use a few large color blocks. Each outline is a single stroke, never doubled or stacked. Shapes sit next to each other and do not overlap. No tiny lines, no texture, no anti-aliasing, no text, no watermark.';

const COLORS = "Keep the subject's own colors. Do not shift the hue or add a color cast.";

export const AI_PRESETS = [
  {
    id: 'toon',
    label: '像素卡通',
    preview: '/styles/px-toon2.png',
    prompt: `Redraw the main subject as a cute flat cartoon on white: a few solid colors, simple dot eyes, and one thick outline. ${COLORS} ${BEAD}`,
  },
  {
    id: 'voxel',
    label: '像素写实',
    preview: '/styles/px-iso.png',
    prompt: `Redraw the main subject as a flat 2D sprite on white that only suggests thickness with two solid shades of the subject's own color, lighter on top and darker along one edge. Not a 3D model and not stacked cubes. ${COLORS} ${BEAD}`,
  },
  {
    id: 'flat',
    label: '像素扁平',
    preview: '/styles/px-flat.png',
    prompt: `Redraw the main subject as a flat icon on white with one black outline and very little inside detail. ${COLORS} ${BEAD}`,
  },
  {
    id: 'comic',
    label: '红白机',
    preview: '/styles/px-comic2.png',
    prompt: `Redraw the main subject as a simple NES sprite on white, using only a few flat colors and one clean outline. ${COLORS} ${BEAD}`,
  },
  {
    id: 'minimal',
    label: '抽象简约',
    preview: '/styles/px-minimal2.png',
    prompt: `Redraw the main subject as a simple recognizable figure on white. Keep the ears, face, body and tail as separate flat shapes so it still looks like the subject, not one rectangle. Use a few solid colors taken from the subject. No outline, no shading, no texture. ${COLORS} ${BEAD}`,
  },
  {
    id: 'doodle',
    label: '简笔画',
    preview: '/styles/px-doodle.png',
    prompt: `Redraw the main subject as one black stick drawing on white. A single stroke only, no fill, no second line beside it. ${BEAD}`,
  },
  {
    id: 'abstract',
    label: '梵高星空',
    preview: '/styles/px-star.png',
    prompt: `Redraw the picture as a simple Starry Night made of a few wide color bands: dark blue, blue, and yellow stars. Keep the sky behind the subject. Bands lie next to each other and do not stack. ${BEAD}`,
  },
  {
    id: 'photo',
    label: '像素画',
    preview: '/styles/px-scene128.png',
    prompt: `Redraw the whole photo as flat pixel art and keep the original background. Turn both subject and background into large separate color blocks. ${COLORS} ${BEAD}`,
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

export async function aiEdit(imageUrl: string, prompt: string, resolution: '1K' | '2K' = '1K') {
  const res = await fetch('/api/ai/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, prompt, aspect_ratio: 'auto', resolution }),
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
