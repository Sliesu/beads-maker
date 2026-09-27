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

function kieMessage(status, message) {
  if (status === 401) return 'KIE 钥匙不对，请检查 KIE_API_KEY';
  if (status === 402) return 'KIE 额度不够了';
  if (status === 429) return '请求太频繁，等一下再试';
  return message || 'AI 没有接上';
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
  const contentType = req.headers['content-type'] || '';
  if (!/^image\/(jpeg|png|webp)/.test(contentType)) {
    send(res, 415, { error: '只接收 jpg、png、webp' });
    return;
  }
  const body = await readBody(req, MAX_UPLOAD);
  const url = await uploadToCos(body, contentType.split(';')[0]);
  send(res, 200, { url });
}

async function createAiTask(req, res) {
  if (!process.env.KIE_API_KEY) {
    send(res, 503, { error: '还没有配置 KIE_API_KEY' });
    return;
  }
  const payload = JSON.parse((await readBody(req, 1024 * 64)).toString('utf8') || '{}');
  if (!safeImageUrl(payload.imageUrl)) {
    send(res, 400, { error: '图片地址不可用' });
    return;
  }
  const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-imagine-image-2-0/image-edit',
      input: {
        image_urls: [payload.imageUrl],
        prompt: String(payload.prompt || '').slice(0, 4000),
        aspect_ratio: payload.aspect_ratio || 'auto',
        resolution: payload.resolution === '2K' ? '2K' : '1K',
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 200 || !data.data?.taskId) {
    send(res, response.status || 502, { error: kieMessage(response.status, data.msg) });
    return;
  }
  send(res, 200, { taskId: data.data.taskId });
}

async function queryAiTask(res, taskId) {
  if (!process.env.KIE_API_KEY) {
    send(res, 503, { error: '还没有配置 KIE_API_KEY' });
    return;
  }
  const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 200) {
    send(res, response.status || 502, { error: kieMessage(response.status, data.msg) });
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
  send(res, 200, {
    state: info.state || 'waiting',
    imageUrl,
    failMsg: info.failMsg || '',
  });
}

async function proxyMedia(res, raw) {
  const url = safeImageUrl(raw);
  if (!url) {
    send(res, 400, { error: '图片地址不可用' });
    return;
  }
  const response = await fetch(url);
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
      send(res, 200, { ok: true, cos: !!cosReady(), kie: !!process.env.KIE_API_KEY });
      return;
    }
    if (url.pathname === '/api/uploads' && req.method === 'POST') return await handleUpload(req, res);
    if (url.pathname === '/api/ai/tasks' && req.method === 'POST') return await createAiTask(req, res);
    if (url.pathname.startsWith('/api/ai/tasks/') && req.method === 'GET') {
      return await queryAiTask(res, decodeURIComponent(url.pathname.slice('/api/ai/tasks/'.length)));
    }
    if (url.pathname === '/api/media' && req.method === 'GET') return await proxyMedia(res, url.searchParams.get('url'));
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
