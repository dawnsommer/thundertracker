// Offline support. Never touches Google or the sign-in Worker: those requests go straight to the network.
//
// Versioned files (`?v=N`: every script and the stylesheet) are cache-first: a release bumps N in every
// URL, so a cached copy is never stale, and a normal load makes no network request for them.
// The page itself and unversioned files are network-first, always revalidated with GitHub Pages
// (`cache: 'no-cache'`), so a new deploy shows on the next load instead of after the browser's 10-minute
// HTTP cache. On a slow network the cached page is used after 3 s (the next load picks up any deploy);
// offline, the last copy from this app's own cache is used.
//
// dawnsommer.github.io also hosts ThunderShadow, and Cache Storage is shared by the whole domain:
// this worker only ever reads, writes and deletes caches named `ck-tracker-…`.
//
// Releasing: run `node tools/release.mjs` — it bumps VERSION here, every `?v=` and APP_VERSION together.
const VERSION = 17;
const PREFIX = 'ck-tracker-';
const CACHE = PREFIX + 'v' + VERSION;
const SHELL = ['./', 'index.html', 'styles.css?v=17', 'js/articles.js?v=17', 'js/assessments.js?v=17', 'js/backup.js?v=17', 'js/calculator.js?v=17', 'js/catalog.js?v=17', 'js/cloud.js?v=17', 'js/cms.js?v=17', 'js/config.js?v=17', 'js/data.js?v=17', 'js/main.js?v=17', 'js/model.js?v=17', 'js/overview.js?v=17', 'js/passive-catalog.js?v=17', 'js/passive.js?v=17', 'js/planner.js?v=17', 'js/print.js?v=17', 'js/qbank.js?v=17', 'js/score-models.js?v=17', 'js/settings.js?v=17', 'js/sheets.js?v=17', 'js/shell.js?v=17', 'js/sim-import.js?v=17', 'js/store.js?v=17', 'js/systems.js?v=17', 'js/updates.js?v=17', 'js/util.js?v=17', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

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
    if (url.searchParams.has('v')) {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return (await cache.match(req, { ignoreSearch: true })) || Response.error();
      }
    }
    // A page that arrives after the cached one was already served isn't stored: its new ?v= files weren't
    // fetched, and an offline open would then pair the new page with old scripts. The new worker's install
    // caches the new page together with its files.
    let late = false;
    const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok && !late) cache.put(req, res.clone()); return res; });
    net.catch(() => {});
    const cached = async () => (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true })) ||
      (req.mode === 'navigate' ? (await cache.match('index.html')) || (await cache.match('./')) : undefined);
    try {
      return await Promise.race([net, new Promise((resolve, reject) => setTimeout(() => reject(new Error('slow network')), 3000))]);
    } catch (err) {
      const hit = await cached();
      if (hit) { late = true; return hit; }
      try { return await net; } catch (e2) { return Response.error(); }
    }
  })());
});
