// Service worker：全部經文離線可用。更新時請改 VERSION（並同時改 js/app.js 的 APP_VERSION）。
const VERSION = 'oblatio-v31';
const FONTS = 'fonts-v3';   // change only when the font files change
const SHELL = ['./', 'index.html', 'css/app.css', 'css/fonts.css', 'js/app.js', 'js/calendar.js', 'js/liturgy.js', 'js/missal.js', 'js/blessings.js', 'js/rites.js', 'js/tts.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-maskable-512.png',
  'data/santoral.json', 'data/calendars.json', 'data/t2s.json', 'data/missal.json', 'data/blessings.json', 'data/rites.json'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION)
  .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
  .then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && !k.startsWith('fonts-')).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).pathname.includes('/fonts/')) {
    e.respondWith(caches.open(FONTS).then((c) => c.match(e.request).then((r) => r || fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }))));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).then((res) => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match('index.html'))));
});
