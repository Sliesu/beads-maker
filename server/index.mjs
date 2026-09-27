import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const COS = require('cos-nodejs-sdk-v5');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadEnv(path.join(root, '.env'));

const port = Number(process.env.PORT || 8787);
const MAX_UPLOAD = 8 * 1024 * 1024;
const dev = process.env.NODE_ENV !== 'production';
const AI_HOURLY = Number(process.env.AI_HOURLY_LIMIT || (dev ? 30 : 8));
const AI_DAILY = Number(process.env.AI_DAILY_LIMIT || (dev ? 80 : 24));
const AI_GLOBAL_HOURLY = Number(process.env.AI_GLOBAL_HOURLY || (dev ? 200 : 60));
const PRESETS = {
  toon: 'Redraw the subject as a cute cartoon, on a plain background.',
  voxel: 'Redraw the subject as pixel art that still looks like the real thing, on a plain background.',
  flat: 'Redraw the subject as flat, graphic pixel art, on a plain background.',
  comic: 'Redraw the subject in an 8-bit NES game style, on a plain background.',
  minimal: 'Redraw the subject in a simple abstract way, still recognizable, on a plain background.',
  doodle: 'Redraw the subject as a simple line doodle, on a plain background.',
  abstract: "Redraw the picture in the spirit of Van Gogh's Starry Night, and keep the scene.",
  photo: 'Redraw the whole picture as pixel art, and keep the original scene.',
};
const PIXEL_STEPS = new Set([32, 48, 64, 96, 128, 192, 256]);
const hits = new Map();
const uploads = new Map();
const issuedMedia = new Map();
const tasks = new Map();
const inflight = new Set();

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const index = text.indexOf('=');
    if (index < 0) continue;
    const key = text.slice(0, index).trim();
    let value = text.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('图片太大了'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function cosReady() {
  return process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY && process.env.COS_BUCKET && process.env.COS_REGION;
}

function cosClient() {
  return new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
}

function putObject(cos, params) {
  return new Promise((resolve, reject) => {
    cos.putObject(params, (error, data) => (error ? reject(error) : resolve(data)));
  });
}

function signedUrl(cos, key) {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl(
      {
        Bucket: process.env.COS_BUCKET,
        Region: process.env.COS_REGION,
        Key: key,
        Sign: true,
        Expires: 60 * 60 * 6,
      },
      (error, data) => {
        if (error) reject(error);
        else resolve(typeof data === 'string' ? data : data.Url);
      },
    );
  });
}

async function uploadToCos(buffer, contentType) {
  if (!cosReady()) {
    throw Object.assign(new Error('还没有配置腾讯云 COS'), { status: 503 });
  }
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const key = `doudoumaru/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const cos = cosClient();
  await putObject(cos, {
    Bucket: process.env.COS_BUCKET,
    Region: process.env.COS_REGION,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  if (process.env.COS_PUBLIC_BASE_URL) {
    return `${process.env.COS_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }
  return signedUrl(cos, key);
}

function clientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd.slice(0, 80);
  }
  return req.socket.remoteAddress || 'unknown';
}

function allowOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return false;
  const extra = String(process.env.APP_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (extra.includes(origin)) return true;
  try {
    if (new URL(origin).host === req.headers.host) return true;
  } catch {
    return false;
  }
  return dev && /^http:\/\/(127\.0\.0\.1|localhost):(5173|4173|8787)$/.test(origin);
}

function guard(req, res) {
  if (allowOrigin(req)) return true;
  send(res, 403, { error: '这个请求不被允许' });
  return false;
}

function take(key, limit, windowMs) {
  const now = Date.now();
  const fresh = (hits.get(key) || []).filter((time) => now - time < windowMs);
  if (fresh.length >= limit) {
    hits.set(key, fresh);
    return false;
  }
  fresh.push(now);
  hits.set(key, fresh);
  return true;
}

