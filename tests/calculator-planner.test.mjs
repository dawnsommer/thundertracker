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

// --- estimates on rows: built-in published conversions first
await p.click('#tab-nbme');
const rowSc = (id) => p.textContent(`#tests [data-open="${id}"] .sc`);
ok((await rowSc('nbme-12')).startsWith('≈235'), 'NBME 12 (no score): NBMEScore regression 300.18 − 1.09 × 60 wrong ≈ 235: ' + await rowSc('nbme-12'));
ok((await rowSc('f120-2021')) === '70%≈' + nb(70), 'Free 120 (2021): no built-in, borrows your NBME fit: ' + await rowSc('f120-2021'));
ok((await rowSc('uwsa-1')).startsWith('≈246'), 'UWSA 1 at 75%: NBMEScore anchor 246: ' + await rowSc('uwsa-1'));
ok((await rowSc('nbme-11')).startsWith('244'), 'a typed score is shown as typed');
ok((await p.getAttribute('#tests [data-open="nbme-12"] .sc b', 'title')).includes('NBMEScore.com regression for NBME 12'), 'row says where the estimate came from');
// --- calculator panel
ok(await p.isHidden('#calc'), 'calculator hidden until asked for');
await p.click('#calc-btn');
// focus moves after the panel is built (a setTimeout), so wait for it rather than racing it
const calcFocused = await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'calc-pct', null, { timeout: 2000 }).then(() => true, () => false);
ok(await p.isVisible('#calc .calc') && calcFocused, 'calculator opens with the result box focused');
ok((await p.inputValue('#calc-form')) === 'nbme-13', 'starts on your next untaken NBME');
const out = () => p.textContent('#calc .calc-out');
const srcScores = () => p.locator('#calc-sources .src-row .src-sc').allTextContents();
await p.selectOption('#calc-form', 'nbme-15');
await p.fill('#calc-pct', '80');
ok((await out()).includes('≈ 257') && (await out()).includes('80% · 40 wrong of 200'), 'NBME 15 at 80% (40 wrong): NBMEScore 300.5 − 1.1 × 40 = 256.5 → 257: ' + (await out()).slice(0, 60));
ok(JSON.stringify(await srcScores()) === '["257","256","256",""]', 'all NBME 15 sources side by side (site, r/Step2 line, r/Step2 curve, none): ' + JSON.stringify(await srcScores()));
ok(await p.isHidden('#calc-sources .calc-warn'), 'no disagreement notice when sources agree');
await p.click('#calc-mode [data-mode="wrong"]');
ok((await p.inputValue('#calc-pct')) === '40' && (await out()).includes('≈ 257'), 'switching to “wrong” keeps the result (40 wrong)');
// NBME 6–8: 184 questions, the legacy Excel formula, nothing past 91 wrong
await p.selectOption('#calc-form', 'nbme-6');
await p.fill('#calc-pct', '19');
ok((await out()).includes('≈ 247') && (await out()).includes('(247.36)') && (await out()).includes('19 wrong of 184'), 'NBME 6, 19 wrong: 293.52 − 2.4295 × 19 = 247.36: ' + (await out()).slice(0, 90));
await p.fill('#calc-pct', '92');
ok((await out()).includes('only covers 50.5–100% correct, so it isn’t used here') && (await out()).includes('fit to your 3 NBME forms'), 'NBME 6 past 91 wrong: the Excel formula stops; your NBME fit is used, explained: ' + (await out()).slice(0, 90));
await p.fill('#calc-pct', '185');
ok((await out()).includes('whole number from 0 to 184'), 'count beyond the form is rejected');
await p.selectOption('#calc-form', 'nbme-7'); await p.fill('#calc-pct', '26');
ok((await out()).includes('≈ 245') && (await out()).includes('26 wrong of 176'), 'NBME 7 has 176 questions: 283.7 − 1.4992 × 26 = 244.72: ' + (await out()).slice(0, 60));
// NBME 16: the chart only covers 50–90%; outside it, the next method is used and it says so
await p.click('#calc-mode [data-mode="pct"]');
await p.selectOption('#calc-form', 'nbme-16');
await p.fill('#calc-pct', '75');
ok((await out()).includes('≈ 244') && (await out()).includes('EPC'), 'NBME 16 at 75%: chart 243.5 → 244, with the EPC caveat');
await p.fill('#calc-pct', '95');
ok((await out()).includes('≈ ' + nb(95)) && (await out()).includes('only covers 50–90% correct, so it isn’t used here'), 'NBME 16 at 95%: outside the chart → your NBME fit, explained');
// UWSA 2: two sites that disagree
await p.selectOption('#calc-form', 'uwsa-2');
await p.fill('#calc-pct', '50');
ok(JSON.stringify(await srcScores()) === '["212","194",""]' && (await p.textContent('#calc-sources .calc-warn')).includes('differ by 18 points'), 'UWSA 2 at 50%: 212 vs 194, disagreement flagged');
// choose a source for a form
await p.selectOption('#calc-form', 'uwsa-1');
await p.fill('#calc-pct', '75');
await p.click('#calc-sources .src-row:has(input[value="nbmecalculator"])');
ok((await out()).includes('≈ 250') && (await rowSc('uwsa-1')).startsWith('≈250'), 'UWSA 1 switched to NBMECalculator.com: 292 − 1.05 × 40 = 250 (panel and row)');
let s = await local();
ok(s.conversions['uwsa-1'] && s.conversions['uwsa-1'].kind === 'builtin' && s.conversions['uwsa-1'].model === 'nbmecalculator', 'source choice saved (and synced)');
await p.click('#calc-sources .src-row:has(input[value="nbmescore"])');
ok(!(await local()).conversions['uwsa-1'] && (await rowSc('uwsa-1')).startsWith('≈246'), 'back to the default: nothing stored');
await p.selectOption('#calc-form', 'nbme-12');
await p.click('#calc-sources .src-row:has(input[value="none"])');
ok((await rowSc('nbme-12')).startsWith('≈' + nb(70)), 'NBME 12 with no built-in: falls back to your NBME fit');
// UWSA 3 has no published conversion
await p.selectOption('#calc-form', 'uwsa-3');
await p.fill('#calc-pct', '70');
ok((await out()).includes('No published conversion for UWSA 3') && await p.isHidden('#calc-sources'), 'UWSA 3: no built-in, says so');
ok((await p.textContent('#calc-form option[value="uwsa-3"]')).includes('no built-in'), 'form list marks forms without one');
await p.selectOption('#calc-form', 'f120-2023');
ok((await out()).includes('≈ 248') && (await out()).includes('Supplied formula for Free 120 (2023)'), 'Free 120 (2023) at 70%: 1.165 × 70 + 166.17 ≈ 248: ' + (await out()).slice(0, 70));
await p.selectOption('#calc-form', 'f120-2021');
ok((await out()).includes('≈ ' + nb(70)) && (await out()).includes('fit to your 3 NBME forms') && await p.isHidden('#calc-sources'), 'Free 120 (2021): no built-in, your NBME fit');
await p.selectOption('#calc-form', 'uwsa-3');
// add a UWSA formula: covers UWSA 3
await p.click('#calc-more summary');
ok((await p.textContent('#calc .calc-fits')).includes('NBME: score ≈') && (await p.textContent('#calc .calc-fits')).includes('UWSA: 0 forms'), 'shows your own fits');
await p.click('#calc-add');
await p.selectOption('#conv-target', 'uwsa');
await p.fill('#conv-a', '1.5'); await p.fill('#conv-b', '135'); await p.fill('#conv-note', 'test formula');
ok((await p.textContent('.conv-edit')).includes('70% → 240'), 'formula preview');
await p.click('#conv-save');
ok((await out()).includes('≈ 240') && (await out()).includes('your formula for UWSA'), 'UWSA 3 now estimated with your UWSA formula');
ok((await rowSc('uwsa-1')).startsWith('≈246'), 'a form’s built-in still beats an exam-wide formula');
// a table for one form beats everything
await p.click('#calc-add');
await p.selectOption('#conv-target', 'nbme-12');
await p.click('.conv-edit .seg button:text("Table")');
await p.fill('#conv-table', '60, 225\n80%, 260');
await p.click('#conv-save');
ok((await rowSc('nbme-12')).startsWith('≈243'), 'NBME 12 uses its own table (interpolated 243): ' + await rowSc('nbme-12'));
ok((await p.locator('.conv-row').count()) === 2 && (await p.textContent('.calc-convs')).includes('test formula'), 'conversions listed with source (source choices aren’t)');
s = await local();
ok(s.conversions.uwsa.kind === 'linear' && s.conversions['nbme-12'].points.length === 2, 'conversions saved (and synced like other data)');
await p.selectOption('#calc-form', 'nbme-12');
ok((await p.textContent('#calc-sources .src-row.on')).includes('Your table'), 'sources list shows your table in use');
// bad input is rejected
await p.click('#calc-add'); await p.fill('#conv-a', '1.5'); await p.click('#conv-save');
ok((await p.textContent('.err-line')).includes('Enter both numbers'), 'incomplete formula rejected');
await p.click('.conv-edit button:text("Cancel")');
// remove + undo
await p.click('.conv-row:has-text("NBME 12") >> text=Remove');
ok((await rowSc('nbme-12')).startsWith('≈235'), 'removing the table falls back to the built-in');
await p.click('#toasts button');
ok((await rowSc('nbme-12')).startsWith('≈243'), 'undo restores it');
// editor shows the estimate and the gap to a typed score
await p.click('#tests [data-open="nbme-11"]');
const est11 = await p.textContent('.est-line');
ok(est11.includes('Estimated from % correct: ≈235') && est11.includes('your score is 9 higher'), 'editor: built-in estimate vs typed score: ' + est11);
await p.fill('#ed-score', '250');
ok(/your score is 15 higher/.test(await p.textContent('.est-line')) && (await local()).items['nbme-11'].score === '250', 'typed score kept; gap shown');
await p.keyboard.press('Escape');
await p.selectOption('#calc-form', 'nbme-15'); await p.click('#calc-mode [data-mode="pct"]'); await p.fill('#calc-pct', '78');
await p.locator('#calc').screenshot({ path: S + '/calculator.png' });
await p.click('#calc-about summary');
ok((await p.textContent('#calc-about')).includes('nbmescore.com') || (await p.locator('#calc-about a[href*="nbmescore.com"]').count()) > 5, 'source list links every published source');
await p.click('#calc .x');
ok(await p.isHidden('#calc'), 'calculator closes');

