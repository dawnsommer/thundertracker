// NotebookLM shelf: Passive → NotebookLM and AMBOSS → Audio (js/nlm.js, js/nlm-data.js). Synthetic feed only.
import { chromium } from 'playwright';
import { filterRows, normFeed, shelfRows, shelfStats, upNext, volKey } from '../js/nlm-data.js';
const BASE = process.env.BASE_URL;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };

const vol = (id, g, n, st, q = 20, track = 'system', title = g + ' — Vol. ' + n) => ({ id, track, g, n, title, q, st, d0: '2026-06-01', d1: '2026-11-01', at: '2026-11-20' });
const FEED = {
  kind: 'thundertracker-nlm', v: 1, at: '2026-11-24T10:00:00Z',
  nbme: { label: 'ThunderNBME', groups: [{ id: 'alpha', name: 'Alpha system', order: 0, queue: 5, thr: 20 }, { id: 'beta', name: 'Beta system', order: 1, queue: 0, thr: 20 }, { id: 'gamma', name: 'Gamma system', order: 2, queue: 8, thr: 20 }],
    vols: [vol('beta_v01', 'beta', 1, 'E'), vol('alpha_v02', 'alpha', 2, 'A'), vol('alpha_v01', 'alpha', 1, 'L'),
      vol('repeat_x_p01', 'repeat_4plus', 1, 'E', 12, 'repeat'), vol('form_demo_1_p01', 'form_demo_1', 1, 'U', 9, 'form', 'Demo 1 — Debrief')] },
  amboss: { label: 'MogiAMBOSS', groups: [{ id: 'Zed', name: 'Zed system', order: 0, queue: null, thr: null }], vols: [vol('Zed_v01', 'Zed', 1, 'A', 30)] },
};

// ---- pure
const F = normFeed(FEED);
ok(F && F.nbme.vols.length === 5 && F.amboss.vols.length === 1, 'normFeed keeps a valid feed');
ok(normFeed({ kind: 'other', nbme: FEED.nbme }) === null && normFeed(null) === null, 'normFeed refuses other files');
ok(normFeed({ kind: 'thundertracker-nlm', nbme: { vols: [{ id: 'x', st: 'Q', n: 'a' }] } }).nbme.vols[0].st === 'E', 'bad status → Exported');
const rows = shelfRows(F.nbme, 'system');
ok(rows.map((r) => r.id).join() === 'alpha,beta,gamma', 'systems in feed order; a system with only a queue still shows');
ok(rows[0].vols.map((v) => v.n).join() === '1,2', 'volumes sorted by number (they only get added)');
ok(shelfRows(F.nbme, 'repeat')[0].name.startsWith('Repeat offenders') && shelfRows(F.nbme, 'form')[0].name === 'Demo 1', 'repeat packs and form debriefs named');
const none = () => 0;
ok(upNext(F.nbme, none, 'nbme').vol.id === 'alpha_v02', 'up next: audio ready, not heard');
ok(upNext(F.nbme, (k) => (k === volKey('nbme', 'alpha_v02') ? 1 : 0), 'nbme').needsAudio === true, 'once heard, up next is a volume still needing audio');
ok(filterRows(rows, 'ready', none, 'nbme').map((r) => r.id).join() === 'alpha', 'filter: audio ready');
const s = shelfStats(F.nbme, none, 'nbme');
ok(s.total === 5 && s.ready === 1 && s.heard === 1, 'stats: total, ready, listened');
ok(/^[a-z0-9-]{1,48}$/.test(volKey('amboss', 'Some_Long_System_Name_With_Underscores_v01')), 'volKey fits the passive id format');

// ---- UI
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const [w, hgt] of [[1280, 900], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: hgt }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/amboss-tracker/**', (r) => r.fulfill({ status: 404, body: '' }));
  let served = 0;
  await p.route('**/amboss-tracker/nlm.json', (r) => { served++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEED) }); });
  await p.goto(BASE);
  await p.evaluate((f) => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { examDate: '2026-12-01', passive: true, amboss: true } })));
  await p.reload(); await p.evaluate(() => { location.hash = 'passive'; }); await p.waitForTimeout(300);
  ok(await p.isVisible('#pv-tabs') && await p.isVisible('.pv-dip'), w + 'px: Passive opens on Podcasts, Divine list unchanged');
  await p.click('#pv-tabs [data-pvv="nlm"]'); await p.waitForSelector('.nl-shelf, .nl-empty h3:not(:has-text("Loading"))');
  ok(await p.isVisible('.nl-shelf[data-src="nbme"]') && await p.isHidden('.pv-dip'), w + 'px: NotebookLM subpage shows the shelf');
  ok((await p.locator('.nl-row').count()) === 3 && (await p.textContent('.nl-up')).includes('Alpha system · Vol 2'), w + 'px: 3 system rows, up next Alpha Vol 2');
  await p.click('.nl-row[data-g="alpha"] .nl-rh');
  ok((await p.locator('.nl-row[data-g="alpha"] .nl-vol').count()) === 2, w + 'px: a row opens to its volumes');
  await p.click('#nl-heard'); await p.waitForTimeout(350);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker')));
  ok(st.passive[volKey('nbme', 'alpha_v02')]?.n === 1, w + 'px: Heard ticks the first listen box');
  ok((await p.textContent('.nl-up')).includes('Beta system'), w + 'px: up next moves on');
  ok(st.prefs.pvView === 'nlm' && !('nlm' in st.prefs) && !JSON.stringify(st).includes('Alpha system'), w + 'px: subpage saved; the volume list stays in memory, not in storage');
  ok(served >= 1 && served <= 2, w + 'px: nlm.json fetched from ../amboss-tracker/ (' + served + '×), not on every redraw');
  await p.click('#nl-grp [data-k="form"]');
  ok((await p.textContent('.nl-list')).includes('Demo 1'), w + 'px: Form debriefs group');
  await p.evaluate(() => { location.hash = 'amboss'; }); await p.waitForTimeout(300);
  await p.click('.amb-view [data-amb="audio"]'); await p.waitForTimeout(150);
  ok(await p.isVisible('.nl-shelf[data-src="amboss"]') && (await p.textContent('.nl-shelf[data-src="amboss"]')).includes('Zed system'), w + 'px: AMBOSS → Audio shows MogiAMBOSS volumes, even without the tracker page');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), w + 'px: no sideways scroll');
  if (process.env.OUT_DIR) await p.screenshot({ path: process.env.OUT_DIR + '/nlm-' + w + '.png', fullPage: true });
  ok(!errs.length, w + 'px: no page errors ' + errs.join(' | '));
  await ctx.close();
}
// not published yet: a quiet message, no errors
{
  const ctx = await b.newContext({ serviceWorkers: 'block' }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/amboss-tracker/**', (r) => r.fulfill({ status: 404, body: '' }));
  await p.goto(BASE);
  await p.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { examDate: '2026-12-01', passive: true, pvView: 'nlm' } })));
  await p.reload(); await p.evaluate(() => { location.hash = 'passive'; }); await p.waitForTimeout(400);
  ok((await p.textContent('.nl-empty')).includes('No NotebookLM volumes published yet') && !errs.length, 'nothing published: empty state, no errors');
  await ctx.close();
}
await b.close();
