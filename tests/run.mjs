// Runs the browser tests: `npm test` (all) or `npm test -- core sync` (by name).
// Starts the servers they need, runs each *.test.mjs as its own process and prints a summary.
// Set CHROMIUM_PATH to use an installed Chromium instead of Playwright's download.
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { makeSimZip } from './fixtures/sim-backup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// Static server. `maxAge` mimics GitHub Pages' caching (max-age=600 + Last-Modified/304).
function serve(dir, { maxAge } = {}) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let f = path.join(dir, decodeURIComponent(u.pathname));
    if (!f.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404).end('not found'); return; }
    const st = fs.statSync(f), lm = st.mtime.toUTCString();
    const headers = { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Last-Modified': lm };
    if (maxAge != null) headers['Cache-Control'] = 'max-age=' + maxAge;
    const ims = req.headers['if-modified-since'];
    if (ims && new Date(ims) >= new Date(lm)) { res.writeHead(304, headers).end(); return; }
    res.writeHead(200, headers).end(fs.readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: 'http://localhost:' + server.address().port, close: () => server.close() })));
}
// A sign-in Worker that refuses without CORS headers (its reply can't be read by the page).
function refusingWorker() {
  const server = http.createServer((req, res) => res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"error":"invalid_return_url"}'));
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: 'http://127.0.0.1:' + server.address().port, close: () => server.close() })));
}

const only = process.argv.slice(2);
const files = fs.readdirSync(here).filter((f) => f.endsWith('.test.mjs') && (!only.length || only.some((o) => f.startsWith(o)))).sort();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'thunder-tests-'));
const out = path.join(tmp, 'out'); fs.mkdirSync(out);
// app-updates edits a copy of the site served like GitHub Pages
const site = path.join(tmp, 'site', 'thundertracker');
fs.mkdirSync(site, { recursive: true });
for (const f of fs.readdirSync(root)) if (!['tests', 'node_modules', '.git', '.github', 'tools'].includes(f)) fs.cpSync(path.join(root, f), path.join(site, f), { recursive: true });

const app = await serve(root), gh = await serve(path.join(tmp, 'site'), { maxAge: 600 }), worker = await refusingWorker();
const env = { ...process.env, BASE_URL: app.url + '/', GH_URL: gh.url + '/thundertracker/', SITE_DIR: site, NOCORS_URL: worker.url,
  OUT_DIR: out, SIM_ZIP: makeSimZip(path.join(tmp, 'sim-backup.zip')) };

let pass = 0, fail = 0;
const failed = [];
for (const f of files) {
  const t0 = Date.now();
  const code = await new Promise((done) => {
    const child = spawn(process.execPath, [path.join(here, f)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const line = (l) => {
      if (l.startsWith('PASS ')) pass++;
      else if (l.startsWith('FAIL ')) { fail++; failed.push(f + ': ' + l.slice(5)); console.log('  ✗ ' + l.slice(5)); }
      else if (l.trim()) console.log('    ' + l);
    };
    child.stdout.on('data', (d) => { buf += d; const parts = buf.split('\n'); buf = parts.pop(); parts.forEach(line); });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('close', (c) => { if (buf) line(buf); done(c); });
  });
  console.log((code === 0 ? '✓ ' : '✗ ') + f + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  if (code !== 0 && !failed.some((x) => x.startsWith(f))) { fail++; failed.push(f + ': exited with code ' + code); }
}
app.close(); gh.close(); worker.close();
console.log('\n' + pass + ' checks passed, ' + fail + ' failed' + (failed.length ? ':\n  ' + failed.join('\n  ') : '') + '\nScreenshots and downloads: ' + out);
process.exit(fail ? 1 : 0);
