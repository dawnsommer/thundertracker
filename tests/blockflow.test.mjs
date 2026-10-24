// BlockFlow, the exam timer page: opening it, the NBME and custom workflows, breaks, pause, recovery
// after a reload, a second tab, picture-in-picture and the phone layout. Uses Playwright's fake clock.
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL;
const S = process.env.OUT_DIR;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const M = 60000;
const txt = async (sel, page = p) => (await page.textContent(sel)).trim();
const A = (page = p) => txt('#bf-body [data-f="a"]', page), B = (page = p) => txt('#bf-body [data-f="b"]', page);
const st = (page = p) => txt('#bf-body .bf-st', page);
const btn = (label, page = p) => page.locator('#bf-body .bf-acts button', { hasText: label });
const run = async (ms) => { await p.clock.fastForward(ms); await p.clock.runFor(300); };
const session = () => p.evaluate(() => JSON.parse(localStorage.getItem('thundertracker:blockflow-session')));

await p.clock.install({ time: new Date('2026-10-24T09:00:00') });
await p.goto(BASE);
await p.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, prefs: { examDate: '2026-12-01' } })));
await p.reload();
const before = await p.evaluate(() => localStorage.getItem('ck-tracker'));

// the header icon opens the page and, tapped again, returns to the tab you were on (no Back button)
await p.click('#tab-cms');
await p.click('#open-timer');
ok(await p.isVisible('#view-timer') && (await p.evaluate(() => location.hash)) === '#timer', 'timer icon opens the BlockFlow page (#timer)');
ok((await p.getAttribute('#open-timer', 'aria-pressed')) === 'true' && (await p.locator('.tab[aria-selected="true"]').count()) === 0, 'icon pressed, no tab selected');
ok(!(await p.locator('#view-timer').getByText('← Back').count()) && !(await p.locator('#timer-back').count()), 'no Back button on the page');
await p.click('#open-timer');
ok(await p.isVisible('#view-cms'), 'the icon returns to CMS forms');
await p.keyboard.press('b');
ok(await p.isVisible('#view-timer'), 'key b opens it');
await p.click('#open-timer');
ok(await p.isVisible('#view-cms'), 'the icon again closes it');
await p.goto(BASE + '#timer');
ok(await p.isVisible('#bf-body .bf-setup'), 'a direct link to #timer works');
// no jitter: on a tall screen the timer page is shorter than the window, so (with real, non-overlay
// scrollbars) the page scrollbar goes away; the layout must not shift sideways when that happens
{
  const bs = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, ignoreDefaultArgs: ['--hide-scrollbars'] });
  const q = await (await bs.newContext({ viewport: { width: 1280, height: 1400 } })).newPage();
  await q.goto(BASE);
  ok(await q.evaluate(() => document.documentElement.scrollHeight > innerHeight), 'the overview scrolls at this height');
  const x0 = await q.evaluate(() => document.querySelector('h1').getBoundingClientRect().left);
  await q.click('#open-timer');
  ok(await q.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'the timer page doesn’t');
  const x1 = await q.evaluate(() => document.querySelector('h1').getBoundingClientRect().left);
  ok(x0 === x1, 'opening the timer doesn’t shift the page sideways (' + x0 + ' → ' + x1 + ')');
  await bs.close();
}

// setup: NBME default, custom plan preview with a partial last block
ok((await txt('#bf-start')) === 'Start · 200 questions · 5:00:00' && await p.isHidden('#bf-custom'), 'NBME is the default: 200 questions, 5 hours');
ok(/200\s*questions/.test(await txt('#bf-sum')) && (await txt('#bf-sum')).includes('blocks of 30:00') && (await txt('#bf-sum')).includes('5:00:00'), 'summary: 200 questions, 10 blocks of 30:00, 5:00:00');
ok((await p.locator('#bf-breaks button').count()) === 10 && (await p.locator('#bf-breaks button:not([disabled])').count()) === 9, 'a strip of 10 blocks; a break can follow blocks 1–9');
await p.click('[data-k="mode"] button[data-v="custom"]');
await p.fill('#bf-q', '45');
const titles = () => p.locator('#bf-breaks button').evaluateAll((bs) => bs.map((x) => x.title));
ok((await titles()).join() === 'Q1–20 · 30:00,Q21–40 · 30:00,Q41–45 · 7:30' && (await txt('#bf-sum')).includes('1:07:30'), 'custom 45 at 90 s: 3 blocks, last one 7:30, 1:07:30 in all');
ok(await p.locator('#bf-breaks button').nth(2).evaluate((x) => x.offsetWidth < x.previousElementSibling.offsetWidth / 2), 'the short last block is drawn short');
await p.fill('#bf-total', '60');
ok((await titles())[0] === 'Q1–20 · 26:40' && (await txt('#bf-sum')).includes('1:00:00'), 'a total override is shared out: 26:40 per 20 questions');
await p.fill('#bf-total', '');
ok((await p.locator('#bf-breaks button:not([disabled])').count()) === 2, 'planned-break choices follow the number of blocks');
await p.click('[data-k="mode"] button[data-v="nbme"]');
await p.click('#bf-breaks button[data-b="2"]');
ok((await p.getAttribute('#bf-breaks button[data-b="2"]', 'aria-pressed')) === 'true', 'tapping block 2 plans a break after it');
const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem('thundertracker:blockflow')));
ok(cfg.mode === 'nbme' && cfg.q === 45 && cfg.planned.join() === '2', 'settings saved locally under thundertracker:blockflow');
await p.screenshot({ path: S + '/blockflow-setup.png', fullPage: true });

