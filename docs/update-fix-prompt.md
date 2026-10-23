Fix this web app so a new deploy shows up on users' devices without them having to clear site data or use incognito.

## The problem
The app is a static site on GitHub Pages under https://dawnsommer.github.io/<repo>/. After a deploy, normal Chrome keeps showing the old version, while an incognito window shows the new one. Two things cause this:
1. GitHub Pages sends `Cache-Control: max-age=600`, so browsers reuse every file for up to 10 minutes without asking the server. This can't be changed.
2. A service worker (if the app has one) serves its stored copies first and never picks up new files, or mixes old and new files.

## Hard constraints: read these first
- dawnsommer.github.io hosts several separate apps (for example /thundertracker/ and /ThunderShadow/). They share ONE origin, so they share Cache Storage, localStorage and IndexedDB.
  - Give this app's caches a unique prefix (e.g. `<appname>-v<N>`), and only ever read, write or delete caches with that prefix. Never delete all caches.
  - Never call `localStorage.clear()`, never delete IndexedDB databases, never unregister service workers other than this app's own.
  - Register the service worker with a relative path (`navigator.serviceWorker.register('sw.js')`, not `'/sw.js'`), so its scope is only this app's folder.
- Don't touch users' saved data. A reload or update must keep everything the user stored.
- Keep the app working offline if it already does.
- Don't change app features, design or behaviour beyond what's needed for this fix.

## What to implement
Adapt each part to how this project is built. If it uses a bundler (Vite, webpack, etc.) that already puts content hashes in filenames, use those hashed files as the "versioned files" below and skip the `?v=` step.

### 1. Version every asset URL
- Add `?v=<N>` to every script and stylesheet URL in index.html: `<script src="app.js?v=1">`, `<link href="styles.css?v=1">`.
- If the app uses ES modules, every `import` between modules must carry the same `?v=<N>` too (`import { x } from './util.js?v=1'`). Otherwise the browser can load a module twice or mix old and new versions.
- Add a small release script (e.g. `tools/release.mjs`, Node, no dependencies) that, on each release:
  - bumps the number everywhere at once: every `?v=` in index.html and the JS files, plus `const VERSION = N` in sw.js;
  - rewrites the service worker's precache list (`SHELL`) from the actual files.
- Document in the README: "Before every deploy, run `node tools/release.mjs`."

### 2. Service worker (`sw.js`, at the app root)
Use this strategy, adapting the file list and prefix:

```js
const VERSION = 1;
const PREFIX = '<appname>-';                 // unique per app on this domain
const CACHE = PREFIX + 'v' + VERSION;
const SHELL = ['./', 'index.html', 'styles.css?v=1', 'app.js?v=1', 'manifest.webmanifest' /* every app file */];

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
  if (url.origin !== self.location.origin) return;   // leave other hosts (APIs, sign-in, CDNs) alone

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Versioned files never change: a release changes the URL. Serve them from the cache with no network request.
    if (url.searchParams.has('v')) {
      const hit = await cache.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
      catch (err) { return (await cache.match(req, { ignoreSearch: true })) || Response.error(); }
    }
    // The page and unversioned files: network first, revalidated past GitHub's 10-minute cache.
    // On a slow network, use the stored page after 3 s. A page that arrives after that isn't stored
    // (its new ?v= files weren't fetched; the next worker's install stores page + files together).
    let late = false;
    const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok && !late) cache.put(req, res.clone()); return res; });
    net.catch(() => {});
    const cached = async () => (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true })) ||
      (req.mode === 'navigate' ? (await cache.match('index.html')) || (await cache.match('./')) : undefined);
    try {
      return await Promise.race([net, new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 3000))]);
    } catch (err) {
      const hit = await cached();
      if (hit) { late = true; return hit; }
      try { return await net; } catch (e2) { return Response.error(); }
    }
  })());
});
```

If the app already has a service worker, replace its caching logic with this. Keep any app-specific exceptions, such as requests it deliberately doesn't cache.

### 3. Registration, update check and update notice (in the app's JS)
```js
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  const hadController = !!navigator.serviceWorker.controller;
  let offered = false, lastCheck = Date.now();
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || offered) return;      // first install: nothing to announce
    offered = true;
    // save any pending user data first, then show a small toast: "Updated — Reload" (button calls location.reload())
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
  document.addEventListener('visibilitychange', () => {   // returning to the app: check for a new version (max every 30 min)
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 30 * 60000) return;
    lastCheck = Date.now();
    navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  });
}
```
Use the app's existing toast/notification style if it has one.

### 4. "Reload latest version" escape hatch
Add a button in the app's settings (or an obvious place if there's no settings page) that:
- saves pending user data;
- re-downloads every app file with `fetch(file, { cache: 'reload' })`;
- deletes only caches starting with this app's PREFIX;
- unregisters only this app's own registration (`navigator.serviceWorker.getRegistration()`, which is scoped to this folder);
- calls `location.reload()`.

It must not touch localStorage, IndexedDB or other apps' caches. Show the app version next to it (keep a version constant in the JS in step with sw.js; the release script bumps it too).

### 5. index.html
- Make sure index.html itself is never given a `?v=`. It's the one file that must always be re-checked.
- Optional speed-up for ES-module apps: add `<link rel="modulepreload" href="js/x.js?v=N">` for every module (have the release script generate them), so a first visit fetches them in parallel.

## Verify before finishing
- Run the project's existing tests or build, if any, and make sure they pass.
- With a local static server (and, if possible, Playwright or Puppeteer):
  1. Load the app, wait for the service worker to take control, then reload. Only index.html should hit the server; scripts and styles should come from the cache.
  2. Change a visible string, run the release script, and reload. The new text appears and the "Updated — Reload" notice shows up. No request for an old `?v=` file reaches the server.
  3. Go offline and reload. The app still works.
  4. Check that other apps' caches and keys on the same origin are untouched: create a dummy cache named something like `otherapp-v1` and a localStorage key `otherapp:x` before the test, and make sure they survive the reload-latest button.
- Report what you changed, the release step to run before each deploy, and anything you couldn't verify.

Note for existing users: a device still running the old service worker may need one or two reloads after this ships, while the new worker takes over. After that, updates arrive on their own.
