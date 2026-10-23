// App updates: service worker registration, the update notice and “Reload latest version”.

import { $, h } from './util.js?v=17';
import { APP_FILES } from './catalog.js?v=17';
import { flush, saveTimer, toast } from './store.js?v=17';

// A new deploy installs a new service worker, which takes over straight away; offer a reload so this
// page picks up the new files. Returning to the app checks for a new version at most every 30 minutes.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  const hadController = !!navigator.serviceWorker.controller;
  let offered = false, lastCheck = Date.now();
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || offered) return;
    offered = true;
    if (saveTimer) flush();
    const t = h('div', { class: 'toast' }, h('span', { text: 'Thunder tracker was updated.' }), h('button', { onclick: () => location.reload() }, 'Reload'));
    $('toasts').replaceChildren(t);
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 30 * 60000) return;
    lastCheck = Date.now();
    navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  });
}
// Fetch every app file fresh and drop this app's offline copy, then reload. Only touches caches named
// ck-tracker-… and this app's own service worker: your data and ThunderShadow are left alone.
export async function reloadLatest() {
  if (saveTimer) flush();
  toast('Fetching the latest version…');
  try {
    const files = ['./', 'index.html', 'styles.css', 'sw.js', 'manifest.webmanifest'].concat(APP_FILES);
    await Promise.all(files.map((f) => fetch(f, { cache: 'reload' }).catch(() => {})));
    if (window.caches) for (const k of await caches.keys()) if (k.startsWith('ck-tracker-')) await caches.delete(k);
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.unregister();
  } catch (e) {}
  location.reload();
}
