// October 2026 update: new CMS releases, AMBOSS SA, choosing system resources, your own passive-study
// sections, and the shorter Google sync card.
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const S = process.env.OUT_DIR;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const local = async () => { await p.waitForTimeout(400); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };

await p.goto(BASE);
await p.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { passive: true },
  items: { 'cms-neuro-6': { status: 1, score: '70' } }, systems: { 'sys-renal': { status: 1, tags: ['Anki'] } } })));
await p.reload();

// --- CMS: October releases, retired forms are "older"
await p.click('#tab-cms');
const chips = async (k) => p.locator(`#cms-${k} .chip`).allTextContents();
const neuro = (await chips('neuro')).join(' '), em = (await chips('em')).join(' '), fm = (await chips('fm')).join(' ');
ok(/Form 10/.test(neuro) && /Form 11/.test(neuro) && !/Form 7\b/.test(neuro) && /Form 6/.test(neuro), 'Neurology: 10 and 11 added; 7 retired (hidden), 6 retired but shown because you took it: ' + neuro);
ok(/Form 4/.test(em) && !/Form 1\b/.test(em), 'Emergency Medicine: 4 added, 1 retired: ' + em);
ok(/Form 6/.test(fm) && /Form 7/.test(fm) && !/Form [123]\b/.test(fm) && /Form 4/.test(fm), 'Family Medicine: 6 and 7 added, 1–3 retired, 4–7 current: ' + fm);
await p.check('#show-old');
ok((await chips('em')).join(' ').includes('Form 1') && (await p.textContent('#cms-em')).includes('older'), 'Show older forms brings EM 1 back, marked older');
await p.uncheck('#show-old');

// --- AMBOSS SA in assessments
await p.click('#tab-nbme');
ok((await p.textContent('#tests')).includes('AMBOSS Self-Assessment') && await p.locator('#tests [data-open="asa-1"]').count() === 1, 'AMBOSS SA 1 listed');
await p.click('#tests [data-open="asa-1"]');
await p.fill('#ed-score', '241'); await p.fill('#ed-pct', '68'); await p.keyboard.press('Escape');
ok((await local()).items['asa-1'].score === '241' && (await p.textContent('#tests [data-open="asa-1"] .sc')).startsWith('241'), 'AMBOSS SA score logged');
await p.click('#tab-overview'); await p.waitForTimeout(200);
ok((await p.textContent('#trend-legend')).includes('AMBOSS SA'), 'shows in the score trend');

// --- systems: choose which resources to track
await p.click('#tab-systems');
const rowTags = () => p.locator('#sys-rows .sys').first().locator('.tags .tag:not(.uw):not(.weak-tag)').allTextContents();
ok(JSON.stringify((await rowTags()).map((t) => t.replace('✓ ', ''))) === JSON.stringify(['Sketchy', 'CKNotes', 'Inner Circle']), 'default: Sketchy, CKNotes, Inner Circle on every system: ' + JSON.stringify(await rowTags()));
await p.click('#sys-res-btn');
ok((await p.locator('#sys-res [data-res]').count()) === 7, 'picker offers 7 resources');
await p.click('#sys-res [data-res="FirstAid"]'); await p.click('#sys-res [data-res="Sketchy"]');
ok(JSON.stringify((await rowTags()).map((t) => t.replace('✓ ', ''))) === JSON.stringify(['CKNotes', 'Inner Circle', 'FirstAid']), 'Sketchy off, FirstAid on (in the list’s order): ' + JSON.stringify(await rowTags()));
ok(JSON.stringify((await local()).prefs.sysTags) === JSON.stringify(['CKNotes', 'Inner Circle', 'FirstAid']), 'saved (and synced)');
await p.locator('#sys-rows .sys').first().locator('.tag', { hasText: 'CKNotes' }).click();
ok((await local()).systems['sys-cardio'].tags.includes('CKNotes'), 'tick CKNotes on a system');
await p.click('#sys-rows [data-open="sys-renal"]');
const edTags = (await p.locator('.sheet .tags .tag').allTextContents()).map((t) => t.replace('✓ ', ''));
ok(edTags.includes('FirstAid') && edTags.includes('Anki') && !edTags.includes('Sketchy'), 'editor: your resources, plus an older tick (Anki) so it can be unticked: ' + edTags.join(','));
await p.keyboard.press('Escape');
await p.click('#tab-overview'); await p.waitForTimeout(200);
ok((await p.textContent('#tiles')).includes('1 CKNotes done'), 'overview tile counts your first resource');