// NBME run: block 1 to its end
await p.click('#bf-start');
ok((await st()) === 'Focus' && (await txt('#bf-body .bf-where')) === 'Block 1 of 10 · Q1–20' && (await A()) === '30:00' && (await B()) === '5:00:00', 'start: Focus, block 1 Q1–20, 30:00 and 5:00:00');
ok((await p.locator('#bf-body .bf-cells i').count()) === 10 && (await p.locator('#bf-body .bf-cells u').count()) === 3, '10 block cells and the NBME section marks at Q50, Q100, Q150');
ok(await p.evaluate(() => document.getElementById('open-timer').classList.contains('live')), 'the header icon shows a session is running');
await p.waitForTimeout(200);
ok((await p.evaluate(() => window.__blockflow.sched())).join() === 's0,t', 'the block-end and time-up chimes are scheduled on the audio clock (exact even in a background tab)');
await run(10 * M);
ok((await A()) === '20:00' && (await B()) === '4:50:00', 'both clocks count down together: ' + (await A()) + ' ' + (await B()));
await run(20 * M + 2000);
ok((await st()) === 'Block done' && (await A()) === '0:00' && (await B()) === '4:29:58', 'block end: A stops at 0:00, total keeps running: ' + (await A()) + ' ' + (await B()));
ok((await session()).fired.s0 === 1, 'the alert is recorded so it never repeats');
ok(await btn('Continue to block 2').isVisible() && await btn('Take break · 5 min').isVisible(), 'offers Continue or Take break');
ok((await btn('Continue to block 2').getAttribute('class')).includes('primary'), 'no break planned after block 1: Continue is the main button');

// Continue without a break
await btn('Continue to block 2').click();
ok((await st()) === 'Focus' && (await A()) === '30:00' && (await txt('#bf-body .bf-where')).includes('Q21–40'), 'Continue: block 2 starts straight away');
await run(30 * M);
ok((await btn('Take break').getAttribute('class')).includes('primary'), 'a planned break after block 2 makes Take break the main button');

// a break pauses the total
await btn('Take break').click();
const totAtBreak = await B();
ok((await st()) === 'Break' && (await A()) === '5:00', 'Take break: A becomes the break countdown');
await run(3 * M);
ok((await A()) === '2:00' && (await B()) === totAtBreak, 'during the break the total doesn’t move');
await run(2 * M + 1000);
ok((await st()) === 'Break over' && (await A()).startsWith('+0:0') && (await B()) === totAtBreak, 'break end: total still paused, A shows time over');
await run(M);
ok((await B()) === totAtBreak, 'an overrun break uses no answering time');
await btn('Extend break +5 min').click();
ok((await st()) === 'Break' && (await A()) === '5:00', 'Extend break: 5 more minutes');
await btn('Start block 3').click();
ok((await st()) === 'Focus' && (await A()) === '30:00' && (await B()) === totAtBreak, 'Start next block: total resumes from where it stopped');

// pause and resume, by button and Space
await run(5 * M);
await btn('Pause').click();
ok((await st()) === 'Paused' && (await A()) === '25:00', 'Pause');
ok((await p.evaluate(() => window.__blockflow.sched())).length === 0, 'paused: no chime left scheduled');
await run(10 * M);
ok((await A()) === '25:00' && (await session()).paused === true, 'paused: nothing moves, and it’s saved');
await btn('Resume').click();
await run(M);
ok((await A()) === '24:00' && (await st()) === 'Focus', 'Resume carries on: ' + (await A()));
await p.locator('#timer-h').click();
await p.keyboard.press(' ');
ok((await st()) === 'Paused', 'Space pauses');
await p.keyboard.press(' ');
ok((await st()) === 'Focus', 'Space resumes');

