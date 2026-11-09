// November 2026: OB/GYN forms 11 and 12 released, 7 and 8 retired.
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
await p.goto(BASE);
await p.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, items: { 'cms-obgyn-7': { status: 1, score: '70' } } })));
await p.reload();
await p.click('#tab-cms');
const ob = (await p.locator('#cms-obgyn .chip').allTextContents()).join(' ');
ok(/Form 11/.test(ob) && /Form 12/.test(ob) && !/Form 8(?!\d)/.test(ob) && /Form 7(?!\d)/.test(ob), 'OB/GYN: 11 and 12 added; 8 retired (hidden), 7 retired but shown because taken: ' + ob);
await p.check('#show-old');
ok((await p.locator('#cms-obgyn .chip').allTextContents()).join(' ').includes('Form 8'), 'Show older forms brings OB/GYN 8 back');
await b.close();