// --- passive: your own sections
await p.click('#tab-passive');
await p.click('#pv-add-sec');
await p.fill('#pv-new-sec', 'Emma Holliday'); await p.keyboard.press('Enter');
await p.fill('#pv-new-ep', 'Cardio review'); await p.locator('.pv-form .pv-in.mins').fill('90'); await p.keyboard.press('Enter');
await p.fill('#pv-new-ep', 'Renal review'); await p.keyboard.press('Enter'); // the form stays open for the next one
await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'pv-new-ep' && !document.activeElement.value);
await p.keyboard.press('Escape');
ok(await p.isVisible('.pv-own [data-add-ep]'), 'Escape closes the form');
let s = await local();
ok(s.pvSecs.length === 1 && s.pvSecs[0].name === 'Emma Holliday' && s.pvCustom.length === 2 && s.pvCustom[0].mins === 90, 'section and two episodes saved');
const own = p.locator('.pv-own');
ok((await own.locator('.pv-row').count()) === 2 && (await own.textContent()).includes('1h 30m'), 'listed with their length');
await own.locator('.pv-row').first().locator('.pass').nth(1).click();
await own.locator('.pv-row').first().locator('.pv-note').click();
ok((await p.textContent('.pv-over')).includes('Your sections') && (await p.textContent('.pv-over')).includes('1 of 2 episodes') && (await p.textContent('.pv-over')).includes('1 with notes'), 'overview counts your sections');
ok((await p.textContent('#ct-pv')) === '1/45', 'tab count includes them: ' + await p.textContent('#ct-pv'));
await own.locator('.pv-row').nth(1).locator('.pv-x').click();
ok((await own.locator('.pv-row').count()) === 1, 'remove an episode');
await p.click('#toasts button');
ok((await own.locator('.pv-row').count()) === 2, 'undo brings it back');
await p.screenshot({ path: S + '/passive-own.png', fullPage: true });
await own.locator('.pv-sec-hw .pv-x').click();
s = await local();
ok(!s.pvSecs.length && !s.pvCustom.length && !Object.keys(s.passive).some((k) => k.startsWith('pvc-')) && await p.isVisible('#pv-add-sec'), 'remove the section: episodes and their progress go too');
await p.click('#toasts button');
ok((await local()).pvSecs.length === 1, 'undo');

// sync: your sections merge record by record
const merged = await p.evaluate(async () => {
  const v = document.querySelector('script[type=module]').src.split('?')[1];
  const m = await import('./js/model.js?' + v);
  const a = m.norm({ pvSecs: [{ id: 'pvs-a', name: 'A', t: 10 }], pvCustom: [{ id: 'pvc-1', sec: 'pvs-a', name: 'One', t: 10 }] });
  const b2 = m.norm({ pvSecs: [{ id: 'pvs-b', name: 'B', t: 20 }], deleted: { 'w:pvc-1': 30 } });
  const out = m.merge(a, b2);
  return { secs: out.pvSecs.map((x) => x.id).sort().join(), items: out.pvCustom.length };
});
ok(merged.secs === 'pvs-a,pvs-b' && merged.items === 0, 'merge: sections from both devices, a deleted episode stays deleted: ' + JSON.stringify(merged));

// --- settings: no sync explainer
await p.keyboard.press(',');
ok(!(await p.textContent('#set-sync')).includes('When does it sync'), 'Google sync card without “When does it sync?”');
ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
await b.close();
