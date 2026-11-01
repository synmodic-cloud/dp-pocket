// 隨身控制台：外殼先從手機上的快取打開（沒有訊號也能開），同時在背景取新版，下次打開就是新的。
// vault 的副本不經這裏：它存在同一個 Cache Storage 的 dp-vault，待送的改動存在 localStorage，都由 index.html 自己同步。
// 換外殼時只清舊的外殼（dp-shell-*），不碰 dp-vault，否則 CACHE 加一就會把手機上的 vault 一起清掉。
// v6.36：網頁（.html）由這裏從手機上的副本交出，網址是 f/{vault 裏的路徑}，和 Mac 上控制台伺服器的 /f/ 一樣；
// 網頁用相對路徑載入的 .js、.css、字型與數據（例如財務頁的 finfig.js、數據.json）也從副本交出。副本沒有的圖片換成一塊說明。
const CACHE = 'dp-shell-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];
const VAULT = 'dp-vault';
const PAGES = new URL('f/', self.registration.scope).pathname;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('dp-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith(PAGES)) return e.respondWith(fromCopy(decodeURIComponent(url.pathname.slice(PAGES.length))));
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      const fresh = fetch(e.request).then((r) => (r.ok && c.put(e.request, r.clone()), r)).catch(() => hit);
      return hit || fresh;
    }),
  );
});

/* ---------- 網頁：從手機上的副本交出 ---------- */

let copy = null; // { at, files }
async function files() {
  const r = await (await caches.open(VAULT)).match(new URL('vault.json', self.registration.scope).href);
  if (!r) return null;
  // index.html 存副本時寫上 x-at；同一份就不必再解一次（約 10 MB 的 JSON）
  const at = r.headers.get('x-at') || '';
  if (copy && at && copy.at === at) return copy.files;
  const b = await r.json();
  copy = { at: at || b.at || '', files: b.files || {} };
  return copy.files;
}

const TYPES = {
  html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json',
  svg: 'image/svg+xml', txt: 'text/plain', md: 'text/markdown', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};
const ext = (p) => (p.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();

async function fromCopy(path) {
  let fs = null;
  try {
    fs = await files();
  } catch {
    /* 副本讀不出：當作沒有 */
  }
  const f = fs && fs[path];
  const type = TYPES[ext(path)] || 'application/octet-stream';
  if (f && typeof f.text === 'string') return new Response(f.text, { headers: { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store' } });
  if (f && typeof f.b64 === 'string') {
    const bin = atob(f.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // 專題的預覽在副本裏是縮小的 JPEG，名字仍是 .png
    return new Response(bytes, { headers: { 'content-type': /預覽\.png$/.test(path) ? 'image/jpeg' : type, 'cache-control': 'no-store' } });
  }
  if (/^image\//.test(type)) return new Response(PICTURE, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } });
  if (type === 'text/html') return new Response(missing(path), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  return new Response('', { status: 404 });
}

const PICTURE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">' +
  '<rect width="400" height="300" fill="#e9e4d8"/><path d="M0 0L400 300M400 0L0 300" stroke="#cfc7b6" stroke-width="1"/>' +
  '<text x="200" y="156" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#7a7266">圖片在電腦上看</text></svg>';

function missing(path) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return (
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font:16px/1.6 sans-serif;padding:24px;background:#f4f0e6;color:#2b2722">' +
    '<p>手機上的副本沒有這一頁：</p><p style="word-break:break-all;color:#7a7266">' + esc(path) + '</p>' +
    '<p>回家用電腦打開；或者等 Mac 下一次打包（控制台伺服器開着時每 3 分鐘一次）。</p></body>'
  );
}