// finish a block early
await btn('Finish block early').click();
ok((await st()) === 'Block done' && (await txt('#bf-body .bf-prog-l')).startsWith('60 of 200'), 'Finish block early: block done, 60 questions behind you');
await btn('Continue to block 4').click();
await p.screenshot({ path: S + '/blockflow-focus.png', fullPage: true });

// a reload keeps the session (it keeps running) and offers a restore banner
const tBefore = await B();
await p.reload();
await p.waitForSelector('#bf-body .bf-live');
const secs = (x) => x.split(':').reduce((a, v) => a * 60 + Number(v), 0);
ok(Math.abs(secs(await B()) - secs(tBefore)) <= 2 && (await txt('#bf-body .bf-where')).includes('Block 4'), 'after a reload: same block, same time: ' + tBefore + ' → ' + (await B()));
ok(await p.isVisible('#bf-body .bf-rec'), 'restore banner shown');
await p.click('#bf-body .bf-rec button:text("Keep going")');
ok(await p.isHidden('#bf-body .bf-rec'), 'Keep going dismisses it');

// a second tab shows the same session; pausing in one pauses the other
const p2 = await ctx.newPage();
await p2.goto(BASE + '#timer');
await p2.waitForSelector('#bf-body .bf-live');
ok((await txt('#bf-body .bf-where', p2)) === (await txt('#bf-body .bf-where')), 'a second tab shows the same session');
await btn('Pause', p2).click();
await p.waitForTimeout(300);
ok((await st()) === 'Paused', 'pausing in one tab pauses it in the other (one session, not two)');
await btn('Resume').click();
await p2.close();

// picture-in-picture: same session, closes back to the page without a reset
if (await p.evaluate(() => 'documentPictureInPicture' in window)) {
  await p.click('#bf-pip-btn');
  await p.waitForFunction(() => window.__blockflow.pip);
  const pipText = await p.evaluate(() => window.__blockflow.pip.document.body.innerText);
  ok(pipText.includes('Block 4 of 10') && pipText.includes('Q61–80') && pipText.includes('Pause') && /total left/i.test(pipText), 'PiP shows both timers, block, range and controls');
  await p.evaluate(() => [...window.__blockflow.pip.document.querySelectorAll('button')].find((x) => x.textContent === 'Pause').click());
  await p.waitForTimeout(100);
  ok((await st()) === 'Paused', 'PiP buttons drive the same session');
  const held = await A();
  await p.evaluate(() => window.__blockflow.pip.close());
  await p.waitForFunction(() => !window.__blockflow.pip);
  ok((await A()) === held && (await st()) === 'Paused', 'closing PiP leaves the session as it was');
  await btn('Resume').click();
} else ok(await p.isHidden('#bf-pip-btn'), 'no PiP support: no PiP button');

// end the session deliberately (two taps), then a summary
await p.click('#bf-body .bf-foot button');
ok((await txt('#bf-body .bf-foot button')) === 'Tap again to end' && (await st()) === 'Focus', 'End session needs a second tap');
await p.click('#bf-body .bf-foot button');
ok((await st()) === 'Complete' && await btn('New session').isVisible(), 'ended: summary');
ok(!(await p.evaluate(() => document.getElementById('open-timer').classList.contains('live'))), 'icon no longer shows a live session');
// it went into the history, with a generic name, the date and per-block times
const hist = () => p.evaluate(() => JSON.parse(localStorage.getItem('thundertracker:blockflow-history')));
let h1 = Object.values((await hist()).sessions);
ok(h1.length === 1 && h1[0].n === 1 && h1[0].name === '' && h1[0].qd === 60 && h1[0].blk.length === 4 && h1[0].plan.length === 10, 'saved to history: 60 questions reached, 4 block times');
const near = (x, m) => Math.abs(x - m * M) < 5000;
ok(near(h1[0].blk[0], 30) && near(h1[0].blk[1], 30) && near(h1[0].blk[2], 6), 'block times are answering time: 30, 30 (the break left out) and 6 min (the 10-min pause left out)');
ok((await txt('#bf-body .bf-where')).startsWith('Session 01 · 60 questions'), 'the summary names it Session 01');
ok((await txt('#bf-hist .bf-hrow')).includes('Session 01') && (await txt('#bf-hist .bf-hrow')).includes('24 Oct 26') && (await txt('#bf-hist .bf-hstat')).startsWith('60/200 q'), 'history row: name, date, 60/200 questions');
ok((await p.locator('#bf-hist .bf-hbars i').count()) === 10 && (await p.locator('#bf-hist .bf-hbars i.no').count()) === 6 && !(await p.locator('#bf-hist .bf-hbars i.over').count()), 'one bar per block; blocks not reached are faded, none ran over');
await btn('New session').click();
ok(await p.isVisible('#bf-start') && (await session()) === null, 'New session clears it');

