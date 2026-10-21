import { chromium } from 'playwright';
const BASE = process.env.BASE_URL; // the app, served by tests/run.mjs
import crypto from 'crypto';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const W = 'https://study-tools-auth-worker.summerofdawn20.workers.dev';
// ---- mock Worker + Drive (shared between both "devices")
const sessions = new Set(['sess-A', 'sess-B', 'shadow-sess']);
const drive = new Map(); let mtime = 1000, fileSeq = 0; const calls = [];
const put = (id, name, content, appProperties) => { mtime++; drive.set(id, { id, name, content, appProperties, modifiedTime: new Date(1.8e12 + mtime * 1000).toISOString(), md5Checksum: crypto.createHash('md5').update(content).digest('hex') }); return drive.get(id); };
put('ts1', 'thundershadow-manifest.json', '{"app":"ThunderShadow"}', { appId: 'thundershadow', kind: 'manifest' });
const meta = (f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, md5Checksum: f.md5Checksum, appProperties: f.appProperties });
async function wire(ctx, tag) {
  await ctx.route(W + '/**', async (route) => {
    const r = route.request(), u = new URL(r.url()); calls.push(tag + ' worker ' + u.pathname);
    const s = (r.headers()['authorization'] || '').replace('Bearer ', '');
    if (u.pathname === '/token') return sessions.has(s) ? route.fulfill({ json: { access_token: 'tok-' + s, expires_in: 3600, email: 'student@example.com' } }) : route.fulfill({ status: 401, json: { error: { message: 'bad session' } } });
    if (u.pathname === '/disconnect') { sessions.delete(s); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ status: 404, body: '' });
  });
  await ctx.route('https://www.googleapis.com/**', async (route) => {
    const r = route.request(), u = new URL(r.url()), m = r.method();
    { const a = (r.headers()['authorization'] || ''); if (!a.startsWith('Bearer tok-') || !sessions.has(a.slice(11))) return route.fulfill({ status: 401, json: {} }); }
    if (m === 'GET' && u.pathname === '/drive/v3/files') {
      calls.push(tag + ' list');
      const q = u.searchParams.get('q');
      const eq = [...q.matchAll(/name = '([^']+)'/g)].map((x) => x[1]), pre = [...q.matchAll(/name contains '([^']+)'/g)].map((x) => x[1]);
      ok(u.searchParams.get('spaces') === 'appDataFolder', 'list scoped to appDataFolder');
      return route.fulfill({ json: { files: [...drive.values()].filter((f) => eq.includes(f.name) || pre.some((x) => f.name.startsWith(x))).map(meta) } });
    }
    let mm;
    if (m === 'GET' && (mm = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname))) { calls.push(tag + ' get ' + mm[1]); return route.fulfill({ body: drive.get(mm[1]).content, contentType: 'application/json' }); }
    if (m === 'POST' && u.pathname === '/upload/drive/v3/files') {
      const body = r.postData(); const parts = body.split(/--thundertracker-[^\r\n-]+/).map((x) => x.split('\r\n\r\n')[1]).filter(Boolean).map((x) => x.replace(/\r\n$/, ''));
      const md = JSON.parse(parts[0]); const id = 'f' + (++fileSeq);
      calls.push(tag + ' create ' + md.name);
      ok(md.parents[0] === 'appDataFolder' && md.appProperties.appId === 'thundertracker', 'created in appDataFolder with appId');
      return route.fulfill({ json: meta(put(id, md.name, parts[1], md.appProperties)) });
    }
    if (m === 'PATCH' && (mm = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname))) { calls.push(tag + ' patch ' + mm[1]); const f = drive.get(mm[1]); return route.fulfill({ json: meta(put(f.id, f.name, r.postData(), f.appProperties)) }); }
    if (m === 'DELETE' && (mm = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname))) { calls.push(tag + ' delete ' + mm[1]); drive.delete(mm[1]); return route.fulfill({ status: 204, body: '' }); }
    calls.push(tag + ' UNEXPECTED ' + m + ' ' + u.pathname);
    return route.fulfill({ status: 400, json: {} });
  });
}
const remote = () => { const f = [...drive.values()].find((x) => x.name === 'thundertracker-state.json'); return f ? JSON.parse(f.content).state : null; };
const A = await b.newContext(), B = await b.newContext();
await wire(A, 'A'); await wire(B, 'B');
const pa = await A.newPage(), pb = await B.newPage();
const errs = []; for (const p of [pa, pb]) p.on('pageerror', (e) => errs.push(e.message));
const idle = (p) => p.waitForFunction(() => !['syncing', 'connecting'].includes(window.CKCloud.status().state), null, { timeout: 15000 });
const st = (p) => p.evaluate(() => window.CKCloud.status());
const local = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('ck-tracker')));

