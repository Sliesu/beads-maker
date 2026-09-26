export const CUTOUT_PROMPT =
  'Remove the background completely and replace it with a flat pure white background. Keep the main subject centered, with clean edges, no cast shadow, no text, and no watermark.';

export const AI_PRESETS = [
  {
    id: 'comic',
    label: '像素漫画',
    preview: '/styles/px-comic.png',
    prompt:
      'Redraw the main subject as chunky pixel manga, not a smooth illustration. Use large visible square pixels, thick black pixel outlines, flat orange-and-cream cel colors, and a few blocky shadow pixels. Simplify fine detail so it can be built with perler beads. White background. No speech bubbles, no text, no watermark.',
  },
  {
    id: 'flat',
    label: '像素扁平',
    preview: '/styles/px-flat.png',
    prompt:
      'Redraw the main subject as simple flat pixel art with a clear black pixel outline around the whole shape. Use only a few flat colors, large square pixels, and almost no interior detail. White background. Must stay pixelated and easy to build with perler beads. No text, no watermark.',
  },
  {
    id: 'minimal',
    label: '抽象简约',
    preview: '/styles/px-minimal.png',
    prompt:
      'Redraw the main subject as an ultra-simple abstract icon of huge geometric color blocks. No outline stroke, no curves, no texture, no gradients. A few solid rectangles only, like a blocky pixel mascot, on a white background. Easy to build with perler beads. No text, no watermark.',
  },
  {
    id: 'toon',
    label: '像素卡通',
    preview: '/styles/px-toon.png',
    prompt:
      'Redraw the main subject as a cute cartoon pixel character: oversized round head, enormous sparkling black pixel eyes, tiny body, pink blush squares, and a thick black pixel outline. Chunky square pixels on a white background. Drop fine detail for perler beads. No text, no watermark.',
  },
  {
    id: 'abstract',
    label: '梵高星空',
    preview: '/styles/px-vangogh.png',
    prompt:
      'Redraw the main subject as chunky pixel art imitating Van Gogh, especially The Starry Night. Use swirling bands of large square pixels in deep blue and cyan, with yellow pixel stars. Do not make a smooth oil painting and do not use geometric Bauhaus shapes. Keep the subject readable and simplified for perler beads. No text, no watermark.',
  },
  {
    id: 'cyber',
    label: '赛博朋克',
    preview: '/styles/px-cyber.png',
    prompt:
      'Redraw the main subject as cyberpunk pixel art on a flat dark navy background. Use neon magenta, cyan, and yellow square pixels, thick pixel edges, and a few simple circuit lines. No natural colors, no white background, no fine detail. Suitable for perler beads. No text, no watermark.',
  },
  {
    id: 'doodle',
    label: '简笔画',
    preview: '/styles/px-doodle.png',
    prompt:
      'Redraw the main subject as a minimal pixel doodle on pure white. Use only thick black square-pixel strokes, no color fills, lots of empty space, like a simple stick drawing. Must stay pixelated, not smooth pen lines. No text, no watermark.',
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