// --- planning
await p.click('#plan-btn');
await p.click('#plan-spread');
s = await local();
const plans = Object.entries(s.items).filter(([, it]) => it.plan).map(([id, it]) => [id, it.plan]);
const exam = d(30);
ok(plans.length === 9, 'spread: NBME 13–16, UWSA 2–3, AMBOSS SA 1, two Free 120s (older and taken skipped): ' + plans.length + ' ' + plans.map((x) => x[0]).join(','));
ok(plans.every(([, dd]) => dd > d(0) && dd <= d(28)), 'all planned between tomorrow and 2 days before test day');
const f120 = plans.filter(([id]) => id.startsWith('f120'));
ok(f120.length === 2 && f120.every(([, dd]) => dd >= d(22)), 'Free 120s in the final week: ' + JSON.stringify(f120));
ok(!plans.some(([id]) => ['nbme-6', 'nbme-7', 'nbme-8', 'nbme-9', 'uwsa-1'].includes(id)), 'older and taken forms not planned');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#plan-ics')]);
const ics = fs.readFileSync(await dl.path(), 'utf8');
ok(ics.startsWith('BEGIN:VCALENDAR') && (ics.match(/BEGIN:VEVENT/g) || []).length === 10 && ics.includes('DTSTART;VALUE=DATE:' + exam.replace(/-/g, '')) && ics.includes('SUMMARY:USMLE Step 2 CK'), 'calendar file: 9 forms + test day');
await p.keyboard.press('Escape');
ok((await p.textContent('#tests [data-open="nbme-13"] .dt')).startsWith('plan '), 'rows show the planned date');
await p.click('#tab-overview'); await p.waitForTimeout(200);
const nx = await p.textContent('#next');
ok(/Planned.*(in \d+ days|tomorrow)/.test(nx), 'Up next shows the next planned form: ' + nx.match(/PLANNED.{0,60}|Planned.{0,60}/)?.[0]);
const fut = await p.locator('#heat .heat .hc.fut.m-plan').count();
ok(fut === 9 && await p.locator('#heat .heat .hc.m-test').count() === 1, 'calendar shows 9 planned days and test day (' + fut + ')');
await p.click(`#heat .hc[data-day="${exam}"]`);
ok((await p.textContent('.heat-detail')).includes('test day'), 'tapping test day explains it');
// overdue
await p.evaluate((dd) => { const s = JSON.parse(localStorage.getItem('ck-tracker')); s.items['nbme-13'].plan = dd; localStorage.setItem('ck-tracker', JSON.stringify(s)); }, d(-2));
await p.reload(); await p.waitForTimeout(200);
ok((await p.textContent('#next')).includes('NBME 13 — planned'), 'overdue plan flagged');
// taking a form takes it off the plan
await p.click('#tab-nbme'); await p.click('#tests [data-open="nbme-13"]'); await p.locator('.stepper button').nth(1).click(); await p.keyboard.press('Escape');
await p.click('#tab-overview'); await p.waitForTimeout(200);
ok(!(await p.textContent('#next')).includes('NBME 13 — planned') && await p.locator('#heat .heat .hc.fut.m-plan').count() === 8, 'taken form drops off the plan');
await p.locator('#heat').screenshot({ path: S + '/heat-plan.png' });

