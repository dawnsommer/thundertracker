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
  systems: { 'sys-cardio': { status: 3, conf: 4 }, 'sys-gi': { status: 1, rs: 'Sketchy', amb: 'soon' } } })),
{ ex: d(30), a: d(-20), b: d(-10), c: d(-5), c2: d(-4), c3: d(-3) });
await p.reload();

await p.click('#tab-systems');
let s;
const row = (id) => p.locator(`#sys-rows .sys[data-sys="${id}"]`);
const group = (k) => p.locator(`#sys-rows .g-${k} .sys`);
ok((await p.locator('#sys-rows .sys').count()) === 17, '17 systems listed');
ok(!(await p.$('#sys-res-btn')) && !(await p.$('#sys-sort')), 'no default-resources picker or sort menu');
ok((await group('ready').count()) === 1 && (await row('sys-cardio').textContent()).includes('Revised — add it to AMBOSS'), 'a revised system sits under “Revised · add to AMBOSS” and says so');
ok((await group('doing').count()) === 1 && (await group('todo').count()) === 15, 'groups: 1 in progress (GI is Learning), 15 not started');
// odd saved values are cleaned up: a list that isn't one falls back to the old picks
ok((await row('sys-gi').textContent()).includes('Next: Sketchy'), 'a bad saved list falls back');

// --- each system has its own resources with progress
await row('sys-renal').locator('.sys-tg').click();
ok((await row('sys-renal').getAttribute('class')).includes('open') && (await row('sys-renal').locator('.rs').count()) === 3, 'tapping a system opens its resources (old picks: 3)');
await row('sys-renal').locator('[data-open]').click();
await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'ed-res-new');
// remove Inner Circle, add your own, set totals and units
await p.locator('.sheet .re', { hasText: 'Inner Circle' }).locator('.re-x').click();
await p.fill('#ed-res-new', 'Boards & Beyond'); await p.keyboard.press('Enter');
await p.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('re-tot'));
await p.keyboard.type('12'); await p.keyboard.press('Tab');
await p.locator('.sheet .re', { hasText: 'Boards & Beyond' }).locator('.re-u').selectOption('videos');
const ck = p.locator('.sheet .re', { hasText: 'CKNotes' });
await ck.locator('.re-tot').fill('90'); await ck.locator('.re-tot').press('Tab');
await ck.locator('.re-d').fill('30'); await ck.locator('.re-d').press('Tab');
await ck.locator('.re-u').selectOption('pages');
s = await local();
ok(JSON.stringify(s.systems['sys-renal'].rs) === JSON.stringify([{ n: 'Sketchy', d: 0, tot: '', u: '' }, { n: 'CKNotes', d: 30, tot: 90, u: 'pages' }, { n: 'Boards & Beyond', d: 0, tot: 12, u: 'videos' }]), 'own list saved with progress: ' + JSON.stringify(s.systems['sys-renal'].rs));
ok((await p.locator('.sheet .res-sug [data-res="Inner Circle"]').count()) === 1, 'a removed resource is offered again');
await p.keyboard.press('Escape');
ok((await row('sys-renal').textContent()).includes('30 / 90 pages'), 'row shows 30 / 90 pages');
ok((await row('sys-cardio').locator('.sys-tg .nx').textContent()).includes('add it to AMBOSS') && (await row('sys-endo').textContent()).includes('Next: Sketchy'), 'other systems keep their own lists');
// step +1 and tick done
await row('sys-renal').locator('.rs', { hasText: 'CKNotes' }).locator('.rs-step button').nth(1).click();
s = await local();
ok(s.systems['sys-renal'].rs[1].d === 31 && s.systems['sys-renal'].day === d(0), '+ adds a page (dated today)');
await row('sys-renal').locator('.rs', { hasText: 'Sketchy' }).locator('.rs-chk').click();
s = await local();
ok(s.systems['sys-renal'].rs[0].d === 1, 'a resource without a total is ticked done');
ok((await row('sys-renal').locator('.sys-tg .nx').textContent()).includes('Next: CKNotes · 59 pages left'), 'next step: the resource you’re in, with what’s left');
ok((await group('doing').count()) === 2, 'progress moves it to In progress');
await row('sys-renal').locator('.rs', { hasText: 'CKNotes' }).locator('.rs-chk').click();
s = await local();
ok(s.systems['sys-renal'].rs[1].d === 90, 'ticking a counted resource fills it');
// overall
const sum = (await p.textContent('#sys-sum')).replace(/\s+/g, ' ');
ok(sum.includes('2 of ') && sum.includes('resources done'), 'summary counts resources done: ' + sum.slice(0, 80));

// --- copy the list to every system
await row('sys-renal').locator('[data-open]').click();
await p.click('.sheet >> text=Add these resources to every system');
await p.keyboard.press('Escape');
s = await local();
ok(s.systems['sys-cardio'].rs.some((r) => r.n === 'Boards & Beyond' && r.d === 0) && s.systems['sys-endo'].rs.length === 4, 'copied names (not progress) to every system');
await p.click('#toasts button'); await p.waitForTimeout(400);
s = await local();
ok(!s.systems['sys-endo'] || !s.systems['sys-endo'].rs, 'undo takes it back');

// --- AMBOSS
await row('sys-cardio').locator('.sys-tg').click();
await row('sys-cardio').locator('.amb-tog').click();
s = await local();
ok(s.systems['sys-cardio'].amb === d(0) && (await group('amb').count()) === 1 && (await row('sys-cardio').textContent()).includes('In AMBOSS since'), 'added to AMBOSS: moves to the In AMBOSS group');
await p.setViewportSize({ width: 1280, height: 900 });
await p.locator('#view-systems').screenshot({ path: S + '/systems-list.png' });

// --- overview: tile, Up next, calendar, layout
await p.click('#tab-overview'); await p.waitForTimeout(200);
ok((await p.textContent('#tiles')).includes('1 in AMBOSS') && /resources \d+%/.test(await p.textContent('#tiles')), 'systems tile: AMBOSS and resources %');
ok((await p.textContent('#sys-mini')).includes('Renal') && (await p.textContent('#sys-mini')).includes('1 in AMBOSS'), 'overview Systems card: progress and journey');
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
ok(await p.evaluate(() => document.getElementById('ov-cards').dataset.n === '3'), 'Passive on: three summary cards in a row');
await p.locator('#ov-cards').screenshot({ path: S + '/overview-cards.png' });
await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('ck-tracker')); x.prefs.passive = false; localStorage.setItem('ck-tracker', JSON.stringify(x)); });
await p.reload(); await p.waitForTimeout(200);
ok(await p.evaluate(() => { const c = [...document.querySelectorAll('#ov-cards > .card:not([hidden])')].map((x) => x.getBoundingClientRect()), w = document.querySelector('.ov-weak').getBoundingClientRect();
  return c.length === 2 && Math.abs(c[0].top - c[1].top) < 2 && w.bottom < c[0].top && Math.abs(w.width - (c[1].right - c[0].left)) < 2; }), 'Passive off: Systems and AMBOSS articles side by side under the full-width matrix');

// --- phone: no sideways scroll
await p.setViewportSize({ width: 375, height: 800 });
for (const t of ['overview', 'systems']) {
  await p.click('#tab-' + t); await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), t + ' fits a phone');
}
ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
await b.close();
