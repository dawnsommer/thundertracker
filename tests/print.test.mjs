import { chromium } from 'playwright';
import fs from 'fs';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const S = process.env.OUT_DIR;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const d = (off) => { const t = new Date(Date.now() + off * 864e5); return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const pages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

// a heavy, late-prep state: every assessment taken with long weak lists, every CMS form, three qbanks
const sys = ['cardio', 'resp', 'gi', 'renal', 'endo', 'heme', 'id', 'immuno', 'rheum'].map((x) => 'sys-' + x);
const items = {};
const forms = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => 'nbme-' + n).concat(['uwsa-1', 'uwsa-2', 'uwsa-3', 'f120-2019', 'f120-2021', 'f120-2023']);
forms.forEach((id, i) => {
  items[id] = { status: 2, pct: String(60 + i), date: d(-90 + i * 4), weak: sys.slice(i % 4, i % 4 + 5), weakPct: { [sys[i % 4]]: String(48 + i) },
    notes: 'Long notes that never belong on paper. '.repeat(5) };
  if (!id.startsWith('f120') && i !== 5) items[id].score = String(215 + i * 2);
});
items['nbme-16'] = { status: 0, plan: d(10) };
const cms = { med: 10, surg: 9, peds: 9, obgyn: 12, psych: 8, neuro: 9, fm: 5, em: 3 };
Object.entries(cms).forEach(([k, n]) => { for (let i = 1; i <= n; i++) items['cms-' + k + '-' + i] = { status: 1, score: String(62 + (i * 3) % 30), date: d(-60 + i) }; });
await p.goto(BASE);
await p.evaluate(({ items, e }) => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { examDate: e, target: '255' }, items,
  qbanks: [{ id: 'uworld', name: 'UWorld', bank: '3800', done: '94', unit: 'pct', acc: '65', finished: '2026-10-01', weak: ['sys-renal', 'sys-endo'] },
    { id: 'amboss', name: 'AMBOSS', bank: '3509', done: '930', unit: 'q', acc: '69' }, { id: 'cms', name: 'CMS Qbank', bank: '1000', done: '20', unit: 'pct' }] })), { items, e: d(24) });
await p.reload();

// screen: no summary until printing; the header button and settings both offer it
ok(await p.isVisible('#print-btn'), 'print button in the header');
ok(!(await p.$('#print-sheet')) || !(await p.isVisible('#print-sheet')), 'summary is not shown on screen');
await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
await p.click('#print-btn');
ok((await p.evaluate(() => window.__printed)) === 1, 'header button opens the print dialog');
await p.keyboard.press('p');
ok((await p.evaluate(() => window.__printed)) === 2, 'the p shortcut prints');
await p.keyboard.press(','); await p.click('#st-print');
ok((await p.evaluate(() => window.__printed)) === 3, 'Settings → Print summary prints');
ok(!(await p.isVisible('#print-sheet')), 'still hidden on screen after printing');

// paper: only the summary
await p.emulateMedia({ media: 'print' });
await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
ok(await p.isVisible('#print-sheet'), 'summary shows on paper');
ok(!(await p.isVisible('#hdr')) && !(await p.isVisible('#main')), 'the app itself is hidden on paper');
const txt = await p.textContent('#print-sheet');
ok(txt.includes('Thunder tracker') && txt.includes('target 255') && txt.includes('24 days to go'), 'header: title, target, countdown');
ok(txt.includes('NBME 15') && txt.includes('Free 120 (2023)'), 'assessments listed');
ok((await p.locator('#print-sheet .pr-table').first().locator('tbody tr').count()) === forms.length - 1, 'every taken assessment has a row (' + (forms.length - 1) + ')');
ok(txt.includes('≈'), 'a form without a 3-digit score shows an estimate');
ok(txt.includes('Planned: NBME 16'), 'planned forms listed');
ok(txt.includes('Internal Medicine') && txt.includes('10/10'), 'CMS by subject');
ok(txt.includes('UWorld ✓') && txt.includes('AMBOSS'), 'qbanks, finished marked');
ok((await p.locator('#print-sheet .pr-weaksec .pw-row:not(.pw-head)').count()) === 8, 'recurring weak systems as a waffle on the page, a row per marked system (8)');
ok(!(await p.$('#print-sheet .pr-two')), 'a typical history stays on one page');
ok(!txt.includes('Pulmonary, Gastrointestinal'), 'no weak-system names under each form (the waffle shows them)');
ok(!txt.includes('Long notes'), 'notes are left off');
ok(await p.isVisible('#print-sheet svg.pr-trend'), 'score trend drawn');
for (const format of ['Letter', 'A4']) {
  const pdf = await p.pdf({ format, printBackground: true });
  ok(pages(pdf) === 1, format + ': fits on one page (' + pages(pdf) + ')');
  if (S && format === 'Letter') fs.writeFileSync(S + '/summary.pdf', pdf);
}
await p.screenshot({ path: (S || '.') + '/print-summary.png', fullPage: true });