// --- shades in the weakness matrix
await p.click('#tab-nbme'); await p.click('#tests [data-open="nbme-9"]');
await p.click('.weak-pick .tag:text-is("Renal")');
// assessments: errors and unstable questions per weak system, from your review
await p.click('text=Add errors per weak system');
await p.fill('[data-weak="sys-renal:e"]', '6'); await p.keyboard.press('Escape');
await p.click('#tests [data-open="nbme-10"]'); await p.click('.weak-pick .tag:text-is("Renal")');
await p.click('text=Add errors per weak system'); await p.fill('[data-weak="sys-renal:e"]', '3'); await p.fill('[data-weak="sys-renal:u"]', '1'); await p.keyboard.press('Escape');
await p.click('#tests [data-open="nbme-11"]'); await p.click('.weak-pick .tag:text-is("Renal")'); await p.keyboard.press('Escape');
s = await local();
ok(JSON.stringify(s.items['nbme-9'].weakN['sys-renal']) === '{"e":6,"u":0}' && JSON.stringify(s.items['nbme-10'].weakN['sys-renal']) === '{"e":3,"u":1}', 'errors and unstable saved per system');
await p.click('#tab-overview'); await p.waitForTimeout(200);
const cells = await p.locator('#weak button.wm-row', { hasText: 'Renal' }).first().evaluate((e) => [...e.querySelectorAll('.wm-cell.on')].map((c) => c.className.replace('wm-cell on', '').replace('first-qb', '').trim() + (c.textContent ? ':' + c.textContent : '')));
ok(JSON.stringify(cells) === JSON.stringify(['sh3:6', 'sh2:3·1', '', 'qb sh1:70']), 'shades: 6 errors dark, 3 errors + 1 unstable medium, none plain, UWorld 70% (system UW %) light: ' + JSON.stringify(cells));
ok((await p.textContent('#weak')).includes('Errors·unstable on an assessment') && (await p.textContent('#weak')).includes('Your % in that system (65+ · 55–64 · under 55)'), 'shade legend for both');
await p.locator('#weak').screenshot({ path: S + '/matrix-shades.png' });
await p.setViewportSize({ width: 375, height: 800 }); await p.click('#tab-nbme'); await p.click('#calc-btn'); await p.waitForTimeout(200);
ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 375, 'calculator fits a phone');
await p.screenshot({ path: S + '/m-calculator.png' });
ok(errs.length === 0, 'no errors ' + JSON.stringify(errs));
await b.close();
