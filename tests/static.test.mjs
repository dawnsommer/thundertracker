// No browser: checks that release bookkeeping is consistent.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };

const sw = read('sw.js'), html = read('index.html');
const V = Number(/const VERSION = (\d+);/.exec(sw)[1]);
const js = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).sort();
const all = { 'index.html': html, 'sw.js': sw, ...Object.fromEntries(js.map((f) => ['js/' + f, read('js/' + f)])) };
const versions = new Set(Object.values(all).flatMap((s) => [...s.matchAll(/\?v=(\d+)/g)].map((m) => Number(m[1]))));
ok(versions.size === 1 && versions.has(V), 'every ?v= matches sw.js VERSION ' + V + ' (found ' + [...versions].join(', ') + ')');
ok(new RegExp('export const APP_VERSION = ' + V + ';').test(all['js/catalog.js']), 'APP_VERSION matches');
const shell = JSON.parse(/const SHELL = (\[.*?\]);/.exec(sw)[1].replace(/'/g, '"'));
ok(shell.every((u) => u === './' || fs.existsSync(path.join(root, u.split('?')[0]))), 'every offline (SHELL) file exists');
ok(js.every((f) => shell.includes('js/' + f + '?v=' + V)), 'every js/ file is cached for offline use');
const appFiles = JSON.parse(/export const APP_FILES = (\[.*?\]);/.exec(all['js/catalog.js'])[1].replace(/'/g, '"'));
ok(js.every((f) => appFiles.includes('js/' + f)), 'every js/ file is in APP_FILES (Reload latest version)');
const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
ok(new Set(ids).size === ids.length, 'no duplicate ids in index.html');
const imports = Object.entries(all).filter(([f]) => f.startsWith('js/')).flatMap(([f, s]) => [...s.matchAll(/from '\.\/([\w-]+\.js)\?v=\d+'|import '\.\/([\w-]+\.js)\?v=\d+'/g)].map((m) => m[1] || m[2]));
ok(imports.every((f) => js.includes(f)), 'every module import points at an existing file');
ok(!fs.existsSync(path.join(root, 'app.js')), 'the old single app.js is gone');