// dark theme on screen still prints black on white
await p.emulateMedia({ media: 'print', colorScheme: 'dark' });
await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('beforeprint')); });
const colors = await p.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.getElementById('print-sheet')).color]);
ok(colors[0] === 'rgb(255, 255, 255)' && colors[1] === 'rgb(17, 17, 17)', 'dark theme still prints black on white: ' + colors);

// a long history: every form taken and retaken, extra NBMEs, long weak lists → two pages, the weak systems as a waffle
const heavy = JSON.parse(JSON.stringify(items));
const allSys = sys.concat(['neuro', 'psych', 'repro', 'peds'].map((x) => 'sys-' + x)); // 13, each marked weak somewhere
const heavyForms = forms.concat(['nbme-17', 'nbme-18', 'nbme-19', 'nbme-20']);
heavyForms.forEach((id, i) => {
  heavy[id] = { status: 2, pct: String(58 + i), date: d(-120 + i * 4), weak: allSys.slice(i % 6, i % 6 + 8),
    weakN: { [allSys[i % 6]]: { e: 6, u: 1 }, [allSys[i % 6 + 1]]: { e: 2, u: 0 } },
    score: id.startsWith('f120') ? undefined : String(210 + i * 2), retake: { pct: String(66 + i), score: id.startsWith('f120') ? undefined : String(220 + i * 2), date: d(-100 + i * 4) } };
});
await p.emulateMedia({ media: 'screen', colorScheme: 'light' });
await p.evaluate(() => { delete document.documentElement.dataset.theme; });
await p.evaluate(({ heavy, e }) => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { examDate: e, target: '255' }, items: heavy,
  extraAssess: { nbme: [17, 18, 19, 20] },
  qbanks: [{ id: 'uworld', name: 'UWorld', bank: '3800', done: '100', unit: 'pct', acc: '65', finished: '2026-10-01', weak: ['sys-renal', 'sys-endo', 'sys-neuro'], weakPct: { 'sys-renal': '52' } },
    { id: 'amboss', name: 'AMBOSS', bank: '3509', done: '3509', unit: 'q', acc: '69', finished: '2026-10-10', weak: ['sys-gi', 'sys-psych'] }] })), { heavy, e: d(24) });
await p.reload();
await p.emulateMedia({ media: 'print' });
await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
ok(!(await p.isVisible('#print-sheet.pr-measure')), 'the measuring class is removed after choosing the layout');
const ht = await p.textContent('#print-sheet');
const nRows = await p.locator('#print-sheet .pr-assess tbody tr').count();
ok(nRows === heavyForms.length, 'every assessment is listed, none dropped (' + nRows + ')');
ok((await p.locator('#print-sheet .pr-assess td.pr-rt', { hasText: '↻' }).count()) === heavyForms.length, 'each retake on its form\'s line');
ok(!(await p.$('#print-sheet .pr-two')), '21 forms with retakes still fit the one-page layout');
const wRows = await p.locator('#print-sheet .pw-row:not(.pw-head)').count();
ok(wRows === allSys.length, 'waffle: a row for every weak system (' + wRows + ')');
ok((await p.locator('#print-sheet .pw-head .pw-col').count()) === heavyForms.length + 2, 'waffle: a column per assessment and finished qbank');
ok((await p.locator('#print-sheet .pw-cell.on.sh3').count()) > 0 && (await p.locator('#print-sheet .pw-cell.on.qb').count()) > 0, 'waffle shades error counts and qbank cells');
ok(ht.includes('charted below'), 'the table points to the chart below');
const wide = await p.evaluate(() => [...document.querySelectorAll('#print-sheet .pw-row')].every((r) => r.scrollWidth <= r.parentElement.clientWidth + 1));
ok(wide, 'the waffle fits the page width');
for (const format of ['Letter', 'A4']) {
  const pdf = await p.pdf({ format, printBackground: true });
  ok(pages(pdf) === 1, format + ': 21 forms with retakes and the waffle fit on one page (' + pages(pdf) + ')');
  if (S && format === 'Letter') fs.writeFileSync(S + '/summary-long.pdf', pdf);
}

