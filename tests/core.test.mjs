import { chromium } from 'playwright';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const S = process.env.OUT_DIR;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const local = async () => { await p.waitForTimeout(400); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };
const d = (off) => { const t = new Date(Date.now() + off * 864e5); return t.toISOString().slice(0, 10); };

// seed a v1 save (old single-file format) incl. old merged system ids and a junk entry
await p.goto(BASE + '');
await p.evaluate((d) => localStorage.setItem('ck-tracker', JSON.stringify({ v: 1,
  items: { 'nbme-9': { status: 2, score: '231', date: d[0], notes: 'weak cardio' }, 'nbme-10': { status: 1, score: '238', date: d[1] }, 'nbme-11': { status: 1, score: '244', date: d[2] },
    'cms-med-3': { status: 1, score: '72', date: d[1] }, 'cms-surg-9': { status: 3, score: '84' } },
  systems: { 'sys-ob': { status: 2, conf: 3, notes: 'ob note', tags: ['Sketchy'] }, 'sys-gyn': { status: 1, conf: 4, notes: 'gyn', tags: ['UWorld'] }, 'sys-cardio': { status: 3, conf: 2, tags: 5 } },
  extraForms: { med: [11, 'x'], em: 'bad' }, extraSystems: [{ id: 'sys-xabc', name: 'Vascular' }, { bad: 1 }], removed: ['cms-psych-8'], prefs: { showOld: false } })), [d(-30), d(-20), d(-10)]);
await p.reload();
await p.waitForTimeout(300);
ok(await p.locator('#tiles .tile').count() === 6, '6 overview tiles');
ok((await p.textContent('#ct-nbme')).trim() === '3/18', 'assessment count 3/18 (with AMBOSS SA 1): ' + await p.textContent('#ct-nbme'));
ok(await p.locator('#trend svg circle').count() > 0, 'trend chart drawn');

// systems migration
await p.keyboard.press('4');
const sysTxt = await p.textContent('#sys-rows');
ok(sysTxt.includes('Vascular') && !sysTxt.includes('undefined'), 'extra system kept');
const repro = await p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker')).systems);
ok(true, 'systems keys ' + Object.keys(repro).join(','));

// Assessments tab: log UWSA 1 with score + pct
await p.keyboard.press('2');
ok(await p.locator('#tests .group').count() === 4 && (await p.textContent('#tests')).includes('AMBOSS SA 1'), '4 assessment groups (NBME, UWSA, Free 120, AMBOSS SA)');
const t = await p.textContent('#tests');
ok(t.includes('UWSA 3') && t.includes('2023 release') && t.includes('2019 release'), 'UWSA 1-3 and Free 120 listed');
await p.click('#tests [data-open="uwsa-1"]');
await p.fill('#ed-score', '252');
await p.fill('#ed-pct', '78');
ok((await p.textContent('.sheet .hint')).includes('125/160'), 'conversion hint: ' + await p.textContent('.sheet .hint'));
await p.fill('#ed-date', d(-3)); await p.dispatchEvent('#ed-date', 'change');
// invalid value
await p.fill('#ed-score', '400');
ok(await p.locator('.field.bad').count() === 1, 'out-of-range score flagged');
await p.fill('#ed-score', '252');
await p.keyboard.press('Escape');
ok((await p.textContent('#tests [data-open="uwsa-1"]')).includes('252') && (await p.textContent('#tests [data-open="uwsa-1"]')).includes('78%'), 'UWSA row shows 252 and 78%');
ok(await p.evaluate(() => document.activeElement.dataset.open) === 'uwsa-1', 'focus returned to opener');

// NBME pct
await p.click('#tests [data-open="nbme-11"]');
await p.fill('#ed-pct', '84.6');
await p.keyboard.press('Escape');
ok((await p.textContent('#tests [data-open="nbme-11"]')).includes('85%'), 'NBME shows rounded 85%');

// Free 120
await p.click('#tests [data-open="f120-2021"]');
ok(await p.locator('#ed-score').count() === 0, 'Free 120 has no 3-digit field');
await p.fill('#ed-pct', '71');
await p.keyboard.press('Escape');

// remove + restore (from the form, and with Edit list), add form
await p.click('#tests [data-open="nbme-6"]');
await p.locator('.sheet button', { hasText: 'Remove form' }).click();
ok(!(await p.textContent('#tests')).includes('Form 6'), 'NBME 6 removed from the list');
await p.click('text=1 removed · restore');
ok(await p.isVisible('#tests .editbar') && (await p.textContent('#tests [data-edit="nbme-6"]')).includes('Restore'), 'the link opens Edit list, NBME 6 shown as removed');
await p.click('#tests [data-edit="nbme-6"] .rm-btn');
await p.click('#tests [data-edit="uwsa-3"] .rm-btn');
ok((await p.getAttribute('#tests [data-edit="uwsa-3"]', 'class')).includes('removed') && (await local()).removed.includes('uwsa-3') && !(await local()).removed.includes('nbme-6'), 'Edit list: NBME 6 back, UWSA 3 removed (kept in the list, greyed)');
await p.click('#edit-tests');
ok((await p.textContent('#tests')).includes('Form 6') && !(await p.locator('#tests [data-open="uwsa-3"]').count()) && (await p.textContent('#ct-nbme')).trim().endsWith('/17'), 'done: NBME 6 listed, UWSA 3 not, and not counted');
await p.click('#edit-tests'); await p.click('#tests [data-edit="uwsa-3"] .rm-btn'); await p.click('#edit-tests');
await p.click('#tests .group:first-child .add-link');
await p.fill('#tests .add-row input', '17'); await p.keyboard.press('Enter');
ok((await p.textContent('#tests')).includes('Form 17'), 'NBME 17 added');

