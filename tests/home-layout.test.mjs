// Settings → Home page: reorder, resize and hide the overview's blocks (saved per device).
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const lay = async () => { await p.waitForTimeout(400); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker')).prefs.ovLayout); };
const order = () => p.evaluate(() => [...document.querySelectorAll('#ov-grid > [data-blk]:not([hidden])')].map((x) => x.dataset.blk).join());
const keys = () => p.evaluate(() => [...document.querySelectorAll('#st-layout .lay-b')].map((x) => x.dataset.k).join());

await p.goto(BASE);
ok(await order() === 'tiles,trend,cms,next,heat,weak,sys,art', 'default overview order (extras off)');
await p.keyboard.press(',');
await p.click('.set-nav a[data-sec="set-home"]'); await p.waitForTimeout(700); // smooth scroll
ok(await keys() === 'tiles,trend,cms,next,heat,weak,sys,art', 'the map lists the blocks you can see (no Passive or AMBOSS tracker while they are off)');
ok(await p.isDisabled('#st-lay-reset'), 'Reset is off at the default');

// drag Up next in front of Score trend
const g = await p.locator('#st-layout [data-k="next"] .lay-g').boundingBox(), t = await p.locator('#st-layout [data-k="trend"]').boundingBox();
await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await p.mouse.down();
for (let i = 1; i <= 10; i++) { await p.mouse.move(g.x + (t.x + 12 - g.x) * i / 10, g.y + (t.y + t.height / 2 - g.y) * i / 10); await p.waitForTimeout(40); }
await p.waitForTimeout(200); await p.mouse.up();
ok(await keys() === 'tiles,next,trend,cms,heat,weak,sys,art', 'drag moves a block: ' + await keys());
ok((await lay()).map((r) => r.k).slice(0, 3).join() === 'tiles,next,trend', 'saved');

// keyboard: arrow keys on the grip
await p.focus('#st-layout [data-k="weak"] .lay-g'); await p.keyboard.press('ArrowUp');
ok(await keys() === 'tiles,next,trend,cms,weak,heat,sys,art', 'arrow keys move a block');
await p.waitForFunction(() => document.activeElement.closest('[data-k="weak"]'));
ok(true, 'focus stays on the moved block');

// width and hide
await p.click('#st-layout [data-k="heat"] .lay-w');
ok((await lay()).find((r) => r.k === 'heat').w === 'full' && await p.getAttribute('#st-layout [data-k="heat"] .lay-w', 'aria-pressed') === 'true', 'width toggles to full');
await p.click('#st-layout [data-k="cms"] .lay-e');
ok((await lay()).find((r) => r.k === 'cms').hide === true && !(await p.$('#st-layout [data-k="cms"]')) && await p.isVisible('#st-lay-hidden [data-k="cms"]'), 'hiding moves it to the Hidden tray');
const span = (k) => p.evaluate((k) => getComputedStyle(document.querySelector(`#st-layout [data-k="${k}"]`)).getPropertyValue('--span').trim(), k);
ok(await span('trend') === '3' && await span('heat') === '6' && await span('weak') === '6', 'map: halves pair up, full blocks take the row');

await p.click('#tab-overview'); await p.waitForTimeout(200);
ok(await order() === 'tiles,next,trend,weak,heat,sys,art', 'overview follows: ' + await order());
ok(await p.evaluate(() => { const a = document.querySelector('[data-blk="next"]').getBoundingClientRect(), c = document.querySelector('[data-blk="trend"]').getBoundingClientRect(), w = document.querySelector('[data-blk="heat"]').getBoundingClientRect(), g = document.getElementById('ov-grid').getBoundingClientRect();
  return Math.abs(a.top - c.top) < 2 && a.right < c.left && Math.abs(w.width - g.width) < 2; }), 'Up next and Score trend share a row; Activity is full width');
ok(await p.isHidden('[data-blk="cms"]'), 'hidden block is gone from the overview');

// odd runs: three halves share a row; a lone half fills it
await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('ck-tracker')); x.prefs.passive = true; localStorage.setItem('ck-tracker', JSON.stringify(x)); });
await p.reload(); await p.waitForTimeout(200);
ok(await p.evaluate(() => { const r = ['sys', 'art', 'pv'].map((k) => document.querySelector(`[data-blk="${k}"]`).getBoundingClientRect()); return r.every((x) => Math.abs(x.top - r[0].top) < 2) && r[0].right < r[1].left && r[1].right < r[2].left; }), 'Passive on: three halves in one row');

// show again from the tray, then reset with undo
await p.keyboard.press(',');
await p.click('#st-lay-hidden [data-k="cms"]');
ok((await lay()).find((r) => r.k === 'cms').hide === false && (await keys()).includes('cms') && await p.isHidden('#st-lay-hidden'), 'tapping a hidden block brings it back');
await p.click('#st-lay-reset');
ok((await lay()) === null && await keys() === 'tiles,trend,cms,next,heat,weak,sys,art,pv', 'Reset brings back the default');
await p.click('#toasts button');
ok((await lay()).map((r) => r.k)[1] === 'next', 'undo takes the reset back');

// old or odd saved values: unknown blocks dropped, missing ones added after their neighbour
await p.waitForTimeout(500);
await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('ck-tracker')); x.prefs.ovLayout = [{ k: 'weak', w: 'half' }, { k: 'zzz' }, { k: 'tiles', w: 'odd' }, 'x']; localStorage.setItem('ck-tracker', JSON.stringify(x)); });
await p.reload(); await p.click('#tab-overview'); await p.waitForTimeout(200);
ok(await order() === 'weak,sys,art,pv,tiles,trend,cms,next,heat', 'messy saved layout is cleaned up: ' + await order());

await p.setViewportSize({ width: 375, height: 800 });
ok(await p.evaluate(() => { const g = document.getElementById('ov-grid').getBoundingClientRect(); return [...document.querySelectorAll('#ov-grid > :not([hidden])')].every((x) => Math.abs(x.getBoundingClientRect().width - g.width) < 2); }), 'phone: every block full width');
await p.keyboard.press(','); await p.click('.set-nav a[data-sec="set-home"]');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'settings fits a phone');
ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
await b.close();
