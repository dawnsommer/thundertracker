// November 2026 redesign: Systems as cards (its own resources, notes pages, AMBOSS, a small summary),
// a shorter Up next, the activity calendar (NBME / CMS fills, AMBOSS hatch) and the overview with Passive on.
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const S = process.env.OUT_DIR;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const local = async () => { await p.waitForTimeout(400); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };
const d = (off) => new Date(Date.now() + off * 864e5).toISOString().slice(0, 10);

await p.goto(BASE);
await p.evaluate((x) => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { passive: true, examDate: x.ex },
  items: { 'nbme-11': { status: 1, score: '240', date: x.a, weak: ['sys-renal'] }, 'nbme-12': { status: 1, score: '244', date: x.b, weak: ['sys-renal'] }, 'cms-med-5': { status: 1, score: '72', date: x.c } },
  log: [{ id: 'l1', date: x.c2, q: 40, src: 'AMBOSS' }, { id: 'l2', date: x.c3, q: 40, src: 'UWorld' }],
  systems: { 'sys-cardio': { status: 3, conf: 4 }, 'sys-gi': { status: 1, pg: 'abc', pd: -4, res: 'Sketchy', amb: 'soon' } } })),
{ ex: d(30), a: d(-20), b: d(-10), c: d(-5), c2: d(-4), c3: d(-3) });
await p.reload();

await p.click('#tab-systems');
let s;
ok((await p.locator('#sys-rows .sys').count()) === 17, '17 system cards');
ok(/1\s*of 17 revised/.test(await p.textContent('#sys-sum')), 'summary: 1 of 17 revised');

const card = (id) => p.locator('#sys-rows .sys', { has: p.locator(`[data-open="${id}"]`) });
const chips = async (id) => (await card(id).locator('.sys-res .tag:not(.add)').allTextContents()).map((t) => t.replace('✓ ', ''));
// odd saved values (pages 'abc', a pick that isn't a list) are cleaned up
ok(JSON.stringify(await chips('sys-gi')) === '["Sketchy","CKNotes","Inner Circle"]', 'a bad saved pick falls back to the default resources: ' + JSON.stringify(await chips('sys-gi')));

// --- a system's own resources
await card('sys-cardio').locator('.tag.add').click();
await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'ed-res-new');
await p.click('.sheet .res-own [data-res="FirstAid"]');
await p.click('.sheet .res-own [data-res="Sketchy"]');
await p.fill('#ed-res-new', 'Boards & Beyond'); await p.keyboard.press('Enter');
s = await local();
ok(JSON.stringify(s.systems['sys-cardio'].res) === '["CKNotes","Inner Circle","FirstAid","Boards & Beyond"]', 'own pick saved: ' + JSON.stringify(s.systems['sys-cardio'].res));
await p.locator('.sheet .field', { hasText: 'Resources done' }).locator('.tag', { hasText: 'Boards & Beyond' }).click();
s = await local();
ok(s.systems['sys-cardio'].tags.includes('Boards & Beyond'), 'your own resource can be ticked done');
await p.keyboard.press('Escape');
ok(JSON.stringify(await chips('sys-cardio')) === '["CKNotes","Inner Circle","FirstAid","Boards & Beyond"]', 'card shows its own resources');
ok(JSON.stringify(await chips('sys-renal')) === '["Sketchy","CKNotes","Inner Circle"]', 'other systems keep the default');
await p.click('#sys-res-btn');
ok((await p.textContent('#sys-res')).includes('except the 1 with their own pick'), 'default picker says one system has its own');
await p.click('#sys-res [data-res="Sketchy"]');
ok(JSON.stringify(await chips('sys-renal')) === '["CKNotes","Inner Circle"]' && (await chips('sys-cardio')).includes('FirstAid'), 'changing the default leaves the own pick alone');
await p.click('#sys-res [data-res="Sketchy"]');
await card('sys-cardio').locator('[data-open]').click();
await p.click('.sheet >> text=Use the default resources');
await p.keyboard.press('Escape');
s = await local();
ok(s.systems['sys-cardio'].res === null && JSON.stringify(await chips('sys-cardio')) === '["Sketchy","CKNotes","Inner Circle"]', 'Use the default resources resets the pick');

