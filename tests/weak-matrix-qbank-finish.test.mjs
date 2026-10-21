import { chromium } from 'playwright';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const S = process.env.OUT_DIR;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const local = async () => { await p.waitForTimeout(400); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };
const d = (off) => { const t = new Date(Date.now() + off * 864e5); return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
// 14 marked assessments (lots of columns) + qbanks with progress
const sys = ['sys-renal', 'sys-cardio', 'sys-endo', 'sys-gi', 'sys-heme', 'sys-id', 'sys-psych', 'sys-biostat', 'sys-ethics', 'sys-resp', 'sys-neuro', 'sys-repro'];
const items = {};
[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].forEach((n, i) => { items['nbme-' + n] = { status: 2, score: String(220 + i * 3), date: d(-90 + i * 6), weak: [sys[i % 12], sys[(i * 5) % 12], 'sys-renal'].filter((x, j, a) => a.indexOf(x) === j) }; });
[1, 2, 3].forEach((n, i) => { items['uwsa-' + n] = { status: 2, score: String(240 + i), date: d(-20 + i * 5), weak: i === 2 ? ['sys-gi', 'sys-endo'] : ['sys-cardio', 'sys-gi'] }; });
await p.goto(BASE + '');
await p.evaluate(({ items, d0, d1 }) => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, items, prefs: { examDate: d0 },
  qbanks: [{ id: 'uworld', name: 'UWorld', bank: '3800', done: '94', unit: 'pct', acc: '65' }, { id: 'amboss', name: 'AMBOSS', bank: '3509', done: '930', unit: 'q', acc: '69' }] })), { items, d0: d(30), d1: d(-1) });
await p.reload(); await p.waitForTimeout(200);

// --- qbank: finish early, then mark weak systems
ok((await p.textContent('#next')).includes('UWorld 228 left') && (await p.textContent('#next')).includes('AMBOSS'), 'pace includes both before finishing');
await p.keyboard.press('5');
await p.click('[data-open="qb-uworld"]');
ok((await p.textContent('.qb-fin-box')).includes('you can finish early') && await p.locator('.qb-fin-box .weak-pick').count() === 0, 'finish switch offered, weak picker hidden until finished');
await p.check('#qb-fin');
ok(await p.inputValue('#qb-fin-date') === d(0) && await p.locator('.qb-fin-box .weak-pick').count() === 1, 'finished today; weak picker appears');
for (const n of ['Renal', 'Endocrine']) await p.click(`.qb-fin-box .weak-pick .tag:text-is("${n}")`);
await p.keyboard.press('Escape');
let s = await local();
const uw = s.qbanks.find((q) => q.id === 'uworld');
ok(uw.finished === d(0) && JSON.stringify(uw.weak) === '["sys-renal","sys-endo"]', 'qbank finished + weak saved: ' + JSON.stringify([uw.finished, uw.weak]));
const card = await p.textContent('[data-open="qb-uworld"]');
ok(card.includes('✓ Finished') && card.includes('Weak: Renal, Endocrine') && !card.includes('left'), 'card shows finished + weak: ' + card);
await p.keyboard.press('1'); await p.waitForTimeout(200);
const nx = await p.textContent('#next');
ok(!nx.includes('UWorld 228 left') && nx.includes('AMBOSS 2,579 left'), 'finished qbank drops out of the pace');

// --- matrix with many columns + qbank column
const cols = await p.locator('#weak .wm-col').allTextContents();
ok(cols.length === 15 && cols[0] === 'N6' && cols[13] === 'U3' && cols[14] === 'UW', 'columns: 14 assessments oldest→newest, then the qbank: ' + cols.join(' '));
const renal = await p.locator('#weak button.wm-row', { hasText: 'Renal' }).first().evaluate((e) => [e.querySelectorAll('.wm-cell.on').length, e.querySelectorAll('.wm-cell.on.qb').length, e.querySelector('.wm-tot b').textContent]);
ok(JSON.stringify(renal) === '[12,1,"12"]', 'Renal: 11 NBMEs + UWorld = 12, one qbank cell: ' + JSON.stringify(renal));
ok((await p.locator('#weak button.wm-row').first().locator('.wm-name').textContent()).startsWith('Renal'), 'most frequent first');
const gi = await p.locator('#weak button.wm-row', { hasText: 'Gastrointestinal' }).first();
ok(await gi.locator('.wm-recent').count() === 1, 'GI marked as recent (weak in the last 2 UWSAs)');
ok(await p.locator('#weak button.wm-row').count() === 10 && (await p.textContent('#weak')).includes('Show all 12 systems'), 'top 10, with show all');
await p.click('#weak >> text=Show all 12 systems');
ok(await p.locator('#weak button.wm-row').count() === 12, 'show all');
ok((await p.textContent('#weak')).includes('14 assessments and 1 finished qbank marked'), 'summary counts sources');
await p.click('#weak .wm-col >> nth=0'); ok((await p.textContent('.sheet h2')).includes('Form 6'), 'tapping a column opens that form'); await p.keyboard.press('Escape');
await p.click('#weak .wm-col.qb'); ok(await p.isVisible('#qb-fin'), 'tapping the qbank column opens the qbank'); await p.keyboard.press('Escape');
await p.locator('#weak').screenshot({ path: S + '/matrix.png' });
await p.evaluate(() => document.documentElement.dataset.theme = 'dark'); await p.locator('#weak').screenshot({ path: S + '/matrix-dark.png' }); await p.evaluate(() => delete document.documentElement.dataset.theme);
// systems badge counts qbank too
await p.keyboard.press('4');
ok((await p.textContent('#sys-rows')).includes('Weak 12×'), 'systems badge includes qbank');
// un-finish: the qbank column goes away, its picks are kept
await p.keyboard.press('5'); await p.click('[data-open="qb-uworld"]'); await p.uncheck('#qb-fin'); await p.keyboard.press('Escape');
await p.keyboard.press('1'); await p.waitForTimeout(150);
ok(await p.locator('#weak .wm-col.qb').count() === 0 && JSON.stringify((await local()).qbanks[0].weak) === '["sys-renal","sys-endo"]', 'unfinished qbank leaves the matrix; picks kept');
// phone: matrix scrolls inside its card, page doesn't
await p.setViewportSize({ width: 375, height: 800 }); await p.waitForTimeout(200);
const wd = await p.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('.wm-scroll').scrollWidth > document.querySelector('.wm-scroll').clientWidth]);
ok(wd[0] <= 375 && wd[1], 'phone: page fits, matrix scrolls sideways ' + JSON.stringify(wd));
await p.locator('#weak').screenshot({ path: S + '/matrix-phone.png' });
ok(errs.length === 0, 'no errors ' + JSON.stringify(errs));
await b.close();
