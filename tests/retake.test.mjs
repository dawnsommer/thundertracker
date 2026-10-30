// Retakes: a second attempt at a form you've taken. Its score and % show beside the first attempt; the first attempt
// keeps driving the stats. Pure checks first (the data shape and sync), then the editor and list in the browser.
import { chromium } from 'playwright';
import { merge, norm, stamp } from '../js/model.js?v=test';
import { fmtDate } from '../js/util.js?v=test';

const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const S = process.env.OUT_DIR;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };

// --- data shape
const s1 = norm({ items: { 'nbme-12': { status: 2, score: '240', pct: '70', retake: { score: '252', pct: '78', date: '2026-10-01' } } } });
ok(JSON.stringify(s1.items['nbme-12'].retake) === '{"score":"252","pct":"78","date":"2026-10-01"}', 'a retake is kept with its score, % and date');
ok(s1.items['nbme-12'].score === '240', 'the first attempt is not touched');
const s2 = norm({ items: { 'nbme-12': { status: 2, score: '240', retake: {} }, 'nbme-13': { status: 2, retake: { score: '', pct: null, date: 'soon' } } } });
ok(s2.items['nbme-12'].retake === null && s2.items['nbme-13'].retake === null, 'an empty or junk retake normalises to none');
ok(norm({ items: { 'nbme-12': { status: 2 } } }).items['nbme-12'].retake === null, 'saves from before retakes load with none');

// --- stamps and sync: adding a retake is a change, and the newer retake wins a merge
const before = norm({ items: { 'nbme-12': { status: 2, score: '240', t: 100 } } });
const next = norm({ items: { 'nbme-12': { status: 2, score: '240', retake: { score: '252', pct: '78', date: '' } } } });
stamp(next, before, 500);
ok(next.items['nbme-12'].t === 500, 'adding a retake stamps the form as changed');
const phoneCopy = norm({ items: { 'nbme-12': { status: 2, score: '240', t: 100 } } });
const merged = merge(phoneCopy, next);
ok(merged.items['nbme-12'].retake && merged.items['nbme-12'].retake.score === '252', 'the retake reaches the other device through sync');

