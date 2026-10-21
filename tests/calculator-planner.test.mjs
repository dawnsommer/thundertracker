import { chromium } from 'playwright';
import fs from 'fs';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const S = process.env.OUT_DIR;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const local = async () => { await p.waitForTimeout(400); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };
const d = (off) => { const t = new Date(Date.now() + off * 864e5); return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
// expected values from the same least-squares line the app uses
const fit = (pts) => { const n = pts.length, mx = pts.reduce((a, q) => a + q[0], 0) / n, my = pts.reduce((a, q) => a + q[1], 0) / n;
  let sxx = 0, sxy = 0; pts.forEach(([x, y]) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); }); const a = sxy / sxx; return (x) => Math.round(a * x + (my - a * mx)); };
const nb = fit([[60, 231], [66, 238], [70, 244]]);

await p.goto(BASE);
await p.evaluate(({ e }) => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { examDate: e },
  items: { 'nbme-9': { status: 2, score: '231', pct: '60', date: '2026-08-01' }, 'nbme-10': { status: 2, score: '238', pct: '66', date: '2026-08-15' }, 'nbme-11': { status: 2, score: '244', pct: '70', date: '2026-09-01' },
    'nbme-12': { status: 1, pct: '70', date: '2026-09-15' }, 'uwsa-1': { status: 1, pct: '75', date: '2026-09-20' }, 'f120-2021': { status: 1, pct: '70', date: '2026-09-25' } },
  systems: { 'sys-renal': { status: 1, uw: '70' } },
  qbanks: [{ id: 'uworld', name: 'UWorld', bank: '3800', done: '94', unit: 'pct', acc: '65', finished: '2026-10-01', weak: ['sys-renal'] }] })), { e: d(30) });
await p.reload();

// --- estimates on rows (no conversions yet: fit to your own NBMEs)
await p.click('#tab-nbme');
const rowSc = (id) => p.textContent(`#tests [data-open="${id}"] .sc`);
ok((await rowSc('nbme-12')).startsWith('≈' + nb(70)), 'NBME 12 (no score) shows ≈' + nb(70) + ' from your NBME fit: ' + await rowSc('nbme-12'));
ok((await rowSc('f120-2021')) === '70%≈' + nb(70), 'Free 120 shows % and borrows the NBME fit for ≈score: ' + await rowSc('f120-2021'));
ok((await rowSc('uwsa-1')).startsWith('—'), 'UWSA with no UWSA scores or conversion: no estimate');
ok((await rowSc('nbme-11')).startsWith('244'), 'a typed score is shown as typed');
// --- calculator panel
ok(await p.isHidden('#calc'), 'calculator hidden until asked for');
await p.click('#calc-btn');
ok(await p.isVisible('#calc .calc') && await p.evaluate(() => document.activeElement.id) === 'calc-pct', 'calculator opens with % focused');
await p.fill('#calc-pct', '72');
let out = await p.textContent('#calc .calc-out');
ok(out.includes('≈ ' + nb(72)) && out.includes('fit to your 3 NBME forms'), 'estimate at 72%: ' + out.slice(0, 80));
await p.fill('#calc-correct', '150'); await p.fill('#calc-total', '200');
ok((await p.inputValue('#calc-pct')) === '75' && (await p.textContent('#calc .calc-out')).includes('≈ ' + nb(75)), 'questions correct → % → estimate');
ok((await p.textContent('#calc .calc-fits')).includes('NBME: score ≈') && (await p.textContent('#calc .calc-fits')).includes('UWSA: 0 forms'), 'shows your own fits');
// add a UWSA formula
await p.click('#calc-add');
await p.selectOption('#conv-target', 'uwsa');
await p.fill('#conv-a', '1.5'); await p.fill('#conv-b', '135'); await p.fill('#conv-note', 'test formula');
ok((await p.textContent('.conv-edit')).includes('70% → 240'), 'formula preview');
await p.click('#conv-save');
ok((await rowSc('uwsa-1')).startsWith('≈248'), 'UWSA 1 now estimated with your formula (1.5×75+135 ≈ 248): ' + await rowSc('uwsa-1'));
// a table for one form beats the exam fit
await p.click('#calc-add');
await p.selectOption('#conv-target', 'nbme-12');
await p.click('.conv-edit .seg button:text("Table")');
await p.fill('#conv-table', '60, 225\n80%, 260');
await p.click('#conv-save');
ok((await rowSc('nbme-12')).startsWith('≈243'), 'NBME 12 uses its own table (interpolated 243): ' + await rowSc('nbme-12'));
ok((await p.locator('.conv-row').count()) === 2 && (await p.textContent('.calc-convs')).includes('test formula'), 'conversions listed with source');
let s = await local();
ok(s.conversions.uwsa.kind === 'linear' && s.conversions['nbme-12'].points.length === 2, 'conversions saved (and synced like other data)');
// bad input is rejected
await p.click('#calc-add'); await p.fill('#conv-a', '1.5'); await p.click('#conv-save');
ok((await p.textContent('.err-line')).includes('Enter both numbers'), 'incomplete formula rejected');
await p.click('.conv-edit button:text("Cancel")');
// remove + undo
await p.click('.conv-row:has-text("NBME 12") >> text=Remove');
ok((await rowSc('nbme-12')).startsWith('≈' + nb(70)), 'removing the table falls back to the fit');
await p.click('#toasts button');
ok((await rowSc('nbme-12')).startsWith('≈243'), 'undo restores it');
// editor shows the estimate and the gap to a typed score
await p.click('#tests [data-open="nbme-11"]');
const est11 = await p.textContent('.est-line');
ok(est11.includes('Estimated from % correct: ≈' + nb(70)) && (/matches your score|your score is \d+ (higher|lower)/.test(est11)), 'editor: estimate vs typed score: ' + est11);
await p.fill('#ed-score', '250');
ok(/your score is \d+ higher/.test(await p.textContent('.est-line')) && (await local()).items['nbme-11'].score === '250', 'typed score kept; gap shown');
await p.keyboard.press('Escape');
await p.screenshot({ path: S + '/calculator.png', fullPage: true });
await p.click('#calc .x');
ok(await p.isHidden('#calc'), 'calculator closes');

