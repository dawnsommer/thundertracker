import { chromium } from 'playwright';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const S = process.env.OUT_DIR;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const local = async () => { await p.waitForTimeout(400); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };
await p.goto(BASE + '');
await p.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2,
  items: { 'nbme-9': { status: 2, score: '231', date: '2026-09-01' }, 'nbme-10': { status: 2, score: '238', date: '2026-09-15' }, 'uwsa-1': { status: 1, score: '240', date: '2026-10-01' } },
  articles: { 'amb-psqi-patient-safety': { reads: 5, date: '2026-10-10' }, 'amb-nutrition-vitamins': { reads: 2, date: '2026-10-12' }, 'amb-extra-death': { reads: 1, date: '2026-10-01' } } })));
await p.reload();

// --- weak systems on forms
await p.keyboard.press('2');
const mark = async (id, names) => { await p.click(`#tests [data-open="${id}"]`); for (const n of names) await p.click(`.weak-pick .tag:text-is("${n}")`); await p.keyboard.press('Escape'); };
await mark('nbme-9', ['Renal', 'Cardiovascular']);
await mark('nbme-10', ['Renal', 'Biostatistics']);
await mark('uwsa-1', ['Renal', 'Cardiovascular', 'Endocrine']);
let s = await local();
ok(JSON.stringify(s.items['nbme-9'].weak) === '["sys-renal","sys-cardio"]', 'weak systems saved on the form');
ok((await p.textContent('#tests [data-open="nbme-10"]')).includes('Weak: Renal, Biostatistics'), 'assessment row shows weak systems');
await p.click('#tests [data-open="nbme-9"]'); await p.click('.weak-pick .tag:text-is("✓ Cardiovascular")'); await p.click('.weak-pick .tag:text-is("Cardiovascular")'); await p.keyboard.press('Escape');
ok(JSON.stringify((await local()).items['nbme-9'].weak.sort()) === '["sys-cardio","sys-renal"]', 'toggle off and on');
await p.keyboard.press('1'); await p.waitForTimeout(200);
const wk = await p.textContent('#weak');
const mrows = await p.locator('#weak button.wm-row').evaluateAll((els) => els.map((e) => [e.querySelector('.wm-name').firstChild.textContent, e.querySelectorAll('.wm-cell.on').length, e.querySelector('.wm-tot b').textContent]));
ok(!wk.includes('null') && JSON.stringify(mrows) === JSON.stringify([['Renal', 3, '3'], ['Cardiovascular', 2, '2'], ['Biostatistics', 1, '1'], ['Endocrine', 1, '1']]), 'matrix rows: ' + JSON.stringify(mrows));
ok(await p.locator('#weak .wm-row.rec').count() === 2 && wk.includes('Recurring: Renal 3× · Cardiovascular 2×'), 'two recurring (2+) highlighted and summarised');
ok(JSON.stringify(await p.locator('#weak .wm-col').allTextContents()) === '["N9","N10","U1"]', 'columns oldest to newest');
ok((await p.textContent('#next')).includes('Renal (3×), Cardiovascular (2×) keep coming up weak'), 'up next names the pattern');
await p.click('#weak button.wm-row >> nth=0'); ok((await p.textContent('.sheet h2')).includes('Renal'), 'tapping a bar opens the system'); await p.keyboard.press('Escape');
await p.keyboard.press('4');
ok((await p.textContent('#sys-rows')).includes('Weak 3×'), 'systems tab badge');
await p.keyboard.press('1'); await p.waitForTimeout(150);
await p.locator('#weak').screenshot({ path: S + '/weak.png' });

