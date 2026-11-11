// The AMBOSS tracker extra: switched on in Settings → Extras, its tab and overview card, read from a
// synthetic AMBOSS tracker page (the real one is at ../amboss-tracker/ next to this app).
import { chromium } from 'playwright';
import { makeAmbossData, makeAmbossPage } from './fixtures/amboss-page.mjs';
const BASE = process.env.BASE_URL;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const local = async () => { await p.waitForTimeout(350); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };

let page = makeAmbossPage(), hits = 0, fail = false;
await p.route('**/amboss-tracker/**', (r) => { hits++; return fail ? r.fulfill({ status: 500, body: 'down' }) : r.fulfill({ body: page, contentType: 'text/html' }); });

await p.goto(BASE);
await p.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { examDate: '2026-12-01' } })));
await p.reload();
ok(await p.isHidden('#tab-amboss') && await p.isHidden('#amb-mini-card'), 'off by default: no tab, no overview card');
await p.goto(BASE + '#amboss'); await p.waitForTimeout(200);
ok(await p.isVisible('#view-overview') && hits === 0, 'going to #amboss while off shows the overview and reads nothing');

// Extras: the code first (it opens Passive study), then AMBOSS has its own switch
await p.keyboard.press(',');
await p.click('[data-sec="set-extras"]');
ok(await p.isVisible('#st-code') && !(await p.textContent('#st-extras')).includes('AMBOSS'), 'locked Extras: only the code box');
await p.fill('#st-code', 'passive'); await p.keyboard.press('Enter');
ok(await p.isVisible('#st-ex-amboss') && await p.isVisible('#st-amboss-show'), 'unlocked: an AMBOSS tracker row with Show');
await p.click('#st-amboss-show');
ok(await p.isVisible('#tab-amboss') && (await local()).prefs.amboss === true, 'Show turns it on: a tab, saved as a synced pref');
ok((await p.textContent('#set-keys')).includes('1 – 8'), 'shortcuts cover 8 tabs');
await p.click('#st-ex-passive button:text("Hide")');
ok(await p.isHidden('#tab-passive') && await p.isVisible('#tab-amboss') && await p.isVisible('#st-passive-show'), 'Passive can be hidden on its own; AMBOSS stays');
await p.click('#st-ex-amboss button:text("Open")');
await p.waitForSelector('.amb-tiles');
ok((await p.getAttribute('#tab-amboss', 'aria-selected')) === 'true' && hits === 1, 'Open goes to the tab; the page is read once');

// dashboard
const tiles = await p.textContent('.amb-tiles');
ok(tiles.includes('81.7%') && tiles.includes('▲') && tiles.includes('240') && tiles.includes('65.0%'), 'tiles: last 3, change, questions, stable %: ' + tiles.slice(0, 160));
ok((await p.textContent('#tab-amboss .ct')) === '240', 'tab count: questions done');
ok((await p.locator('#amb-body .amb-chart circle').count()) === 12 && (await p.textContent('.amb-chart')).includes('+CVS'), 'chart: a dot per block, system marks');
ok((await p.locator('.amb-focus li').count()) === 7 && (await p.textContent('.amb-focus li')).includes('Fake topic alpha'), 'focus next: 7 topics, the repeated one first');
ok((await p.textContent('.amb-tip')).startsWith('Fix first.'), 'a tip for the top miss reason');
ok((await p.locator('.amb-heat tbody tr').count()) > 3 && (await p.locator('.amb-heat thead th').count()) === 3 + 3, 'heat: current era has 3 review sets');
await p.click('[data-amb="all"]');
ok((await p.locator('.amb-heat thead th').count()) === 6 + 3, 'scope All: 6 review sets');
ok((await p.textContent('.amb-built')).includes('2026-11-01 09:30'), 'shows when the page was built');

