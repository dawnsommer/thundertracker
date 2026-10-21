import { chromium } from 'playwright';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
import fs from 'fs';
const SITE = process.env.SITE_DIR;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const URL = process.env.GH_URL;
await p.goto(URL);
// ThunderShadow's things on the same origin
await p.evaluate(async () => {
  localStorage.setItem('cloudflareWorkerSession', 'ts-session'); localStorage.setItem('thundershadow:theme', 'dark');
  const c = await caches.open('thundershadow-github-shell-v43'); await c.put('/ThunderShadow/index.html', new Response('ts'));
  localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, items: { 'nbme-9': { status: 1, score: '231' } } }));
});
await p.evaluate(() => navigator.serviceWorker.ready);
await p.reload(); await p.waitForTimeout(500);
ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
ok((await p.textContent('#ct-nbme')).trim().startsWith('1/'), 'data loaded');
// --- deploy a new version (new heading, bumped version) while the page is open
const edit = (f, fn) => fs.writeFileSync(SITE + '/' + f, fn(fs.readFileSync(SITE + '/' + f, 'utf8')));
const V = Number(/const VERSION = (\d+);/.exec(fs.readFileSync(SITE + '/sw.js', 'utf8'))[1]), N = V + 1;
const bump = (t) => t.split('?v=' + V).join('?v=' + N);
edit('index.html', (t) => bump(t.replace('<h1>Thunder <mark>tracker</mark></h1>', '<h1>Thunder <mark>tracker</mark> NEW</h1>')));
edit('sw.js', (t) => bump(t.replace('const VERSION = ' + V + ';', 'const VERSION = ' + N + ';')));
for (const f of (fs.existsSync(SITE + '/js') ? fs.readdirSync(SITE + '/js').filter((n) => n.endsWith('.js')).map((n) => 'js/' + n) : []).concat(fs.existsSync(SITE + '/app.js') ? ['app.js'] : []))
  edit(f, (t) => bump(t.replace('const APP_VERSION = ' + V + ';', 'const APP_VERSION = ' + N + ';')));
// normal reload within the 10-minute HTTP cache window must already show the new version
await p.reload(); await p.waitForTimeout(800);
ok((await p.textContent('h1')).includes('NEW'), 'reload shows the new deploy despite max-age=600');
await p.waitForTimeout(1500);
const toastTxt = await p.textContent('#toasts');
ok(/updated/.test(toastTxt), 'update notice offered: ' + toastTxt);
await p.click('#toasts button'); await p.waitForTimeout(800);
ok(await p.evaluate(() => caches.keys()).then((k) => k.includes('ck-tracker-v' + N) && !k.includes('ck-tracker-v' + V)), 'old app cache replaced by the new one');
// open settings: version + reload latest
await p.keyboard.press(',');
ok((await p.textContent('#set-app')).includes('Version ' + N), 'settings shows the new version');
await p.click('#st-reload'); await p.waitForTimeout(1500);
ok((await p.textContent('h1')).includes('NEW'), 'reload latest works');
const keys = await p.evaluate(() => caches.keys());
ok(keys.includes('thundershadow-github-shell-v43'), 'ThunderShadow cache untouched: ' + keys.join(','));
const ls = await p.evaluate(() => [localStorage.getItem('cloudflareWorkerSession'), localStorage.getItem('thundershadow:theme'), JSON.parse(localStorage.getItem('ck-tracker')).items['nbme-9'].score]);
ok(ls.join() === 'ts-session,dark,231', 'ThunderShadow keys and tracker data kept: ' + ls.join());
// offline still works after all this
await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(500);
await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(500);
ok((await p.textContent('h1')).includes('NEW') && (await p.textContent('#ct-nbme')).trim().startsWith('1/'), 'works offline with the new version');
await ctx.setOffline(false);
ok(errs.length === 0, 'no errors ' + JSON.stringify(errs));
await b.close();
