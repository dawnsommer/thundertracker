import { chromium } from 'playwright';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const W = 'https://study-tools-auth-worker.summerofdawn20.workers.dev';
let worker = 0, list = 0, get = 0, up = 0, hist = 0, drv = 0, failDrive = false; let file = null; const history = [];
const ctx = await b.newContext();
await ctx.route(W + '/**', (r) => { worker++; return r.fulfill({ json: { access_token: 'tok', expires_in: 3600, email: 'me@example.com' } }); });
await ctx.route('https://www.googleapis.com/**', async (r) => {
  drv++;
  if (failDrive) return r.fulfill({ status: 503, json: { error: { message: 'unavailable' } } });
  const u = new URL(r.request().url()), m = r.request().method();
  if (m === 'GET' && u.pathname === '/drive/v3/files') { list++; return r.fulfill({ json: { files: [...(file ? [file] : []), ...history] } }); }
  if (m === 'GET') { get++; return r.fulfill({ body: file.body, contentType: 'application/json' }); }
  const parts = m === 'POST' ? r.request().postData().split('\r\n\r\n') : null;
  const name = parts ? JSON.parse(parts[1].split('\r\n--')[0]).name : 'thundertracker-state.json';
  if (name !== 'thundertracker-state.json') { hist++; history.push({ id: 'h' + hist, name }); return r.fulfill({ json: { id: 'h' + hist } }); }
  up++;
  const body = parts ? parts[2].split('\r\n--')[0] : r.request().postData();
  file = { id: 'f1', name: 'thundertracker-state.json', modifiedTime: new Date(Date.now() + up * 1000).toISOString(), md5Checksum: 'm' + up, body };
  return r.fulfill({ json: { id: 'f1', modifiedTime: file.modifiedTime, md5Checksum: file.md5Checksum } });
});
const p = await ctx.newPage();
const idle = () => p.waitForFunction(() => !['syncing', 'connecting'].includes(window.CKCloud.status().state), null, { timeout: 20000 });
await p.goto(BASE + '#cloud-auth=sess'); await idle();
ok(worker === 1 && up === 1, 'sign-in: 1 Worker call, 1 upload (w=' + worker + ' up=' + up + ')');
ok(hist === 1 && /^thundertracker-history-\d{4}-\d{2}-\d{2}\.json$/.test(history[0].name), 'first sync of the day saves one dated copy (' + (history[0] || {}).name + ')');
for (let i = 0; i < 3; i++) { await p.reload(); await idle(); }
ok(worker === 1, 'three reloads: no extra Worker calls (w=' + worker + ')');
ok(get === 0 && up === 1, 'three reloads: no download/upload when nothing changed (get=' + get + ' up=' + up + ')');
const l0 = list;
// return to the tab within 5 minutes: no Drive call
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForTimeout(500);
ok(list === l0, 'returning within 5 min: no Drive call');
// 15 quick edits -> one upload after the pause
await p.click('#tab-nbme'); await p.click('#tests [data-open="nbme-9"]');
for (let i = 0; i < 15; i++) { await p.type('#ed-notes', 'x'); await p.waitForTimeout(150); }
await p.keyboard.press('Escape');
await p.waitForTimeout(3000);
ok(up === 1, 'no upload while still within the pause (up=' + up + ')');
await p.waitForTimeout(9000); await idle();
ok(up === 2 && worker === 1, '15 edits batched into 1 upload, still 1 Worker call (up=' + up + ' w=' + worker + ')');
// Drive down: one failure, then backoff (no retry storm while editing)
failDrive = true; const l1 = drv;
await p.evaluate(() => window.CKCloud.syncNow().catch(() => {})); await idle();
const st = await p.evaluate(() => window.CKCloud.status());
ok(st.state === 'error' && /Trying again in 30 s/.test(st.message), 'failure backs off: ' + st.message.slice(0, 90));
await p.click('#tests [data-open="nbme-10"]'); await p.fill('#ed-score', '240'); await p.keyboard.press('Escape');
await p.waitForTimeout(12000);
ok(drv - l1 === 1, 'no retries during backoff despite edits (Drive requests since failure: ' + (drv - l1) + ')');
failDrive = false;
// expired token: exactly one Worker call to renew
await p.evaluate(() => { const k = 'thundertracker:cloud-token'; const c = JSON.parse(localStorage.getItem(k)); c.exp = Date.now() - 1000; localStorage.setItem(k, JSON.stringify(c)); });
await p.reload(); await idle();
ok(worker === 2 && up === 3, 'expired token renewed once; pending edit uploaded (w=' + worker + ' up=' + up + ')');
ok(!(await p.evaluate(() => localStorage.getItem('cloudflareWorkerSession'))), 'ThunderShadow key untouched');
ok(hist === 1, 'still just one dated copy for today after all those syncs (hist=' + hist + ')');
console.log('totals: worker', worker, 'list', list, 'get', get, 'upload', up, 'history', hist);
await b.close();