// --- notes pages
await card('sys-renal').locator('.sys-nt-add').click();
await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'ed-pg');
await p.fill('#ed-pg', '120'); await p.fill('#ed-pd', '30');
await p.keyboard.press('Escape');
ok((await card('sys-renal').locator('.pg-in').inputValue()) === '30' && (await card('sys-renal').textContent()).includes('/ 120 p'), 'card shows 30 / 120 pages');
await card('sys-renal').locator('.pg-in').fill('60'); await card('sys-renal').locator('.pg-in').press('Enter');
s = await local();
ok(s.systems['sys-renal'].pd === 60 && s.systems['sys-renal'].pg === 120 && s.systems['sys-renal'].day === d(0), 'pages done updated from the card (dated today)');
ok((await p.textContent('#sys-sum')).includes('50%') && (await p.textContent('#sys-sum')).includes('60 of 120 pages'), 'summary: notes 50%');
await card('sys-renal').locator('.pg-in').fill('500'); await card('sys-renal').locator('.pg-in').press('Enter');
s = await local();
ok(s.systems['sys-renal'].pd === 120, 'pages done can’t pass the total');

// --- AMBOSS
ok((await card('sys-cardio').locator('.amb-tog').textContent()) === 'Add to AMBOSS' && (await p.textContent('#sys-sum')).includes('1 revised, not added yet'), 'a revised system is ready for AMBOSS');
await card('sys-cardio').locator('.amb-tog').click();
s = await local();
ok(s.systems['sys-cardio'].amb === d(0) && (await card('sys-cardio').locator('.amb-tog').getAttribute('aria-pressed')) === 'true', 'marked as added to AMBOSS today');
ok(/1\s*of 17 added/.test(await p.textContent('#sys-sum')), 'summary: 1 of 17 added');
await p.selectOption('#sys-sort', 'amb');
ok(!(await p.locator('#sys-rows .sys').first().textContent()).includes('Cardiovascular') && (await p.locator('#sys-rows .sys').last().textContent()).includes('Cardiovascular'), 'Not in AMBOSS first puts Cardiovascular last');
await p.selectOption('#sys-sort', 'default');
await p.locator('#view-systems').screenshot({ path: S + '/systems-cards.png' });

// --- overview: tile, Up next, calendar, layout
await p.click('#tab-overview'); await p.waitForTimeout(200);
ok((await p.textContent('#tiles')).includes('1 in AMBOSS') && (await p.textContent('#tiles')).includes('notes 100%'), 'systems tile: AMBOSS and notes');
const items = await p.locator('#next li:not(.next-more)').count();
ok(items <= 6, 'Up next shows a few items (' + items + ')');
const more = p.locator('#next .next-more button');
if (await more.count()) {
  await more.click();
  ok((await p.locator('#next li:not(.next-more)').count()) > items, 'more suggestions expand the list');
  await p.click('#next .next-more button');
}
const cls = (ds) => p.locator(`#heat .hc[data-day="${ds}"]`).getAttribute('class');
ok((await cls(d(-10))).includes('m-ex') && !(await cls(d(-10))).includes('m-amb'), 'NBME day filled (m-ex)');
ok((await cls(d(-5))).includes('m-cms'), 'CMS day filled (m-cms)');
ok((await cls(d(-4))).includes('m-amb') && !(await cls(d(-3))).includes('m-amb'), 'AMBOSS qbank day hatched, UWorld day not');
ok((await cls(d(0))).includes('m-amb'), 'adding a system to AMBOSS hatches today');
await p.click(`#heat .hc[data-day="${d(0)}"]`);
ok((await p.textContent('.heat-detail')).includes('Added to AMBOSS: Cardiovascular'), 'day detail names it');
ok(await p.evaluate(() => document.getElementById('ov-bottom').classList.contains('has-extras')), 'Passive on: summary cards in a row under the matrix');
await p.locator('#ov-bottom').screenshot({ path: S + '/overview-bottom.png' });
await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('ck-tracker')); x.prefs.passive = false; localStorage.setItem('ck-tracker', JSON.stringify(x)); });
await p.reload(); await p.waitForTimeout(200);
ok(!(await p.evaluate(() => document.getElementById('ov-bottom').classList.contains('has-extras'))), 'Passive off: matrix beside the articles card');

// --- phone: no sideways scroll
await p.setViewportSize({ width: 375, height: 800 });
for (const t of ['overview', 'systems']) {
  await p.click('#tab-' + t); await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), t + ' fits a phone');
}
ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
await b.close();