// --- planning
await p.click('#plan-btn');
await p.click('#plan-spread');
s = await local();
const plans = Object.entries(s.items).filter(([, it]) => it.plan).map(([id, it]) => [id, it.plan]);
const exam = d(30);
ok(plans.length === 8, 'spread: NBME 13–16, UWSA 2–3, two Free 120s (older and taken skipped): ' + plans.length + ' ' + plans.map((x) => x[0]).join(','));
ok(plans.every(([, dd]) => dd > d(0) && dd <= d(28)), 'all planned between tomorrow and 2 days before test day');
const f120 = plans.filter(([id]) => id.startsWith('f120'));
ok(f120.length === 2 && f120.every(([, dd]) => dd >= d(22)), 'Free 120s in the final week: ' + JSON.stringify(f120));
ok(!plans.some(([id]) => ['nbme-6', 'nbme-7', 'nbme-8', 'nbme-9', 'uwsa-1'].includes(id)), 'older and taken forms not planned');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#plan-ics')]);
const ics = fs.readFileSync(await dl.path(), 'utf8');
ok(ics.startsWith('BEGIN:VCALENDAR') && (ics.match(/BEGIN:VEVENT/g) || []).length === 9 && ics.includes('DTSTART;VALUE=DATE:' + exam.replace(/-/g, '')) && ics.includes('SUMMARY:USMLE Step 2 CK'), 'calendar file: 8 forms + test day');
await p.keyboard.press('Escape');
ok((await p.textContent('#tests [data-open="nbme-13"] .dt')).startsWith('plan '), 'rows show the planned date');
await p.click('#tab-overview'); await p.waitForTimeout(200);
const nx = await p.textContent('#next');
ok(/Planned.*(in \d+ days|tomorrow)/.test(nx), 'Up next shows the next planned form: ' + nx.match(/PLANNED.{0,60}|Planned.{0,60}/)?.[0]);
const fut = await p.locator('#heat .heat .hc.fut.m-plan').count();
ok(fut === 8 && await p.locator('#heat .heat .hc.m-test').count() === 1, 'calendar shows 8 planned days and test day (' + fut + ')');
await p.click(`#heat .hc[data-day="${exam}"]`);
ok((await p.textContent('.heat-detail')).includes('test day'), 'tapping test day explains it');
// overdue
await p.evaluate((dd) => { const s = JSON.parse(localStorage.getItem('ck-tracker')); s.items['nbme-13'].plan = dd; localStorage.setItem('ck-tracker', JSON.stringify(s)); }, d(-2));
await p.reload(); await p.waitForTimeout(200);
ok((await p.textContent('#next')).includes('NBME 13 — planned'), 'overdue plan flagged');
// taking a form takes it off the plan
await p.click('#tab-nbme'); await p.click('#tests [data-open="nbme-13"]'); await p.locator('.stepper button').nth(1).click(); await p.keyboard.press('Escape');
await p.click('#tab-overview'); await p.waitForTimeout(200);
ok(!(await p.textContent('#next')).includes('NBME 13 — planned') && await p.locator('#heat .heat .hc.fut.m-plan').count() === 7, 'taken form drops off the plan');
await p.locator('#heat').screenshot({ path: S + '/heat-plan.png' });

// --- shades in the weakness matrix
await p.click('#tab-nbme'); await p.click('#tests [data-open="nbme-9"]');
await p.click('.weak-pick .tag:text-is("Renal")');
await p.click('text=Add % correct per weak system');
await p.fill('[data-weakpct="sys-renal"]', '50'); await p.keyboard.press('Escape');
await p.click('#tests [data-open="nbme-10"]'); await p.click('.weak-pick .tag:text-is("Renal")');
await p.click('text=Add % correct per weak system'); await p.fill('[data-weakpct="sys-renal"]', '60'); await p.keyboard.press('Escape');
await p.click('#tests [data-open="nbme-11"]'); await p.click('.weak-pick .tag:text-is("Renal")'); await p.keyboard.press('Escape');
s = await local();
ok(s.items['nbme-9'].weakPct['sys-renal'] === '50', 'per-system % saved');
await p.click('#tab-overview'); await p.waitForTimeout(200);
const cells = await p.locator('#weak button.wm-row', { hasText: 'Renal' }).first().evaluate((e) => [...e.querySelectorAll('.wm-cell.on')].map((c) => c.className.replace('wm-cell on', '').replace('first-qb', '').trim() + (c.textContent ? ':' + c.textContent : '')));
ok(JSON.stringify(cells) === JSON.stringify(['sh3:50', 'sh2:60', '', 'qb sh1:70']), 'shades: 50% dark, 60% medium, none plain, UWorld 70% (system UW %) light: ' + JSON.stringify(cells));
ok((await p.textContent('#weak')).includes('Your % in that system (65+ · 55–64 · under 55)'), 'shade legend');
await p.locator('#weak').screenshot({ path: S + '/matrix-shades.png' });
await p.setViewportSize({ width: 375, height: 800 }); await p.click('#tab-nbme'); await p.click('#calc-btn'); await p.waitForTimeout(200);
ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 375, 'calculator fits a phone');
await p.screenshot({ path: S + '/m-calculator.png' });
ok(errs.length === 0, 'no errors ' + JSON.stringify(errs));
await b.close();