// the most this user expects: 20 forms, all retaken, every one of the 17 systems weak somewhere → still one page
const max20 = JSON.parse(JSON.stringify(heavy)); delete max20['nbme-20'];
const sys17 = ['cardio', 'resp', 'gi', 'renal', 'endo', 'heme', 'id', 'immuno', 'rheum', 'neuro', 'psych', 'repro', 'peds', 'surg', 'emtox', 'biostat', 'ethics'].map((x) => 'sys-' + x);
Object.keys(max20).filter((k) => !k.startsWith('cms-')).forEach((k, i) => { max20[k].weak = sys17.filter((_, j) => (i + j) % 3 !== 0); });
await p.emulateMedia({ media: 'screen' });
await p.evaluate(({ max20 }) => { const st = JSON.parse(localStorage.getItem('ck-tracker')); st.items = max20; st.extraAssess = { nbme: [17, 18, 19] };
  st.qbanks.push({ id: 'kaplan', name: 'Kaplan', bank: '2000', done: '2000', unit: 'q', acc: '61', finished: '2026-10-20', weak: ['sys-ethics'] });
  localStorage.setItem('ck-tracker', JSON.stringify(st)); }, { max20 });
await p.reload();
await p.emulateMedia({ media: 'print' });
await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
ok((await p.locator('#print-sheet .pr-assess tbody tr').count()) === 20 && (await p.locator('#print-sheet .pw-row:not(.pw-head)').count()) === 17, '20 forms and all 17 systems in the waffle');
ok(!(await p.$('#print-sheet .pr-two')), '20 forms with retakes and 17 weak systems: one-page layout');
for (const format of ['Letter', 'A4']) {
  const pdf = await p.pdf({ format, printBackground: true });
  ok(pages(pdf) === 1, format + ': 20 forms, retakes, 17 systems on one page (' + pages(pdf) + ')');
  if (S && format === 'Letter') fs.writeFileSync(S + '/summary-max.pdf', pdf);
}

// longer still (35 forms): the waffle moves to page 2
const huge = JSON.parse(JSON.stringify(heavy)), extra = Array.from({ length: 14 }, (_, i) => 21 + i);
extra.forEach((n, i) => { huge['nbme-' + n] = { status: 2, pct: String(70 + i % 10), score: String(240 + i), date: d(-20 + i), weak: allSys.slice(i % 5, i % 5 + 6), retake: { pct: '80', date: d(-5) } }; });
await p.emulateMedia({ media: 'screen' });
await p.evaluate(({ huge, e, extra }) => { const st = JSON.parse(localStorage.getItem('ck-tracker')); st.items = huge; st.extraAssess = { nbme: [17, 18, 19, 20].concat(extra) };
  localStorage.setItem('ck-tracker', JSON.stringify(st)); }, { huge, e: d(24), extra });
await p.reload();
await p.emulateMedia({ media: 'print' });
await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
ok(await p.isVisible('#print-sheet .pr-two'), 'a history too long for one page switches to two');
ok((await p.locator('#print-sheet .pr-assess tbody tr').count()) === heavyForms.length + extra.length, 'all 35 forms listed');
ok((await p.locator('#print-sheet .pr-p2 .pw-row:not(.pw-head)').count()) === allSys.length + 1, 'page 2: the waffle (Kaplan adds Ethics)');
ok((await p.textContent('#print-sheet')).includes('charted on page 2'), 'the table points to page 2');
for (const format of ['Letter', 'A4']) {
  const pdf = await p.pdf({ format, printBackground: true });
  ok(pages(pdf) === 2, format + ': 35 forms print on two pages (' + pages(pdf) + ')');
  if (S && format === 'Letter') fs.writeFileSync(S + '/summary-two-pages.pdf', pdf);
}

// an empty tracker prints a sensible page too
await p.emulateMedia({ media: 'screen' });
await p.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2 }))); await p.reload();
await p.emulateMedia({ media: 'print' });
await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
const empty = await p.textContent('#print-sheet');
ok(empty.includes('Test date not set') && empty.includes('No assessments taken yet'), 'empty tracker prints placeholders');
ok(pages(await p.pdf({ format: 'Letter' })) === 1, 'empty summary is one page');
ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
await b.close();