// custom run with a partial last block, then total expiry and overtime
await p.click('[data-k="mode"] button[data-v="custom"]');
await p.fill('#bf-q', '25'); await p.fill('#bf-pace', '60');
ok((await p.getAttribute('#bf-name', 'placeholder')).includes('Session 02'), 'the name field suggests the next generic name');
await p.fill('#bf-name', 'AMBOSS cardio');
await p.click('#bf-start');
ok((await txt('#bf-body .bf-where')) === 'Block 1 of 2 · Q1–20' && (await A()) === '20:00' && (await B()) === '0:25:00', 'custom: 25 questions at 60 s');
await run(20 * M + 500);
await btn('Continue to block 2').click();
ok((await A()) === '5:00' && (await txt('#bf-body .bf-where')).includes('Q21–25'), 'partial last block: 5 questions, 5:00');
await run(5 * M + 30000);
ok((await st()) === 'Overtime' && (await B()).startsWith('+0:00:3') && await btn('Finish exam').isVisible(), 'total time up: Overtime, counting on, Finish exam offered');
ok(!(await p.locator('#bf-body .bf-acts button', { hasText: 'Continue' }).count()), 'no Continue after the last block');
await btn('Finish exam').click();
ok((await st()) === 'Complete' && (await txt('#bf-body .bf-where')).startsWith('AMBOSS cardio · 25 questions'), 'Finish exam; your name is kept');
ok((await p.locator('#bf-hist .bf-hrow').count()) === 2 && (await txt('#bf-hist .bf-hrow .bf-hn')) === 'AMBOSS cardio', 'newest first in the history');
// rename and delete (with undo)
await p.click('#bf-hist .bf-hrow:nth-child(3) .bf-hn');
await p.fill('#bf-hist .bf-hn-in', 'NBME 12'); await p.keyboard.press('Enter');
h1 = Object.values((await hist()).sessions).find((r) => r.n === 1);
ok(h1.name === 'NBME 12' && (await p.locator('#bf-hist .bf-hn', { hasText: 'NBME 12' }).count()) === 1, 'tap a name to rename it');
await p.click('#bf-hist .bf-hrow:nth-child(2) .bf-hx');
ok((await p.locator('#bf-hist .bf-hrow').count()) === 1 && Object.keys((await hist()).del).length === 1, 'delete leaves a tombstone (so it stays deleted after a sync)');
await p.click('#toasts button:text("Undo")');
ok((await p.locator('#bf-hist .bf-hrow').count()) === 2 && Object.keys((await hist()).sessions).length === 2, 'Undo brings it back');
await btn('New session').click();

// background-tab accuracy: with timers frozen for a long stretch, the clocks are right as soon as it ticks again
await p.click('[data-k="mode"] button[data-v="nbme"]');
await p.click('#bf-start');
await p.clock.pauseAt(new Date(await p.evaluate(() => Date.now() + 47 * 60000 + 13000)));
await p.clock.resume();
await p.waitForTimeout(400);
ok((await st()) === 'Block done' && (await B()) === '4:12:47', 'after a 47-minute gap: block 1 over, total 4:12:47 (from timestamps, not ticks)');

// phone width: no sideways scroll on the setup and the timer
for (const w of [390, 340]) {
  await p.setViewportSize({ width: w, height: 800 });
  await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), w + ' px: timer page fits' + await p.evaluate(() => ' ' + document.documentElement.scrollWidth + ' ' + [...document.querySelectorAll('#view-timer *')].filter((e) => e.getBoundingClientRect().right > innerWidth).map((e) => e.className || e.tagName).slice(0, 5).join()));
}
await p.screenshot({ path: S + '/blockflow-phone.png', fullPage: true });
await btn('Take break').click();
await p.click('#bf-body .bf-foot button'); await p.click('#bf-body .bf-foot button'); await btn('New session').click();
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'setup fits too');
await p.setViewportSize({ width: 1280, height: 900 });

// it only touches its own keys
const keys = await p.evaluate(() => Object.keys(localStorage));
ok(keys.every((k) => k === 'ck-tracker' || k.startsWith('thundertracker:')), 'only ck-tracker and thundertracker:* keys in storage: ' + keys.join(', '));
ok((await p.evaluate(() => localStorage.getItem('ck-tracker'))) === before, 'the tracker’s own data is untouched');
await p.click('#open-timer');
ok(await p.isVisible('#view-overview') || await p.isVisible('#view-cms'), 'the rest of the app still works after');
ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close();
