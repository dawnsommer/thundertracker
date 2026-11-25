// Import .md: a ThunderNBME analysis feed file sets an assessment's weak systems (js/analysis-import.js +
// the assessment editor). Synthetic file only — never a real one.
import { chromium } from 'playwright';
import { formMatches, parseAnalysis, pctOfCorrect } from '../js/analysis-import.js';
import { MERGE, SYSTEMS } from '../js/catalog.js';
const BASE = process.env.BASE_URL;
const S = process.env.OUT_DIR;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };

const FILE = (form = 'NBME 12', weak = 'sys-endo, sys-renal, sys-ob', extra = '') => `<!-- thundertracker:assessment v1 -->
# ${form} · weak systems

form: ${form}
date: 2026-09-01
correct: 120/200 (60.0%)
weak: ${weak}

| id | system | wrong | unstable |
|---|---|---|---|
| sys-endo | Endo | 5 | 2 |
| sys-renal | Renal | 3 | 0 |
| sys-ob | OB | 2 | 1 |
| sys-gyn | Gyn | 1 | 1 |
| sys-ethics | Ethics | 0 | 0 |
| sys-biostat | Biostat | 1 | 0 |
${extra}`;
const IDS = SYSTEMS.map((s) => s.id);

// ---- pure
let r = parseAnalysis(FILE(), IDS);
ok(r.ok && r.form === 'NBME 12' && r.date === '2026-09-01' && r.pct === '60', 'reads form, date and % correct: ' + JSON.stringify([r.form, r.date, r.pct]));
ok(JSON.stringify(r.weak) === '["sys-endo","sys-renal","sys-repro"]', 'weak ids in file order; old sys-ob folds into sys-repro (MERGE): ' + JSON.stringify(r.weak));
ok(JSON.stringify(r.weakN) === JSON.stringify({ 'sys-endo': { e: 5, u: 2 }, 'sys-renal': { e: 3, u: 0 }, 'sys-repro': { e: 3, u: 2 }, 'sys-biostat': { e: 1, u: 0 } }),
  'weakN from the table: e = wrong, u = unstable; folded ids add up; all-zero rows dropped: ' + JSON.stringify(r.weakN));
ok(MERGE['sys-ob'] === 'sys-repro', 'fixture relies on the MERGE table');
ok(!parseAnalysis(FILE().replace('<!-- thundertracker:assessment v1 -->', '<!-- something else -->'), IDS).ok, 'refuses a file without the v1 marker');
ok(!parseAnalysis(FILE().replace('v1 -->', 'v2 -->'), IDS).ok, 'refuses another version of the marker');
r = parseAnalysis(FILE('NBME 12', 'sys-endo, sys-zzz'), IDS);
ok(!r.ok && r.error.includes('sys-zzz'), 'refuses an unknown sys-* id in weak: (' + r.error + ')');
r = parseAnalysis(FILE('NBME 12', 'sys-endo', '| sys-made-up | X | 1 | 0 |'), IDS);
ok(!r.ok && r.error.includes('sys-made-up'), 'refuses an unknown sys-* id in the table');
ok(parseAnalysis(FILE('NBME 12', 'sys-endo, sys-mine'), IDS.concat('sys-mine')).ok, 'your own systems (allSystems) are accepted');
ok(!parseAnalysis(FILE('NBME 12', 'sys-endo', '| sys-gi | GI | two | 0 |'), IDS).ok, 'refuses a non-number count');
ok(!parseAnalysis(FILE().replace(/^weak:.*$/m, ''), IDS).ok, 'refuses a file without a weak: line');
ok(parseAnalysis(FILE().replace(/\n/g, '\r\n'), IDS).weak.length === 3, 'Windows line endings');
ok(pctOfCorrect('91/130 (70.0%)') === '70' && pctOfCorrect('91/130') === '70' && pctOfCorrect('1/3') === '33.3' && pctOfCorrect('71%') === '71' && pctOfCorrect('') === '' && pctOfCorrect('abc') === '', 'pctOfCorrect');
ok(formMatches('NBME 12', 'NBME 12') && formMatches('nbme12', 'NBME 12') && formMatches('', 'NBME 12') && !formMatches('NBME 7', 'NBME 12')
  && formMatches('Free 120 (2023)', 'Free 120 (2023)'), 'formMatches ignores case and spacing');