// Device A: has local data, returns from OAuth with a session in the hash
await pa.goto(BASE + '');
await pa.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, items: { 'nbme-9': { status: 1, score: '231', date: '2026-09-01' } }, log: [{ id: 'a1', date: '2026-10-01', q: 40, pct: '60', src: 'UWorld' }], prefs: { theme: 'dark', examDate: '2026-12-01' } })));
await pa.goto('about:blank'); await pa.goto(BASE + '#cloud-auth=sess-A');
await idle(pa);
ok(!(await pa.evaluate(() => location.hash)).includes('cloud-auth'), 'session removed from URL');
ok((await st(pa)).state === 'synced', 'A synced: ' + (await st(pa)).message);
ok((await pa.textContent('#save-t')) === 'Synced with Google', 'header shows synced');
ok(remote() && remote().items['nbme-9'].score === '231', 'A data uploaded to Drive');
ok(drive.get('ts1').content === '{"app":"ThunderShadow"}' && !calls.some((c) => c.includes('ts1')), 'ThunderShadow file untouched');

// Device B: different local data, signs in -> first sync merges both
await pb.goto(BASE + '');
await pb.evaluate(() => localStorage.setItem('ck-tracker', JSON.stringify({ v: 2, items: { 'uwsa-1': { status: 1, score: '250', pct: '75' } }, log: [{ id: 'b1', date: '2026-10-02', q: 80, pct: '70', src: 'UWorld' }], prefs: { theme: 'light' } })));
await pb.goto('about:blank'); await pb.goto(BASE + '#cloud-auth=sess-B');
await idle(pb);
let lb = await local(pb);
ok(lb.items['nbme-9'] && lb.items['uwsa-1'], 'B merged A + B items');
ok(lb.log.length === 2 && lb.prefs.examDate === '2026-12-01' && lb.prefs.theme === 'light', 'B merged log + plan, kept own theme');
ok(remote().items['uwsa-1'] && remote().log.length === 2, 'merged state uploaded');

// A edits; then B edits a different thing; A foregrounds and gets B's
await pa.reload(); await idle(pa);
let la = await local(pa);
ok(la.items['uwsa-1'] && la.log.length === 2 && la.prefs.theme === 'dark', 'A pulled B data on reload, kept dark theme');
await pa.click('#tab-nbme'); await pa.click('#tests [data-open="nbme-10"]'); await pa.fill('#ed-score', '240'); await pa.keyboard.press('Escape');
await pa.waitForTimeout(400);
await pa.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pa);
ok(remote().items['nbme-10'] && remote().items['nbme-10'].score === '240', 'A edit pushed');
// delete a session on B -> tombstone
await pb.click('#tab-qbank'); await pb.click('#qb-list .lrow .xs'); await pb.waitForTimeout(400);
await pb.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pb);
lb = await local(pb);
ok(lb.items['nbme-10'] && lb.items['nbme-10'].score === '240', 'B received A edit');
ok(remote().log.length === 1, 'deletion reached Drive: ' + remote().log.length);
await pa.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pa);
la = await local(pa);
ok(la.log.length === 1, 'deletion propagated to A (no resurrection)');
// concurrent edit of the same form: newest wins
await pa.click('#tab-nbme'); await pa.click('#tests [data-open="nbme-9"]'); await pa.fill('#ed-score', '233'); await pa.keyboard.press('Escape'); await pa.waitForTimeout(400);
await pb.click('#tab-nbme'); await pb.click('#tests [data-open="nbme-9"]'); await pb.fill('#ed-score', '236'); await pb.keyboard.press('Escape'); await pb.waitForTimeout(400);
await pa.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pa);
await pb.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pb);
await pa.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pa);
ok((await local(pa)).items['nbme-9'].score === '236' && remote().items['nbme-9'].score === '236', 'newest edit wins on both');
// clean sync = one list call, no download/upload
const before = calls.length;
await pa.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pa);
ok(calls.slice(before).filter((c) => !c.includes('worker')).join() === 'A list', 'clean sync is a single list: ' + calls.slice(before).join());
// erase on A propagates; undo restores everywhere
await pa.keyboard.press(','); await pa.click('text=Erase all data'); await pa.click('text=Tap again to erase everything'); await pa.waitForTimeout(400);
await pa.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pa);
await pb.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pb);
lb = await local(pb);
ok(!Object.keys(lb.items).length && !lb.log.length, 'erase propagated to B');
await pa.click('#toasts button'); await pa.waitForTimeout(400);
await pa.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pa);
await pb.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pb);
lb = await local(pb);
ok(lb.items['nbme-9'] && lb.items['nbme-9'].score === '236', 'undo of erase propagated to B');

// offline edit then reconnect
await A.setOffline(true);
await pa.click('#tab-nbme'); await pa.click('#tests [data-open="nbme-12"]'); await pa.fill('#ed-score', '247'); await pa.keyboard.press('Escape'); await pa.waitForTimeout(400);
await pa.evaluate(() => window.CKCloud.syncNow());
ok((await st(pa)).state === 'offline', 'offline state shown');
await A.setOffline(false); await pa.evaluate(() => window.dispatchEvent(new Event('online'))); await pa.waitForTimeout(300); await idle(pa);
ok(remote().items['nbme-12'] && remote().items['nbme-12'].score === '247', 'offline edit synced after reconnect');