function sweep() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  for (const [key, times] of hits) {
    const fresh = times.filter((time) => now - time < day);
    if (fresh.length) hits.set(key, fresh);
    else hits.delete(key);
  }
  for (const [key, item] of uploads) if (item.exp < now) uploads.delete(key);
  for (const [key, exp] of issuedMedia) if (exp < now) issuedMedia.delete(key);
  for (const [key, item] of tasks) if (item.exp < now) tasks.delete(key);
}

setInterval(sweep, 10 * 60 * 1000).unref?.();

function buildPrompt(preset, pixels) {
  const base = PRESETS[preset];
  const size = Number(pixels);
  if (!base || !PIXEL_STEPS.has(size)) return '';
  const detail = size <= 48 ? 'simple' : size <= 96 ? 'moderate' : size >= 192 ? 'fine' : 'clear';
  return `${base} Keep about ${size} beads of detail along the long side, so the picture stays ${detail}.`;
}

function looksLikeImage(buffer, contentType) {
  if (buffer.length < 12) return false;
  if (contentType.includes('png')) return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (contentType.includes('jpeg')) return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (contentType.includes('webp')) return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

function kieMessage(status) {
  if (status === 402) return '生成额度不够了';
  if (status === 429) return '请求太频繁，等一下再试';
  return 'AI 暂时不可用';
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  const match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function safeImageUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || isPrivateHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

async function handleUpload(req, res) {
  if (!guard(req, res)) return;
  const ip = clientIp(req);
  if (!take(`up:${ip}`, 20, 60 * 60 * 1000)) {
    send(res, 429, { error: '上传太频繁了，过一会儿再试' });
    return;
  }
  const contentType = String(req.headers['content-type'] || '').split(';')[0];
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
    send(res, 415, { error: '只接收 jpg、png、webp' });
    return;
  }
  const body = await readBody(req, MAX_UPLOAD);
  if (!looksLikeImage(body, contentType)) {
    send(res, 415, { error: '只接收 jpg、png、webp' });
    return;
  }
  const url = await uploadToCos(body, contentType);
  uploads.set(url, { ip, exp: Date.now() + 2 * 60 * 60 * 1000 });
  send(res, 200, { url });
}

async function createAiTask(req, res) {
  if (!guard(req, res)) return;
  const ip = clientIp(req);
  if (inflight.has(ip)) {
    send(res, 429, { error: '上一张还在生成，等它完成' });
    return;
  }
  if (!process.env.KIE_API_KEY) {
    send(res, 503, { error: 'AI 暂时不可用' });
    return;
  }
  inflight.add(ip);
  try {
    let payload = {};
    try {
      payload = JSON.parse((await readBody(req, 1024 * 32)).toString('utf8') || '{}');
    } catch {
      send(res, 400, { error: '请求不正确' });
      return;
    }
    const prompt = buildPrompt(payload.preset, payload.pixels);
    const upload = uploads.get(payload.imageUrl);
    if (!prompt || !upload || upload.exp < Date.now() || upload.ip !== ip || !safeImageUrl(payload.imageUrl)) {
      send(res, 400, { error: '请从页面里重新选一张图再生成' });
      return;
    }
    if (!take(`ai-h:${ip}`, AI_HOURLY, 60 * 60 * 1000) || !take(`ai-d:${ip}`, AI_DAILY, 24 * 60 * 60 * 1000)) {
      send(res, 429, { error: '生成次数用完了，过一会儿再试' });
      return;
    }
    if (!take('ai-global', AI_GLOBAL_HOURLY, 60 * 60 * 1000)) {
      send(res, 429, { error: '现在生成的人太多，过一会儿再试' });
      return;
    }
    uploads.delete(payload.imageUrl);
    const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      signal: AbortSignal.timeout(90_000),
      headers: {
        Authorization: `Bearer ${process.env.KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-imagine-image-2-0/image-edit',
        input: {
          image_urls: [payload.imageUrl],
          prompt,
          aspect_ratio: 'auto',
          resolution: '1K',
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.code !== 200 || !data.data?.taskId) {
      console.error('kie create', response.status);
      send(res, response.status === 429 || response.status === 402 ? response.status : 502, { error: kieMessage(response.status) });
      return;
    }
    const token = crypto.randomUUID();
    tasks.set(data.data.taskId, { token, exp: Date.now() + 30 * 60 * 1000 });
    send(res, 200, { taskId: data.data.taskId, token });
  } finally {
    inflight.delete(ip);
  }
}

async function queryAiTask(req, res, taskId) {
  if (!guard(req, res)) return;
  const ip = clientIp(req);
  if (!take(`poll:${ip}`, 800, 60 * 60 * 1000)) {
    send(res, 429, { error: '查询太频繁了，过一会儿再试' });
    return;
  }
  if (!process.env.KIE_API_KEY || !/^[A-Za-z0-9_-]{6,128}$/.test(taskId)) {
    send(res, 404, { error: '找不到这张图' });
    return;
  }
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const owned = tasks.get(taskId);
  if (!owned || owned.token !== url.searchParams.get('token') || owned.exp < Date.now()) {
    send(res, 404, { error: '找不到这张图' });
    return;
  }
  const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}` },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 200) {
    console.error('kie query', response.status);
    send(res, 502, { error: kieMessage(response.status) });
    return;
  }
  const info = data.data || {};
  let imageUrl = '';
  if (info.state === 'success' && info.resultJson) {
    try {
      const parsed = JSON.parse(info.resultJson);
      imageUrl = parsed.resultUrls?.[0] || '';
    } catch {
      imageUrl = '';
    }
  }
  if (imageUrl && safeImageUrl(imageUrl)) issuedMedia.set(imageUrl, Date.now() + 2 * 60 * 60 * 1000);
  send(res, 200, {
    state: info.state || 'waiting',
    imageUrl,
    failMsg: info.state === 'fail' ? 'AI 生成失败' : '',
  });
}

async function proxyMedia(req, res, raw) {
  if (!guard(req, res)) return;
  const url = safeImageUrl(raw);
  const exp = raw ? issuedMedia.get(raw) : 0;
  if (!url || !exp || exp < Date.now()) {
    send(res, 403, { error: '图片地址不可用' });
    return;
  }
  const ip = clientIp(req);
  if (!take(`media:${ip}`, 180, 60 * 60 * 1000)) {
    send(res, 429, { error: '取图太频繁了，过一会儿再试' });
    return;
  }
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    send(res, 502, { error: '图片没有取回来' });
    return;
  }
  const type = response.headers.get('content-type') || '';
  if (!type.startsWith('image/')) {
    send(res, 415, { error: '返回的不是图片' });
    return;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 15 * 1024 * 1024) {
    send(res, 413, { error: '图片太大了' });
    return;
  }
  send(res, 200, buffer, type);
}

