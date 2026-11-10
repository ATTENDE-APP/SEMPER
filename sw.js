// Service worker：全部經文離線可用。更新時請改 VERSION。
const VERSION = 'rike-v53';
const FONTS = 'fonts-v1';   // change only when the font files change
const AUDIO = 'audio-v1';   // recorded read-aloud clips (audio.attende.app), kept across app versions
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/calendar.js', 'js/office.js', 'js/tts.js', 'manifest.webmanifest',
  'css/fonts.css', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-maskable-512.png',
  'data/days.json', 'data/texts.json', 'data/santoral.json', 'data/propers.json', 'data/commons.json', 'data/index.json', 'data/invit.json', 'data/calendars.json', 'data/t2s.json', 'data/offices.json'];
// cache: 'reload' bypasses the browser's HTTP cache (GitHub Pages keeps files 10 minutes), so a new version never
// stores old copies; skipWaiting lets the new version take over at once instead of waiting for every window to close.
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION)
  .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
  .then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && !k.startsWith('fonts-') && k !== AUDIO).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // recorded read-aloud clips: cache first; a missing clip (404) is not stored, so it is found once uploaded
  if (new URL(e.request.url).hostname === 'audio.attende.app') {
    e.respondWith(caches.open(AUDIO).then((c) => c.match(e.request).then((r) => r || fetch(e.request).then((res) => { if (res.ok && res.status === 200) c.put(e.request, res.clone()); return res; }))));
    return;
  }
  // reading fonts: kept in their own cache, so a new app version does not download them again
  if (new URL(e.request.url).pathname.includes('/fonts/')) {
    e.respondWith(caches.open(FONTS).then((c) => c.match(e.request).then((r) => r || fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }))));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).then((res) => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match('index.html'))));
});
