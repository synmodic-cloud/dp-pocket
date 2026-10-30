// 隨身控制台：外殼先從手機上的快取打開（沒有訊號也能開），同時在背景取新版，下次打開就是新的。
// vault 的副本不經這裏：它存在同一個 Cache Storage 的 dp-vault，待送的改動存在 localStorage，都由 index.html 自己同步。
// 換外殼時只清舊的外殼（dp-shell-*），不碰 dp-vault，否則 CACHE 加一就會把手機上的 vault 一起清掉。
const CACHE = 'dp-shell-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('dp-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      const fresh = fetch(e.request).then((r) => (r.ok && c.put(e.request, r.clone()), r)).catch(() => hit);
      return hit || fresh;
    }),
  );
});