function contentTypeOf(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function serveStatic(req, res) {
  const dist = path.join(root, 'dist');
  const url = new URL(req.url, 'http://127.0.0.1');
  const requested = path.normalize(path.join(dist, decodeURIComponent(url.pathname)));
  const isFile = requested.startsWith(dist) && existsSync(requested) && statSync(requested).isFile();
  const file = isFile ? requested : path.join(dist, 'index.html');
  if (!existsSync(file)) {
    send(res, 404, { error: '页面不存在' });
    return;
  }
  send(res, 200, readFileSync(file), contentTypeOf(file));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/health') {
      send(res, 200, { ok: true });
      return;
    }
    if (url.pathname === '/api/uploads' && req.method === 'POST') return await handleUpload(req, res);
    if (url.pathname === '/api/ai/tasks' && req.method === 'POST') return await createAiTask(req, res);
    if (url.pathname.startsWith('/api/ai/tasks/') && req.method === 'GET') {
      return await queryAiTask(req, res, decodeURIComponent(url.pathname.slice('/api/ai/tasks/'.length)));
    }
    if (url.pathname === '/api/media' && req.method === 'GET') return await proxyMedia(req, res, url.searchParams.get('url'));
    if (process.env.NODE_ENV === 'production') return serveStatic(req, res);
    send(res, 404, { error: '接口不存在' });
  } catch (error) {
    const status = error.status || 500;
    send(res, status, { error: error.message || '服务出错了' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`豆豆丸 API http://127.0.0.1:${port}`);
});
