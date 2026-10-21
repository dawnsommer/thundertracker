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
const cms = { med: 10, surg: 9, peds: 9, obgyn: 10, psych: 8, neuro: 9, fm: 5, em: 3 };
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
ok(/Renal\s*\d+×/.test(txt) || /Endocrine\s*\d+×/.test(txt), 'recurring weak systems ranked');
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