// version history: one dated copy a day across devices, older copies pruned to 10, restore + undo
const hist = () => [...drive.values()].filter((f) => f.name.startsWith('thundertracker-history-'));
ok(hist().length === 1 && /^thundertracker-history-\d{4}-\d{2}-\d{2}\.json$/.test(hist()[0].name), 'one dated copy for today across both devices: ' + hist().map((f) => f.name));
for (let d = 1; d <= 11; d++) {
  const day = '2020-01-' + String(d).padStart(2, '0');
  put('old' + d, 'thundertracker-history-' + day + '.json', JSON.stringify({ app: 'thundertracker', kind: 'state', state: { v: 2, items: { 'nbme-9': { status: 1, score: String(200 + d) } }, log: [], prefs: {} } }), { appId: 'thundertracker', kind: 'history' });
}
await pa.evaluate(() => localStorage.removeItem('thundertracker:cloud-last-history'));
await pa.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pa);
ok(hist().length === 10 && !drive.has('old1') && !drive.has('old2') && drive.has('old3'), 'old copies pruned to the last 10 (' + hist().length + ')');
const nDel = calls.filter((c) => c.startsWith('A delete')).length;
await pa.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pa);
ok(calls.filter((c) => c.startsWith('A delete')).length === nDel, 'pruning runs at most once a day');
await pa.keyboard.press(','); await pa.click('#st-history-btn');
await pa.waitForSelector('#st-history [data-version]');
ok((await pa.locator('#st-history [data-version]').count()) === 10, 'Settings lists 10 saved copies');
ok((await pa.locator('#st-history .set-row').last().textContent()).includes('2020'), 'oldest copy listed last');
await pa.click('#st-history [data-version="old11"]'); await pa.waitForTimeout(500);
ok((await local(pa)).items['nbme-9'].score === '211', 'restored the saved copy');
ok((await pa.textContent('#toasts')).includes('Restored your copy'), 'restore toast shown');
await pa.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pa);
ok(remote().items['nbme-9'].score === '211' && !remote().items['nbme-12'], 'restore replaced the Drive copy');
await pa.click('#toasts button'); await pa.waitForTimeout(400);
await pa.evaluate(() => window.CKCloud.syncNow({ manual: true })); await idle(pa);
ok((await local(pa)).items['nbme-9'].score === '236' && remote().items['nbme-9'].score === '236' && remote().items['nbme-12'], 'undo of restore brings everything back');

// sign out A: worker /disconnect called, local data kept
await pa.evaluate(() => window.CKCloud.disconnect());
ok(calls.includes('A worker /disconnect') && !(await st(pa)).connected && (await local(pa)).items['nbme-12'], 'sign out keeps local data');
ok(!(await pa.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('thundertracker:cloud-session')).length)), 'session key cleared');

// ThunderShadow session reuse on a fresh device C
const C = await b.newContext(); await wire(C, 'C'); const pc = await C.newPage(); pc.on('pageerror', (e) => errs.push(e.message));
await pc.goto(BASE + '');
await pc.evaluate(() => { localStorage.setItem('cloudflareWorkerSession', 'shadow-sess'); localStorage.setItem('thundershadow:theme', 'dark'); });
await pc.reload();
ok((await st(pc)).canSignIn, 'sign-in offered when ThunderShadow session exists');
await pc.keyboard.press(','); await pc.click('#st-gconnect'); await idle(pc);
const sc = await st(pc);
ok(sc.connected && sc.shared && sc.state === 'synced', 'reused ThunderShadow sign-in without redirect');
ok((await local(pc)).items['nbme-12'], 'C restored data from Drive');
ok((await pc.textContent('#st-google')).includes('ThunderShadow'), 'settings mention shared sign-in');
await pc.click('#st-google button:has-text("Sign out")');
ok(!calls.includes('C worker /disconnect') && sessions.has('shadow-sess'), 'shared session not revoked on sign out');
ok(await pc.evaluate(() => localStorage.getItem('cloudflareWorkerSession') === 'shadow-sess' && localStorage.getItem('thundershadow:theme') === 'dark'), 'ThunderShadow keys untouched');
const keys = await pa.evaluate(() => Object.keys(localStorage));
ok(keys.every((k) => k === 'ck-tracker' || k.startsWith('thundertracker:')), 'tracker only writes its own keys: ' + keys.join(','));
// expired session
await pb.evaluate(() => {}); sessions.delete('sess-B');
await pb.evaluate(() => window.CKCloud.syncNow({ manual: true }).catch(() => {})); await idle(pb);
ok((await st(pb)).state === 'expired' && !(await st(pb)).connected, 'expired session handled: ' + (await st(pb)).state);
ok(!calls.some((c) => c.includes('UNEXPECTED')), 'no unexpected Drive calls');
ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
await b.close();
