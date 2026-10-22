// Fixes from the October 2026 review: the session date after midnight, typing in weak-system % boxes
// while the sheet refreshes, a qbank removed while its sheet is open, and Passive hidden elsewhere.
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const local = async () => { await p.waitForTimeout(400); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };
const mod = (name) => p.evaluate(async (name) => { const v = document.querySelector('script[type=module]').src.split('?')[1]; window['__' + name] = await import('./js/' + name + '.js?' + v); }, name);

// --- the session date moves to the new day when the app is left open overnight
await p.clock.install({ time: new Date('2026-10-21T23:00:00') });
await p.goto(BASE);
await p.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { passive: true },
  qbanks: [{ id: 'qb-xkap', name: 'Kaplan', bank: '2000', done: '100', unit: 'q', acc: '60' }] })));
await p.reload();
await p.click('#tab-qbank');
ok((await p.inputValue('#lg-date')) === '2026-10-21', 'session date starts as today');
await p.clock.setSystemTime(new Date('2026-10-22T08:00:00'));
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
ok((await p.inputValue('#lg-date')) === '2026-10-22', 'back in the app the next morning: today’s date');
await p.fill('#lg-date', '2026-10-20');
await p.clock.setSystemTime(new Date('2026-10-23T08:00:00'));
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
ok((await p.inputValue('#lg-date')) === '2026-10-20', 'a date you picked yourself is kept');
await p.fill('#lg-date', '2026-10-23'); await p.dispatchEvent('#lg-date', 'change');
await p.clock.setSystemTime(new Date('2026-10-24T09:00:00'));
await p.fill('#lg-q', '40'); await p.click('#log-form button[type=submit]');
ok((await local()).log.some((e) => e.date === '2026-10-23'), 'a picked date is used as is when logging');
await p.clock.setSystemTime(new Date('2026-10-25T09:00:00'));
await p.fill('#lg-q', '20'); await p.click('#log-form button[type=submit]');
ok((await local()).log.some((e) => e.date === '2026-10-23' && e.q === 20), 'a picked date stays for the next session too');

// --- typing in a weak-system box survives a sheet refresh (sync status, a synced change)
await p.click('#tab-nbme'); await p.click('#tests [data-open="nbme-9"]');
await p.click('.weak-pick .tag:text-is("Renal")'); await p.click('.weak-pick .tag:text-is("Cardiovascular")');
await p.click('text=Add errors per weak system');
const box = '[data-weak="sys-renal:e"]';
await p.click(box); await p.keyboard.type('5');
await mod('sheets');
await p.evaluate(() => window.__sheets.refreshSheet());
await p.keyboard.type('2');
ok((await p.evaluate(() => document.activeElement && document.activeElement.dataset.weak)) === 'sys-renal:e' && (await p.inputValue(box)) === '52', 'focus and typing survive a refresh: ' + await p.inputValue(box));
ok((await local()).items['nbme-9'].weakN['sys-renal'].e === 52, 'value saved');
await p.keyboard.press('Escape');

// --- a qbank removed (on another device) while its sheet is open: the sheet closes, no error
await p.click('#tab-qbank');
await p.click('[data-open="qb-qb-xkap"]').catch(async () => p.click('text=Kaplan'));
await p.waitForSelector('#qb-bank');
await mod('store');
await p.evaluate(() => { const s = window.__store.state; s.qbanks = s.qbanks.filter((q) => q.id !== 'qb-xkap'); });
await p.evaluate(() => window.__sheets.refreshSheet());
ok(await p.isHidden('#qb-bank'), 'the sheet closes');

// --- Passive hidden on another device while you're on its tab
await p.click('#tab-passive');
await mod('shell');
await p.evaluate(() => { window.__store.state.prefs.passive = false; window.__shell.render(); });
ok(await p.isVisible('#view-overview') && await p.isHidden('#tab-passive'), 'moves to the overview, tab hidden');
ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
await b.close();
