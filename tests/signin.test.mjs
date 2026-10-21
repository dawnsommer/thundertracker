import { chromium } from 'playwright';
const BASE = process.env.BASE_URL;
const NOCORS = process.env.NOCORS_URL; // a refusing Worker without CORS headers // the app, served by tests/run.mjs
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const W = 'https://study-tools-auth-worker.summerofdawn20.workers.dev';
async function run(mode) {
  const ctx = await b.newContext();
  // pretend this local copy is the published site
  await ctx.route('**/config.js*', async (r) => { const res = await r.fetch(); let t = (await res.text()).replace('https://dawnsommer.github.io/thundertracker/', BASE + '');
    if (mode === 'refuse-plain') t = t.replace('https://study-tools-auth-worker.summerofdawn20.workers.dev', NOCORS);
    r.fulfill({ response: res, body: t }); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // not needed, and slow where blocked
  let hits = 0;
  await ctx.route(W + '/**', (r) => {
    hits++;
    if (mode === 'refuse-cors') return r.fulfill({ status: 400, json: { error: 'invalid_return_url' }, headers: { 'access-control-allow-origin': '*' } });
    if (mode === 'refuse-plain') return r.fulfill({ status: 400, body: '{"error":"invalid_return_url"}', contentType: 'application/json' });
    return r.fulfill({ status: 302, headers: { location: BASE + 'google-consent-stand-in?x=1', 'access-control-allow-origin': '*' } });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '#settings'); await p.waitForTimeout(300);
  await p.click('#st-gconnect');
  await p.waitForTimeout(800);
  const toastNow = mode === 'refuse-cors' ? await p.textContent('#toasts') : ''; // other modes have left the app
  await p.waitForTimeout(2500);
  const url = p.url();
  if (mode === 'refuse-cors') {
    const msg = await p.textContent('#st-google');
    ok(url.startsWith(BASE + '') && /isn’t set up for Thunder tracker yet/.test(msg) && msg.includes('invalid_return_url') && msg.includes('ThunderShadow'), 'refusal explained in Settings, stays in app: ' + msg.slice(0, 110));
    ok(toastNow.includes('details in Settings'), 'short toast');
    ok(hits === 1, 'only the check request was sent');
  } else if (mode === 'refuse-plain') {
    ok(url.startsWith(NOCORS + '/oauth/start'), 'unreadable refusal: carries on to the Worker as before (' + url.slice(0, 60) + ')');
  } else {
    ok(url.startsWith(BASE + 'google-consent-stand-in'), 'registered app: goes on to Google consent (' + url.slice(0, 60) + ')');
  }
  ok(errs.length === 0, mode + ': no page errors ' + JSON.stringify(errs));
  await ctx.close();
}
for (const m of ['refuse-cors', 'refuse-plain', 'ok']) await run(m);
await b.close();
