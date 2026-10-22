// Offline support. Never touches Google or the sign-in Worker: those requests go straight to the network.
//
// App files are network-first and always revalidated with GitHub Pages (`cache: 'no-cache'`), so a new
// deploy shows on the next load instead of after the browser's 10-minute HTTP cache; unchanged files
// come back as a tiny 304. Offline, the last copy from this app's own cache is used.
//
// dawnsommer.github.io also hosts ThunderShadow, and Cache Storage is shared by the whole domain:
// this worker only ever reads, writes and deletes caches named `ck-tracker-…`.
//
// Releasing: run `node tools/release.mjs` — it bumps VERSION here, every `?v=` and APP_VERSION together.
const VERSION = 13;
const PREFIX = 'ck-tracker-';
const CACHE = PREFIX + 'v' + VERSION;
const SHELL = ['./', 'index.html', 'styles.css?v=13', 'js/articles.js?v=13', 'js/assessments.js?v=13', 'js/backup.js?v=13', 'js/calculator.js?v=13', 'js/catalog.js?v=13', 'js/cloud.js?v=13', 'js/cms.js?v=13', 'js/config.js?v=13', 'js/data.js?v=13', 'js/main.js?v=13', 'js/model.js?v=13', 'js/overview.js?v=13', 'js/passive-catalog.js?v=13', 'js/passive.js?v=13', 'js/planner.js?v=13', 'js/print.js?v=13', 'js/qbank.js?v=13', 'js/score-models.js?v=13', 'js/settings.js?v=13', 'js/sheets.js?v=13', 'js/shell.js?v=13', 'js/sim-import.js?v=13', 'js/store.js?v=13', 'js/systems.js?v=13', 'js/updates.js?v=13', 'js/util.js?v=13', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const fresh = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || fresh;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true })) ||
        (req.mode === 'navigate' ? (await cache.match('index.html')) || (await cache.match('./')) : undefined) || Response.error();
    }
  })());
});
