import { chromium } from 'playwright';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const S = process.env.OUT_DIR;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const local = async () => { await p.waitForTimeout(400); return p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker') || '{}')); };
const d = (off) => { const t = new Date(Date.now() + off * 864e5); return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
await p.goto(BASE + '');
// v2 save with UWorld bank in prefs + activity of every kind
await p.evaluate((d) => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2,
  items: { 'nbme-12': { status: 1, score: '250', date: d[2] }, 'cms-surg-7': { status: 1, score: '80', date: d[3] } },
  log: [{ id: 'x1', date: d[1], q: 120, pct: '70', src: 'UWorld' }, { id: 'x2', date: d[2], q: 30, pct: '60', src: 'UWorld' }],
  prefs: { bank: '3800', examDate: d[0] } })), [d(30), d(-1), d(-2), d(-3)]);
await p.reload();
ok((await p.textContent('h1')).trim() === 'Thunder tracker' && (await p.textContent('h1 mark')) === 'tracker' && (await p.title()) === 'Thunder tracker', 'named Thunder tracker');
let s;

// --- qbanks
await p.keyboard.press('5');
await p.click('[data-open="qb-uworld"]');
ok((await p.inputValue('#qb-bank')) === '3800' && (await p.textContent('#qb-banks')).includes('AMBOSS'), 'qbanks created, old UWorld bank size moved');
await p.fill('#qb-bank', '');
await p.selectOption('#qb-unit', 'pct');
await p.fill('#qb-done', '94'); await p.fill('#qb-acc', '65');
ok((await p.textContent('.sheet')).includes('94% done') && (await p.textContent('.sheet')).includes('correct'), 'UWorld summary: ' + await p.textContent('.sheet .hint:last-of-type'));
await p.keyboard.press('Escape');
await p.click('[data-open="qb-amboss"]');
await p.fill('#qb-bank', '3509'); await p.fill('#qb-done', '930'); await p.fill('#qb-acc', '69');
await p.keyboard.press('Escape');
let cards = await p.textContent('#qb-banks');
ok(cards.includes('94%') && cards.includes('65% correct'), 'UWorld card 94% / 65%: ' + cards.slice(0, 120));
ok(cards.includes('930') && cards.includes('3,509') && cards.includes('27% done') && cards.includes('69% correct') && cards.includes('2,579 left'), 'AMBOSS card 930/3,509, 27%, 69%, 2,579 left');
// log AMBOSS session
await p.selectOption('#lg-src', 'AMBOSS'); await p.fill('#lg-date', d(0)); await p.fill('#lg-q', '40'); await p.fill('#lg-pct', '80');
await p.click('#log-form button[type=submit]');
cards = await p.textContent('#qb-banks');
ok(cards.includes('970') && cards.includes('2,539 left') && cards.includes('40 logged here'), 'AMBOSS session adds on top');
// custom qbank
await p.click('[data-open="qb-new"]'); await p.fill('#qb-name', 'Kaplan'); await p.fill('#qb-bank', '2000'); await p.click('.sheet .btn.primary');
ok((await p.locator('#lg-src option').allTextContents()).join() === 'UWorld,AMBOSS,Kaplan,Other', 'custom qbank in session list');
await p.click('[data-open^="qb-qb-x"]'); await p.fill('#qb-name', 'Kaplan Qbank'); await p.keyboard.press('Escape');
ok((await p.textContent('#qb-banks')).includes('Kaplan Qbank'), 'renamed custom qbank');
await p.click('[data-open^="qb-qb-x"]'); await p.click('text=Remove qbank');
ok(!(await p.textContent('#qb-banks')).includes('Kaplan'), 'removed custom qbank');
await p.keyboard.press('1'); await p.waitForTimeout(150);
const tiles = await p.textContent('#tiles');
ok(tiles.includes('UWorld 94%') && tiles.includes('AMBOSS 28%'), 'overview qbank tile: ' + tiles.match(/Qbanks.*?correct/)?.[0]);
ok((await p.textContent('#next')).includes('AMBOSS 2,539 left'), 'up next qbank pace (AMBOSS only, UWorld needs bank size): ' + (await p.textContent('#next')).match(/QBANK.*?\)/i)?.[0]);

// --- systems day marker
await p.keyboard.press('4');
await p.click('.sys:first-child .seg button.v1');
s = await local();
ok(s.systems['sys-cardio'].day === d(0), 'system update dated today');

