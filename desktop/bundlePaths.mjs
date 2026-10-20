import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';

export const APP_URL = 'levelstudio://bundle/';
export const CONTENT_POLICY = "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: http: data: blob:; media-src 'self' data: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const allowed = new Set(['.html', '.js', '.css', '.json', '.glb', '.bin', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.hdr', '.exr', '.wasm']);
const within = (root, file) => { const relative = path.relative(root, file); return relative && !relative.startsWith('..') && !path.isAbsolute(relative); };

export async function resolveBundleFile(root, requestUrl, method = 'GET') {
  if (!['GET', 'HEAD'].includes(method)) return null;
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== 'levelstudio:' || url.host !== 'bundle' || url.username || url.password) return null;
    const decoded = decodeURIComponent(url.pathname);
    if (/[\\:\0]/.test(decoded) || decoded.split('/').some(part => part.startsWith('.'))) return null;
    const file = path.resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
    if (!within(path.resolve(root), file) || !allowed.has(path.extname(file).toLowerCase())) return null;
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
    if (!within(realRoot, realFile) || !(await stat(realFile)).isFile()) return null;
    return realFile;
  } catch { return null; }
}

export function isAppURL(value) {
  try { const u = new URL(value); return u.protocol === 'levelstudio:' && u.host === 'bundle' && !u.username && !u.password; } catch { return false; }
}

export function safeExternalURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port ? u.href : null; } catch { return null; }
}
