import { chromium } from 'playwright';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const S = process.env.OUT_DIR;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const local = async () => { await p.waitForTimeout(350); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };

await p.goto(BASE);
await p.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { examDate: '2026-12-01' } })));
await p.reload();

// hidden until unlocked
ok(await p.isHidden('#tab-passive'), 'Passive tab hidden by default');
await p.goto(BASE + '#passive'); await p.waitForTimeout(200);
ok(await p.isHidden('#view-passive') && await p.isVisible('#view-overview'), 'going to #passive while locked shows the overview');
await p.keyboard.press('7');
ok(await p.isVisible('#view-overview'), 'key 7 does nothing while locked');
ok(!(await p.content()).includes('PHYSEO') || await p.isHidden('#view-passive'), 'nothing of it on screen');
ok(await p.isHidden('#pv-mini-card'), 'no Passive study card on the overview while locked');

// Settings → Extras
await p.keyboard.press(',');
await p.click('[data-sec="set-extras"]');
await p.fill('#st-code', 'wrong'); await p.click('#st-unlock');
ok((await p.textContent('#st-extras .err-line')).includes('doesn’t unlock') && await p.isHidden('#tab-passive'), 'wrong code: refused');
await p.fill('#st-code', '  Passive '); await p.keyboard.press('Enter');
ok(await p.isVisible('#tab-passive') && (await local()).prefs.passive === true, 'code “passive” (any case, spaces trimmed) unlocks; saved and synced as a pref');
ok((await p.textContent('#set-keys')).includes('1 – 7'), 'shortcut list now covers 7 tabs');
const src = await (await p.request.get(BASE + 'js/passive.js')).text();
ok(!/['"]passive['"]/.test(src.replace(/prefs\.passive|state\.passive|'passive'\)/g, '')), 'the code word itself isn’t in the source');
await p.click('#st-extras button:text("Open")');
ok(await p.isVisible('#view-passive') && (await p.getAttribute('#tab-passive', 'aria-selected')) === 'true', 'Open goes to the tab');

// layout and content
ok((await p.locator('.pv-dip .pv-sec').count()) === 6, 'Divine: 6 sections (add-ons and optional series left out)');
ok((await p.locator('.pv-dip .pv-row').count()) === 37, 'Divine: 37 episodes');
const dipText = await p.textContent('.pv-dip');
ok(dipText.includes('How to Use Divine for Step 2 (2025)') && dipText.includes('Divine Patch') && !dipText.includes('Remaining Rapid Review Episodes'), 'core and Ep 573 additions there, optional series gone');
ok(!dipText.includes('Amenorrhea') && !dipText.includes('Cognitive Errors'), 'the “Recommended add-ons” list is not');
ok((await p.textContent('#pv-core .pv-sec-h')).includes('★★★★★') && (await p.textContent('#pv-bonus .pv-sec-h')).includes('★★★') && !(await p.textContent('#pv-bonus .pv-sec-h')).includes('★★★★'), 'sections show their priority stars');
ok((await p.locator('.pv-ph .pv-ph-row').count()) === 6 && (await p.textContent('.pv-ph')).includes('Biostatistics') && (await p.textContent('.pv-ph')).includes('OB/Gyn'), 'PHYSEO: 6 parts');
ok((await p.locator('.pv-ph .pv-ph-row').first().locator('.pass').count()) === 5 && (await p.locator('.pv-dip .pv-row').first().locator('.pass').count()) === 5, '5 boxes each');
ok((await p.textContent('.pv-over')).includes('0 of 37 episodes') && (await p.textContent('.pv-over')).includes('0 of 6 parts'), 'overview starts empty');
ok((await p.textContent('#ct-pv')) === '0/43', 'tab count');

// tick a DIP episode: video only, then notes
const row = (id) => p.locator(`.pv-row[data-pv="${id}"]`);
await row('dip-573').locator('.pass').nth(0).click();
ok((await row('dip-573').getAttribute('class')).includes('s-video'), 'one box → video only');
await row('dip-573').locator('.pass').nth(2).click();
let s = await local();
ok(s.passive['dip-573'].n === 3 && s.passive['dip-573'].date && !s.passive['dip-573'].notes, 'tapping box 3 ticks up to 3, dated');
await row('dip-573').locator('.pass').nth(2).click();
ok((await local()).passive['dip-573'].n === 2, 'tapping the last ticked box unticks it');
await p.click('[data-notes="dip-573"]');
ok((await row('dip-573').getAttribute('class')).includes('s-notes') && (await local()).passive['dip-573'].notes === true, 'notes switch → video + notes');
await row('dip-19').locator('.pass').nth(0).click(); // 2 h shelf review, video only
await p.click('[data-notes="dip-137"]'); // notes before the video
const over = await p.textContent('.pv-over');
ok(over.includes('2 of 37 episodes') && over.includes('2h 35m of'), 'overview: episodes and time listened (35m + 2h): ' + over.slice(0, 120));
ok(over.includes('2 with notes') && over.includes('1 video only') && over.includes('34 to do'), 'overview legend: with notes / video only / to do add up to 37');
ok((await p.textContent('#pv-core .pv-ct')) === '1/15', 'section progress counts episodes listened');

// PHYSEO
await p.locator('.pv-ph-row[data-pv="ph-ethics"] .pass').nth(1).click();
ok((await local()).passive['ph-ethics'].n === 2 && (await p.textContent('.pv-over')).includes('1 of 6 parts') && (await p.textContent('.pv-over')).includes('2 of 30 passes'), 'PHYSEO part: 2 passes');
ok((await p.textContent('#ct-pv')) === '3/43', 'tab count updates');

// filters
await p.click('[data-pvf="video"]');
ok((await p.locator('.pv-dip .pv-row').count()) === 1, 'filter “Video only”: 1');
await p.click('[data-pvf="notes"]');
ok((await p.locator('.pv-dip .pv-row').count()) === 2, 'filter “With notes”: 2');
await p.click('[data-pvf="todo"]');
ok((await p.locator('.pv-dip .pv-row').count()) === 34, 'filter “To do”: 34');
await p.click('[data-pvf="all"]');
// collapse a section (per device)
await p.click('#pv-shelf .pv-sec-h');
ok((await p.locator('#pv-shelf .pv-row').count()) === 0 && (await local()).prefs.pvCollapsed.includes('shelf'), 'collapse a section');
await p.click('#pv-shelf .pv-sec-h');
await p.screenshot({ path: S + '/passive.png', fullPage: true });

// the overview gets the same summary card (under AMBOSS articles); it stays out of the tiles, Up next and the pace
await p.click('#tab-overview'); await p.waitForTimeout(200);
const card = await p.textContent('#pv-mini-card');
ok(await p.isVisible('#pv-mini-card') && card.includes('2 of 37 episodes') && card.includes('1 of 6 parts') && card.includes('2 of 30 passes') && card.includes('2 with notes'), 'overview: Passive study card with the same numbers');
ok(card.includes('Last: Ep ') && await p.locator('#pv-mini .pv-ring').count() === 2, 'overview card: rings and the last episode');
ok(await p.evaluate(() => { const a = document.querySelector('#art-mini').closest('.card'), c = document.getElementById('pv-mini-card'); return a.parentElement === c.parentElement && a.getBoundingClientRect().bottom <= c.getBoundingClientRect().top; }), 'it sits below the AMBOSS articles card');
ok(!/Divine|PHYSEO|Passive/i.test(await p.textContent('#tiles') + await p.textContent('#next')), 'nothing about passive study in the tiles or Up next');
await p.click('#pv-mini-card button:text("Open passive study")');
ok(await p.isVisible('#view-passive') && await p.evaluate(() => location.hash) === '#passive', 'its button opens the tab');
await p.click('#tab-overview');
await p.keyboard.press('7');
ok(await p.isVisible('#view-passive'), 'key 7 opens it once unlocked');

// hide keeps progress; erase keeps the unlock but clears progress
await p.keyboard.press(','); await p.click('#st-lock');
ok(await p.isHidden('#tab-passive') && (await local()).passive['dip-573'].n === 2, 'Hide: tab gone, progress kept');
await p.keyboard.press('1');
ok(await p.isHidden('#pv-mini-card'), 'Hide: the overview card goes too');
await p.keyboard.press(',');
await p.fill('#st-code', 'passive'); await p.click('#st-unlock');
await p.click('text=Erase all data'); await p.click('text=Tap again to erase everything');
s = await local();
ok(s.prefs.passive === true && !Object.keys(s.passive).length && await p.isVisible('#tab-passive'), 'Erase clears progress but keeps the tab unlocked');
await p.click('#toasts button');
ok((await local()).passive['dip-573'].n === 2, 'undo brings it back');

// sync: passive records merge one by one like articles
const merged = await p.evaluate(async () => {
  const v = document.querySelector('script[type=module]').src.split('?')[1];
  const m = await import('./js/model.js?' + v);
  const a = m.norm({ passive: { 'dip-573': { n: 1, t: 10 }, 'ph-em': { n: 2, t: 10 } }, prefs: { passive: true } });
  const b2 = m.norm({ passive: { 'dip-573': { n: 3, notes: true, t: 20 } }, deleted: { 'p:ph-em': 30 } });
  const out = m.merge(a, b2);
  return { dip: out.passive['dip-573'], em: out.passive['ph-em'], tag: m.REC.some(([t, k]) => t === 'p:' && k === 'passive') };
});
ok(merged.tag && merged.dip.n === 3 && merged.dip.notes && !merged.em, 'merge: newest record wins, deletions carry over: ' + JSON.stringify(merged));

// phone
await p.setViewportSize({ width: 375, height: 800 }); await p.click('#tab-passive'); await p.waitForTimeout(200);
ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 375, 'fits a phone');
await p.screenshot({ path: S + '/m-passive.png', fullPage: false });
ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
await b.close();