// --- articles
await p.keyboard.press('6');
const secs = await p.locator('#art-list .group h3').allTextContents();
ok(secs.length === 6 && secs[0] === 'High-Yield Patient Safety & Quality Improvement' && secs[5] === 'Recommended Extra Articles', 'six checklist sections in order');
ok(await p.locator('#art-list .acard').count() === 26 && !(await p.textContent('#art-list')).includes('Diabetes mellitus'), '26 articles, condensed list left out');
ok((await p.textContent('#ct-art')).trim() === '0/26', 'tab count 0/26');
const ps = p.locator('.acard', { hasText: 'Patient safety' }).locator('.pass');
await ps.nth(0).click();
await ps.nth(2).click();
s = await local();
ok(s.articles['amb-psqi-patient-safety'].reads === 3 && s.articles['amb-psqi-patient-safety'].date === d(0), 'ticked 3 read-throughs');
await p.locator('.acard', { hasText: 'Patient safety' }).locator('.pass').nth(2).click();
ok((await local()).articles['amb-psqi-patient-safety'].reads === 2, 'untick last box');
ok((await p.textContent('#ct-art')).trim() === '1/26', 'tab count 1/26');
const href = await p.locator('.acard', { hasText: 'Vaccination' }).locator('a.ext').getAttribute('href');
ok(href.startsWith('https://next.amboss.com/us/search?q=Vaccination'), 'built-in links to AMBOSS search');
// custom article in a built-in section, with a link
const eth = p.locator('.group', { hasText: 'High-Yield Ethics' });
await eth.locator('.sec-add').click();
await eth.locator('.art-add input[type=text]').fill('Informed consent');
await eth.locator('.art-add input[type=url]').fill('javascript:alert(1)');
await eth.locator('.art-add button', { hasText: 'Add' }).first().click();
ok((await p.textContent('#toasts')).includes('doesn’t look right') && !(await local()).artCustom.length, 'unsafe link rejected');
await eth.locator('.art-add input[type=url]').fill('https://next.amboss.com/us/article/abc123');
await eth.locator('.art-add button', { hasText: 'Add' }).first().click();
s = await local();
ok(s.artCustom.length === 1 && s.artCustom[0].sec === 'sec-ethics', 'custom article added to Ethics');
ok((await p.locator('.acard', { hasText: 'Informed consent' }).locator('a.ext').getAttribute('href')) === 'https://next.amboss.com/us/article/abc123', 'custom link used');
// custom section at the end
await p.click('#art-add-sec');
await p.fill('.art-sec-form input', 'Cardiology'); await p.keyboard.press('Enter');
await p.locator('.group', { hasText: 'Cardiology' }).locator('.art-add input[type=text]').fill('Heart failure');
await p.keyboard.press('Enter');
const secs2 = await p.locator('#art-list .group h3').allTextContents();
ok(secs2[6] === 'Cardiology' && (await p.locator('.group', { hasText: 'Cardiology' }).locator('.acard').count()) === 1, 'custom section after checklist, with article');
await p.locator('.group', { hasText: 'Cardiology' }).locator('text=Rename').click();
await p.fill('.sec-rename', 'Cardiovascular'); await p.keyboard.press('Enter');
ok((await p.locator('#art-list .group h3').allTextContents())[6] === 'Cardiovascular', 'section renamed');
await p.locator('.group', { hasText: 'Cardiovascular' }).locator('.sec-tools >> text=Remove').click();
ok(!(await p.textContent('#art-list')).includes('Heart failure'), 'section removed');
await p.click('#toasts button');
ok((await p.textContent('#art-list')).includes('Heart failure'), 'undo restores section');
// filters + search
await p.click('[data-af=read]');
ok(await p.locator('#art-list .acard').count() === 1, 'Read filter');
await p.click('[data-af=all]'); await p.fill('#art-search', 'nutri');
ok(await p.locator('#art-list .acard').count() === 4, 'search "nutri" finds 4: ' + await p.locator('#art-list .acard').count());
await p.fill('#art-search', ''); await p.dispatchEvent('#art-search', 'input');
// article sheet
await p.click('#art-list [data-open="amb-screen-vaccination"]');
await p.fill('#ar-notes', 'catch-up schedules'); await p.locator('.sheet .pass').nth(0).click();
await p.keyboard.press('Escape');
s = await local();
ok(s.articles['amb-screen-vaccination'].reads === 1 && s.articles['amb-screen-vaccination'].notes === 'catch-up schedules', 'article sheet saves notes + read');
await p.screenshot({ path: S + '/articles.png', fullPage: true });

// --- activity calendar
await p.keyboard.press('1'); await p.waitForTimeout(200);
const cls = (ds) => p.locator(`#heat .hc[data-day="${ds}"]`).getAttribute('class');
ok((await cls(d(-2))).includes('m-ex') && (await cls(d(-3))).includes('m-cms') && (await cls(d(0))).includes('m-sys'), 'assessment, CMS and system markers');
ok((await cls(d(-1))).includes('l3') && /l[1-4]/.test(await cls(d(0))), 'qbank fill levels');
await p.click(`#heat .hc[data-day="${d(-2)}"]`);
const det = await p.textContent('.heat-detail');
ok(det.includes('NBME 12 · 250') && det.includes('30 qbank questions'), 'tap shows day detail: ' + det);
await p.locator('#heat').screenshot({ path: S + '/heat.png' });
await p.evaluate(() => document.documentElement.dataset.theme = 'dark'); await p.locator('#heat').screenshot({ path: S + '/heat-dark.png' });
await p.evaluate(() => delete document.documentElement.dataset.theme);
// CSV includes articles + qbank totals
await p.keyboard.press(',');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#view-settings button:has-text("Export CSV")')]);
const csv = await (await import('fs')).promises.readFile(await dl.path(), 'utf8');
ok(csv.includes('article,High-Yield Patient Safety & Quality Improvement,Patient safety,2/5') && csv.includes('qbank-total,AMBOSS'), 'CSV has articles + qbank totals');
await p.keyboard.press('Escape');
// phone
await p.setViewportSize({ width: 375, height: 800 });
for (const k of ['1', '5', '6']) { await p.keyboard.press(k); await p.waitForTimeout(150); const w = await p.evaluate(() => { const W = document.documentElement.clientWidth; return [document.documentElement.scrollWidth, ...[...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > W + 1 && !e.closest('.tabs')).slice(0, 5).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right) + ' ' + (e.textContent || '').slice(0, 50))]; });
  ok(w[0] <= 375, 'phone width tab ' + k + ' ' + JSON.stringify(w)); }
await p.screenshot({ path: S + '/m-articles.png' });
await p.keyboard.press('5'); await p.screenshot({ path: S + '/m-qbank.png' });
ok(errs.length === 0, 'no errors ' + JSON.stringify(errs));
await b.close();