// ---- UI
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const [w, hgt] of [[1280, 900], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: hgt }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const local = async () => { await p.waitForTimeout(400); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };
  await p.goto(BASE);
  await p.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { examDate: '2026-12-01' },
    items: { 'nbme-12': { status: 0, weak: ['sys-gi'] }, 'nbme-13': { status: 2, pct: '70', date: '2026-08-01' } } })));
  await p.reload(); await p.keyboard.press('2');
  await p.click('[data-open="nbme-12"]');
  ok(await p.isVisible('.md-imp-btn') && await p.isHidden('#md-imp'), w + 'px: Import .md beside the weak-system picker, closed');
  await p.click('.md-imp-btn');
  ok(await p.isVisible('#md-imp') && (await p.getAttribute('.md-imp-btn', 'aria-expanded')) === 'true', w + 'px: opens');

  // a wrong file: error, nothing changes
  await p.setInputFiles('[data-md-file]', { name: 'x.md', mimeType: 'text/markdown', buffer: Buffer.from('# just notes\nweak: sys-gi') });
  await p.waitForSelector('.md-msg.bad');
  ok((await p.textContent('.md-msg')).includes('Not a ThunderNBME'), w + 'px: file without the marker refused');
  ok(JSON.stringify((await local()).items['nbme-12'].weak) === '["sys-gi"]', w + 'px: weak systems unchanged after a refused file');

  // the right file, chosen
  await p.setInputFiles('[data-md-file]', { name: 'ThunderTracker_NBME_12.md', mimeType: 'text/markdown', buffer: Buffer.from(FILE()) });
  await p.waitForSelector('.md-msg.ok');
  let it = (await local()).items['nbme-12'];
  ok(JSON.stringify(it.weak) === '["sys-endo","sys-renal","sys-repro"]', w + 'px: weak replaced from the file: ' + JSON.stringify(it.weak));
  ok(it.weakN['sys-endo'].e === 5 && it.weakN['sys-endo'].u === 2 && it.weakN['sys-repro'].e === 3, w + 'px: weakN saved');
  ok((await p.locator('.weak-pick .tag.weak-on').count()) === 3 && (await p.inputValue('[data-weak="sys-endo:e"]')) === '5' && (await p.inputValue('[data-weak="sys-endo:u"]')) === '2',
    w + 'px: chips ticked and the errors / unstable boxes shown and filled');
  ok(await p.isVisible('.md-pct') && (await p.textContent('.md-pct')).includes('60'), w + 'px: % correct offered (it was empty)');
  ok((await p.textContent('#toasts')).includes('weak systems imported'), w + 'px: toast with Undo');
  if (w === 1280 && S) await p.screenshot({ path: S + '/analysis-import-desktop.png' });
  if (w !== 1280 && S) await p.screenshot({ path: S + '/analysis-import-phone.png' });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), w + 'px: no sideways scroll');
  await p.click('.md-pct');
  it = (await local()).items['nbme-12'];
  ok(it.pct === '60' && it.status === 1 && it.date === '2026-09-01', w + 'px: Use % sets pct, marks taken on the file’s date: ' + JSON.stringify([it.pct, it.status, it.date]));
  ok((await p.inputValue('#ed-pct')) === '60', w + 'px: % box updated');
  await p.keyboard.press('Escape');

  // another form: the file names NBME 12, so it asks; pasted text; pct already set → no offer
  await p.click('[data-open="nbme-13"]');
  await p.click('.md-imp-btn');
  await p.fill('.md-paste', FILE());
  await p.click('#md-imp >> text=Import pasted text');
  await p.waitForSelector('.md-msg.warn');
  ok((await p.textContent('.md-msg')).includes('for NBME 12, not NBME 13'), w + 'px: form mismatch warned');
  ok(!(await local()).items['nbme-13'].weak.length, w + 'px: nothing applied before Import anyway');
  await p.click('.md-anyway');
  it = (await local()).items['nbme-13'];
  ok(it.weak.length === 3 && it.pct === '70' && await p.locator('.md-pct').count() === 0, w + 'px: Import anyway applies; existing % kept, not offered');
  await p.click('#toasts button:text-is("Undo")'); await p.waitForTimeout(100);
  ok(!(await local()).items['nbme-13'].weak.length && (await p.locator('.weak-pick .tag.weak-on').count()) === 0, w + 'px: Undo restores and redraws the picker');
  ok(!errs.length, w + 'px: no page errors ' + errs.join(' | '));
  await ctx.close();
}
await b.close();