// --- articles: summary, grid, sort, collapse, arrange
await p.keyboard.press('6');
const sum = (await p.textContent('#art-summary')).replace(/\s+/g, '');
ok(/Read3of26/.test(sum) && /Read-throughs8of130/.test(sum) && /Done5×1articles/.test(sum), 'summary totals: ' + sum.slice(0, 120));
ok(await p.locator('#art-list .acard').count() === 26, 'grid shows all 26 as cards');
const vis = await p.evaluate(() => [...document.querySelectorAll('#art-list .acard')].filter((e) => e.getBoundingClientRect().top < innerHeight).length);
await p.click('#art-view [data-view=list]');
const visList = await p.evaluate(() => [...document.querySelectorAll('#art-list .art')].filter((e) => e.getBoundingClientRect().top < innerHeight).length);
ok(vis > visList, 'grid fits more on screen than list (' + vis + ' vs ' + visList + ' in first screen)');
await p.click('#art-view [data-view=grid]');
await p.selectOption('#art-sort', 'least');
let first = await p.locator('#art-sec-psqi .acard .ac-nm').first().textContent();
ok(first === 'Quality improvement', 'fewest reads first within section');
await p.selectOption('#art-sort', 'most');
ok((await p.locator('#art-sec-nutrition .acard .ac-nm').first().textContent()) === 'Vitamins', 'most reads first');
await p.selectOption('#art-sort', 'checklist');
await p.click('#art-sec-ethics .chev');
ok(await p.locator('#art-sec-ethics .acard').count() === 0 && (await local()).prefs.artCollapsed.includes('sec-ethics'), 'collapse a section (saved)');
await p.click('#art-sec-ethics .chev');
await p.click('#art-collapse'); ok(await p.locator('#art-list .acard').count() === 0, 'collapse all');
await p.click('#art-collapse'); ok(await p.locator('#art-list .acard').count() === 26, 'expand all');
await p.click('#art-arrange');
await p.click('[data-move="sec-extra:top"]');
await p.click('[data-move="sec-psqi:end"]');
await p.click('[data-move="sec-nutrition:-1"]');
let order = await p.locator('#art-list .art-sec h3').allTextContents();
ok(order[0] === 'Recommended Extra Articles' && order[order.length - 1] === 'High-Yield Patient Safety & Quality Improvement', 'arrange: top/end moves: ' + order.map((x) => x.split(' ').slice(-1)).join(','));
ok(order.indexOf('High-Yield Nutrition') === 3 && order.indexOf('High-Yield Biostatistics & Epidemiology') === 4, 'arrange: move up');
// focus returns after the re-render (a setTimeout), so wait for it rather than racing it
const focused = await p.waitForFunction(() => document.activeElement && document.activeElement.dataset.move === 'sec-nutrition:-1', null, { timeout: 2000 }).then(() => true, () => false);
ok(focused, 'focus stays on the move button');
await p.click('#art-arrange');
s = await local();
ok(s.prefs.artOrder[0] === 'sec-extra', 'order saved (syncs)');
await p.reload(); await p.waitForTimeout(200);
ok((await p.locator('#art-list .art-sec h3').first().textContent()) === 'Recommended Extra Articles', 'order kept after reload');
// overview mini card jumps into the section
await p.keyboard.press('1'); await p.waitForTimeout(150);
ok((await p.textContent('#art-mini')).includes('3/26'), 'overview article card');
await p.click('#art-mini .sbar:has-text("Nutrition")'); await p.waitForTimeout(300);
ok(await p.evaluate(() => location.hash) === '#articles' && await p.evaluate(() => { const r = document.getElementById('art-sec-nutrition').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }), 'mini card jumps to the section');
await p.screenshot({ path: S + '/articles2.png', fullPage: false });

// --- settings page
await p.keyboard.press(',');
ok(await p.isVisible('#view-settings') && !(await p.isVisible('#view-articles')) && await p.evaluate(() => location.hash) === '#settings', 'settings is its own page');
ok(await p.locator('.set-nav a').count() === 8 && await p.locator('.set-card').count() === 8, 'nav + 8 sections');
await p.fill('#st-target', '255');
await p.type('#st-target', '');
ok(await p.evaluate(() => document.activeElement.id) === 'st-target', 'typing in settings keeps focus');
await p.waitForTimeout(400);
ok((await local()).prefs.target === '255', 'target saved');
await p.click('.set-nav a:text("Qbanks")'); await p.waitForTimeout(500);
await p.click('#set-qbanks button:has-text("Edit") >> nth=1'); await p.fill('#qb-bank', '3509'); await p.keyboard.press('Escape');
ok((await p.textContent('#set-qbanks')).includes('3,509 questions'), 'qbank edit from settings refreshes the page');
await p.screenshot({ path: S + '/settings.png', fullPage: true });
await p.click('#view-settings button:has-text("Dark")');
ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'theme from settings');
await p.screenshot({ path: S + '/settings-dark.png' });
await p.click('#settings-back');
ok(await p.isVisible('#view-articles'), 'back returns to where you were (articles)');
await p.keyboard.press(','); await p.keyboard.press('Escape');
ok(await p.isVisible('#view-articles'), 'Esc leaves settings');
await p.keyboard.press(','); await p.goBack(); await p.waitForTimeout(200);
ok(await p.isVisible('#view-articles'), 'browser Back leaves settings');
await p.setViewportSize({ width: 375, height: 800 });
await p.keyboard.press(','); await p.waitForTimeout(200);
await p.screenshot({ path: S + '/m-settings.png' });
ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 375, 'settings fits a phone');
await p.keyboard.press('Escape'); await p.keyboard.press('6'); await p.waitForTimeout(200);
ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 375, 'articles fit a phone');
await p.screenshot({ path: S + '/m-articles2.png' });
ok(errs.length === 0, 'no errors ' + JSON.stringify(errs));
await b.close();