// questions
await p.click('[data-amb="questions"]');
ok((await p.locator('details.amb-q').count()) === 36 && (await p.textContent('.amb-qct')) === '36 questions', 'question browser: all 36 in scope All');
await p.selectOption('[data-f="status"]', 'U');
ok((await p.locator('details.amb-q').count()) === 12, 'filter: unstable');
await p.fill('#amb-q', 'alpha');
ok((await p.locator('details.amb-q').count()) === 0 && await p.isVisible('.amb-qlist .sub'), 'search with filter: nothing matches');
await p.selectOption('[data-f="status"]', '');
ok((await p.locator('details.amb-q').count()) === 6, 'search “alpha”: 6');
await p.locator('details.amb-q summary').first().click();
const body = await p.textContent('details.amb-q[open] .amb-qbody');
ok(body.includes('50%') && !body.includes('$') && body.includes('Made-up trap'), 'opened: board call, hinge (LaTeX made plain), trap');
// switching views keeps the search
await p.click('[data-amb="dash"]'); await p.click('[data-amb="questions"]');
ok((await p.inputValue('#amb-q')) === 'alpha', 'the search is kept while switching views');

// overview card
await p.click('#tab-overview');
await p.waitForSelector('#amb-mini .amb-mini');
const card = await p.textContent('#amb-mini');
ok(await p.isVisible('#amb-mini-card') && card.includes('82%') && card.includes('Focus next') && card.includes('Updated 2026-11-01 09:30'), 'overview card: last 3, focus, updated');
ok((await p.locator('#amb-mini .amb-focus li').count()) === 3 && (await p.locator('#amb-mini svg circle').count()) === 12, 'card: 3 topics and a sparkline');
ok(hits === 1, 'not read again within 5 minutes');
await p.click('#amb-mini button:text("Open AMBOSS")');
ok(await p.isVisible('#view-amboss'), 'card opens the tab');

// refresh picks up a new build; a failure keeps the last copy
page = makeAmbossPage(Object.assign(makeAmbossData({ blocks: 14 }), { built: '2026-11-02 10:00' }));
await p.click('[data-amb="dash"]');
await p.click('#amb-refresh');
await p.waitForFunction(() => document.querySelector('.amb-built') && document.querySelector('.amb-built').textContent.includes('11-02'));
ok(hits === 2 && (await p.locator('#amb-body .amb-chart circle').count()) === 14, 'Refresh reads the new page: ' + hits + ' ' + await p.locator('#amb-body .amb-chart circle').count());
fail = true;
await p.click('#amb-refresh');
await p.waitForSelector('#amb-body .banner');
ok((await p.textContent('#amb-body .banner')).includes('showing the last one') && (await p.locator('#amb-body .amb-chart circle').count()) === 14, 'a failed refresh keeps the last copy and says so');

// fresh page load while the AMBOSS page is down: a clear message and Try again
await p.reload(); await p.click('#tab-overview');
await p.waitForSelector('#amb-mini button:text("Try again")');
ok((await p.textContent('#amb-mini')).includes('Couldn’t load'), 'nothing loaded: message on the card');
fail = false;
await p.click('#amb-mini button:text("Try again")');
await p.waitForSelector('#amb-mini .amb-mini');
ok(true, 'Try again loads it');

// Hide
await p.keyboard.press(',');
await p.click('[data-sec="set-extras"]');
await p.click('#st-amb-hide');
ok(await p.isHidden('#tab-amboss') && (await local()).prefs.amboss === false, 'Hide: tab gone, pref off');
ok(await p.isVisible('#st-code'), 'both extras hidden: the code box is back');

// phone width: no sideways scroll
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ck-tracker')); s.prefs.amboss = true; localStorage.setItem('ck-tracker', JSON.stringify(s)); });
await p.setViewportSize({ width: 375, height: 800 });
await p.goto(BASE + '#amboss'); await p.reload();
await p.waitForSelector('.amb-tiles');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: the AMBOSS tab fits without sideways scroll');
await p.click('[data-amb="questions"]');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: the question list fits');

ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close();
