export const CUTOUT_PROMPT =
  'Remove the background completely and replace it with a flat pure white background. Keep the main subject centered, with clean edges, no cast shadow, no text, and no watermark.';

const BEAD_RULES =
  'Use a few large color blocks. Each outline is a single stroke, never doubled or stacked. Shapes sit next to each other and do not overlap. No tiny lines, no texture, no anti-aliasing, no text, no watermark.';

export const PIXEL_STEPS = [32, 48, 64, 96, 128, 192, 256] as const;

const DETAIL_TIERS: { max: number; text: string }[] = [
  { max: 32, text: 'a tiny icon: only the outer silhouette and at most two or three key features, each eye is a single cell, no inner detail, 3 to 5 colors in total' },
  { max: 48, text: 'a small sprite: silhouette plus the main parts, eyes one or two cells, almost no inner detail, 4 to 6 colors' },
  { max: 64, text: 'a classic game sprite: main parts and the key facial features, a little inner detail, 5 to 8 colors' },
  { max: 96, text: 'a detailed sprite: clear parts, simple facial expression, one shade per color, 6 to 10 colors' },
  { max: 128, text: 'a medium detail picture: recognizable features and simple patterns, one light and one dark shade per color, 8 to 12 colors' },
  { max: 192, text: 'a high detail picture: small features, patterns and a few highlights, 10 to 16 colors' },
  { max: 256, text: 'a rich detail picture: fine features, textures drawn as cell patterns, soft shading with a few steps, 12 to 20 colors' },
];

export function withPixels(prompt: string, grid: { cols: number; rows: number }) {
  const long = Math.max(grid.cols, grid.rows);
  const tier = DETAIL_TIERS.find((item) => long <= item.max) ?? DETAIL_TIERS[DETAIL_TIERS.length - 1];
  const percent = (100 / long).toFixed(long > 100 ? 2 : 1);
  return [
    prompt,
    `This is a perler bead pattern of exactly ${grid.cols} cells wide and ${grid.rows} cells tall.`,
    `The input image is already snapped to that grid, so every square block you see is one bead.`,
    `Keep the same block size and the same grid alignment: each block is ${percent}% of the image's long side, every shape is made of whole blocks, and nothing is smaller than one block.`,
    `At this size the level of detail is ${tier.text}.`,
    BEAD_RULES,
  ].join(' ');
}

const COLORS = "Keep the subject's own colors. Do not shift the hue or add a color cast.";

export const AI_PRESETS = [
  {
    id: 'toon',
    label: '像素卡通',
    preview: '/styles/px-toon2.png',
    prompt: `Redraw the main subject as a cute flat cartoon on white: a few solid colors, simple dot eyes, and one thick outline. ${COLORS}`,
  },
  {
    id: 'voxel',
    label: '像素写实',
    preview: '/styles/px-iso.png',
    prompt: `Redraw the main subject as a flat 2D sprite on white that only suggests thickness with two solid shades of the subject's own color, lighter on top and darker along one edge. Not a 3D model and not stacked cubes. ${COLORS}`,
  },
  {
    id: 'flat',
    label: '像素扁平',
    preview: '/styles/px-flat.png',
    prompt: `Redraw the main subject as a flat icon on white with one black outline and very little inside detail. ${COLORS}`,
  },
  {
    id: 'comic',
    label: '红白机',
    preview: '/styles/px-comic2.png',
    prompt: `Redraw the main subject as a simple NES sprite on white, using only a few flat colors and one clean outline. ${COLORS}`,
  },
  {
    id: 'minimal',
    label: '抽象简约',
    preview: '/styles/px-minimal2.png',
    prompt: `Redraw the main subject as a simple recognizable figure on white. Keep the ears, face, body and tail as separate flat shapes so it still looks like the subject, not one rectangle. Use a few solid colors taken from the subject. No outline, no shading, no texture. ${COLORS}`,
  },
  {
    id: 'doodle',
    label: '简笔画',
    preview: '/styles/px-doodle.png',
    prompt: `Redraw the main subject as one black stick drawing on white. A single stroke only, no fill, no second line beside it.`,
  },
  {
    id: 'abstract',
    label: '梵高星空',
    preview: '/styles/px-star.png',
    prompt: `Redraw the picture as a simple Starry Night made of a few wide color bands: dark blue, blue, and yellow stars. Keep the sky behind the subject. Bands lie next to each other and do not stack.`,
  },
  {
    id: 'photo',
    label: '像素画',
    preview: '/styles/px-scene128.png',
    prompt: `Redraw the whole photo as flat pixel art and keep the original background. Turn both subject and background into large separate color blocks. ${COLORS}`,
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