// CMS re-add removed form bug
await p.keyboard.press('3');
await p.click('#edit-forms');
await p.click('[aria-label="Remove Surgery Form 7"]');
await p.click('#cms-list .editbar button');
await p.click('#cms-surg .add-chip');
await p.fill('#cms-surg .add-form input', '7'); await p.keyboard.press('Enter');
ok(await p.locator('[aria-label^="Surgery Form 7"]').count() === 1, 'removed CMS form re-added via Add form');
ok((await p.textContent('#toasts')).includes('back on the list'), 'toast: ' + await p.textContent('#toasts'));

// qbank
await p.keyboard.press('5');
for (const [q, pc, off] of [[40, 65, 0], [80, 70, -1], [40, '', -2]]) {
  await p.fill('#lg-date', d(off)); await p.fill('#lg-q', String(q)); await p.fill('#lg-pct', String(pc));
  await p.click('#log-form button[type=submit]');
}
ok(await p.locator('#qb-list .lrow').count() === 3, '3 sessions logged');
ok((await p.textContent('#qb-tiles')).includes('68%'), 'weighted accuracy 68%: ' + await p.textContent('#qb-tiles'));
await p.fill('#lg-q', '0'); await p.click('#log-form button[type=submit]');
ok((await p.textContent('#lg-err')).length > 0, 'invalid session rejected');
await p.click('#qb-list .lrow .xs');
ok(await p.locator('#qb-list .lrow').count() === 2, 'session deleted');
await p.click('#toasts button');
ok(await p.locator('#qb-list .lrow').count() === 3, 'undo restored session');

// settings
await p.keyboard.press(',');
await p.fill('#st-exam', d(28)); await p.dispatchEvent('#st-exam', 'change');
await p.fill('#st-target', '255');

await p.click('#view-settings button:has-text("Dark")');
ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark theme applied');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#st-export')]);
const backupPath = S + '/backup.json'; await dl.saveAs(backupPath);
const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#view-settings button:has-text("Export CSV")')]);
await dl2.saveAs(S + '/export.csv');
await p.keyboard.press('Escape');
await p.keyboard.press('1');
await p.waitForTimeout(200);
const tiles = await p.textContent('#tiles');
ok(tiles.includes('28') && tiles.includes('days to go'), 'countdown tile');
ok(tiles.includes('projected'), 'projection shown: ' + tiles);
ok((await p.textContent('#next')).includes('Pace'), 'pace in up next');
ok(await p.locator('#heat .hc.m-ex, #heat .hc.m-cms').count() >= 3, 'exam days on heatmap');
await p.screenshot({ path: S + '/overview-dark.png', fullPage: true });
await p.click('#chart-mode [data-mode=pct]');
ok((await p.textContent('#trend')).includes('%'), 'pct chart mode');
await p.click('#chart-mode [data-mode=score]');

// reload persistence
await p.reload(); await p.waitForTimeout(300);
ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'theme persisted');
ok((await p.textContent('#ct-qb')).trim() === '160', 'qbank persisted: ' + await p.textContent('#ct-qb'));

// erase + import backup
await p.keyboard.press(',');
await p.click('text=Erase all data'); await p.click('text=Tap again to erase everything');
await p.waitForTimeout(400);
ok((await p.textContent('#ct-nbme')).trim() === '0/18', 'erased: ' + await p.textContent('#ct-nbme'));
await p.keyboard.press('Escape'); await p.keyboard.press('1');
ok(await p.locator('#welcome .welcome').count() === 1, 'welcome card shown when empty');
await p.setInputFiles('#import', backupPath);
await p.waitForTimeout(300);
ok((await p.textContent('#ct-nbme')).trim() === '5/19', 'import restored: ' + await p.textContent('#ct-nbme'));

// light mode + mobile screenshots
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ck-tracker')); s.prefs.theme = 'light'; localStorage.setItem('ck-tracker', JSON.stringify(s)); });
await p.reload(); await p.waitForTimeout(300);
await p.screenshot({ path: S + '/overview-light.png', fullPage: true });
await p.keyboard.press('2'); await p.screenshot({ path: S + '/tests.png', fullPage: true });
await p.keyboard.press('5'); await p.screenshot({ path: S + '/qbank.png', fullPage: true });
await p.setViewportSize({ width: 375, height: 800 });
await p.keyboard.press('1'); await p.waitForTimeout(300);
await p.screenshot({ path: S + '/m-overview.png', fullPage: true });
const ow = await p.evaluate(() => document.documentElement.scrollWidth);
ok(ow <= 375, 'no horizontal scroll on phone: ' + ow);
await p.keyboard.press('2'); await p.click('#tests [data-open="uwsa-1"]'); await p.waitForTimeout(300);
await p.screenshot({ path: S + '/m-sheet.png' });
await p.keyboard.press('Escape');
for (const k of ['3','4','5']) { await p.keyboard.press(k); const w = await p.evaluate(() => document.documentElement.scrollWidth); ok(w <= 375, 'tab ' + k + ' width ' + w); }

// offline via service worker
await p.setViewportSize({ width: 1200, height: 900 });
await p.evaluate(() => navigator.serviceWorker.ready);
await p.reload(); await p.waitForTimeout(500);
await ctx.setOffline(true);
await p.reload(); await p.waitForTimeout(500);
ok((await p.textContent('h1')).includes('tracker') && (await p.textContent('#ct-nbme')).trim() === '5/19', 'works offline');
await ctx.setOffline(false);

ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
await b.close();