// --- the editor and list in the browser
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const d = (off) => { const t = new Date(Date.now() + off * 864e5); return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const seed = { v: 2, items: { 'nbme-12': { status: 2, score: '240', pct: '70', date: d(-30), notes: '' }, 'nbme-13': { status: 0 } } };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const local = async () => { await p.waitForTimeout(400); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };

await p.goto(BASE + '');
await p.evaluate((s) => localStorage.setItem('ck-tracker', JSON.stringify(s)), seed);
await p.reload(); await p.waitForTimeout(200);
await p.keyboard.press('2'); // Assessments

const row = () => p.locator('[data-open="nbme-12"]').textContent();
// the retake line under the first attempt: [score, %, date], or [] when there's none
const retakeLines = async () => {
  const r = p.locator('[data-open="nbme-12"] .retake-row');
  if (!(await r.count())) return [];
  return [await r.locator('b.rt').textContent(), await r.locator('.sc small').textContent(), await r.locator('.dt').textContent()];
};
ok((await retakeLines()).length === 0, 'no retake line before one is added');
await p.click('[data-open="nbme-12"]');
await p.waitForSelector('.retake-box .linkish');
ok(await p.locator('.retake-box .linkish', { hasText: 'Add retake' }).count() === 1 && await p.locator('#ed-re-score').count() === 0, 'a taken form offers "+ Add retake"');
await p.click('.retake-box .linkish');
await p.waitForSelector('#ed-re-score');
ok(await p.inputValue('#ed-re-date') === d(0), 'adding a retake dates it today');
await p.fill('#ed-re-score', '252');
await p.fill('#ed-re-pct', '78');
await p.locator('.sheet').screenshot({ path: S + '/retake-sheet.png' });
const saved = await local();
ok(saved.items['nbme-12'].retake.score === '252' && saved.items['nbme-12'].retake.pct === '78', 'retake score and % are saved');
ok(saved.items['nbme-12'].score === '240' && saved.items['nbme-12'].pct === '70', 'the first attempt is unchanged');
await p.fill('#ed-re-score', '999');
ok(await p.locator('#ed-re-score').evaluate((e) => e.closest('.field').classList.contains('bad')), 'an out-of-range retake score is flagged, not saved');
await p.fill('#ed-re-score', '252');
await p.keyboard.press('Escape');
await p.waitForTimeout(100);
const lines = await retakeLines();
ok(lines[0] === '252' && lines[1] === '78%' && lines[2] === fmtDate(d(0)), 'the list shows the retake on its own line: score, %, date: ' + JSON.stringify(lines));
ok((await row()).includes('240') && (await row()).includes('70%'), 'and still shows the first attempt');
const stat = await p.textContent('.group:has([data-open="nbme-12"]) .stat');
ok(stat.includes('avg 240'), 'group average uses the first attempt only: ' + stat.replace(/\s+/g, ' '));

// survives a reload
await p.reload(); await p.waitForTimeout(200); await p.keyboard.press('2');
ok((await retakeLines()).slice(0, 2).join() === '252,78%', 'retake still shown after reload');

// a phone: the list fits without sideways scroll
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(150);
ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll at phone width');
ok(await p.locator('[data-open="nbme-12"] .retake-row .dt').isVisible(), 'the retake date shows at phone width');
await p.locator('#tests').screenshot({ path: S + '/retake-phone.png' });
await p.setViewportSize({ width: 1280, height: 900 });
await p.waitForTimeout(150);
await p.locator('#tests').screenshot({ path: S + '/retake-desktop.png' });

// remove it again (with undo)
await p.click('[data-open="nbme-12"]');
await p.waitForSelector('.retake-box .linkish');
await p.click('.retake-box >> text=Remove retake');
await p.waitForTimeout(150);
const gone = await local();
ok(gone.items['nbme-12'].retake === undefined || gone.items['nbme-12'].retake === null, 'removing the retake clears it');
ok(await p.locator('.retake-box .linkish', { hasText: 'Add retake' }).count() === 1, 'the editor offers to add one again');
await p.keyboard.press('Escape');
ok((await retakeLines()).length === 0, 'and the list drops the retake line');

// --- the trend, calendar, print and CSV all know about the retake
const seed2 = { v: 2, items: { 'nbme-12': { status: 2, score: '240', pct: '70', date: d(-30), retake: { score: '255', pct: '80', date: d(-5) } },
  'nbme-13': { status: 2, score: '245', pct: '72', date: d(-20) }, 'cms-med-4': { status: 2, score: '70', date: d(-9), retake: { pct: '85', date: d(-2) } } } };
await p.evaluate((x) => localStorage.setItem('ck-tracker', JSON.stringify(x)), seed2);
await p.reload(); await p.waitForTimeout(300);
await p.keyboard.press('1'); // Overview
await p.waitForSelector('#trend svg');
ok(await p.locator('#trend circle.pt-re').count() === 1 && await p.locator('#trend circle.pt').count() === 2, 'the trend draws the retake as its own point beside the first attempts');
ok((await p.locator('#trend svg').getAttribute('aria-label')).includes('NBME 12 retake 255'), 'the trend’s text alternative names the retake');
ok((await p.textContent('#trend-legend')).includes('Retake'), 'the legend explains the retake mark');
await p.click('#chart-mode button[data-mode="pct"]');
ok(await p.locator('#trend circle.pt-re').count() === 1, 'the % correct trend shows it too');
await p.click('#chart-mode button[data-mode="score"]');
await p.locator('#trend').screenshot({ path: S + '/retake-trend.png' });
const out = await p.evaluate(async () => { const m = await import(document.querySelector('script[type=module]').src.replace('main.js', 'data.js')); return { n: m.outlook().pts.length, re: m.outlook().pts.some((x) => x.re) }; });
ok(out.n === 2 && !out.re, 'the outlook and projection keep using first attempts only');
const act = await p.evaluate(async () => { const m = await import(document.querySelector('script[type=module]').src.replace('main.js', 'overview.js')); const a = m.activityByDay(); return [...a.values()].flatMap((x) => x.tests.concat(x.cms)).filter((t) => /retake/.test(t)); });
ok(act.length === 2, 'the activity calendar lists both retakes on their days: ' + JSON.stringify(act));
await p.keyboard.press('3'); // CMS
ok(await p.locator('.chip .rt-mark').count() === 1, 'a retaken CMS form carries a ↻ mark');
const csv = await (async () => {
  await p.evaluate(() => { location.hash = '#settings'; }); await p.waitForTimeout(200);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('button', { hasText: 'Export CSV' }).first().click()]);
  return (await import('node:fs')).readFileSync(await dl.path(), 'utf8');
})().catch((e) => 'ERR ' + e.message);
const printed = await p.evaluate(async () => { const m = await import(document.querySelector('script[type=module]').src.replace('main.js', 'print.js')); return m.buildSummary().textContent; });
ok(/↻ retake/.test(printed) && printed.includes('255'), 'the printed summary lists the retake under its form');
ok(/retake,NBME,.*255,80/.test(csv) && /retake,.*85/.test(csv), 'the CSV export has retake rows');

ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
await browser.close();
