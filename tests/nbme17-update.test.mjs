// November 2026: NBME 17 released, NBME 9 and 10 retired (older: hidden unless taken or Show older forms).
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
await p.goto(BASE);
await p.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, items: { 'nbme-10': { status: 1, score: '238' } } })));
await p.reload();
await p.click('#tab-nbme');
const old = await p.locator('#tests [data-open^="nbme-"]').evaluateAll((els) => els.filter((e) => e.querySelector('.old')).map((e) => e.dataset.open));
ok(old.includes('nbme-9') && old.includes('nbme-10') && old.includes('nbme-8') && !old.includes('nbme-11') && !old.includes('nbme-17'), 'NBME 9 and 10 marked older, 11 and 17 not: ' + old.join(' '));
ok((await p.locator('#tests [data-open="nbme-17"]').count()) === 1, 'NBME 17 listed');
await b.close();
