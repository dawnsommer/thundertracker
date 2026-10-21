// Bumps the app version everywhere it must match: VERSION in sw.js, APP_VERSION in js/catalog.js,
// and every `?v=` (index.html, sw.js, and the imports between js/ modules).
// Usage: node tools/release.mjs        (next version)
//        node tools/release.mjs 12     (a specific version)
// The ?v= keeps browsers from mixing old and new files after a deploy. Every import of a module
// must use the same ?v=, otherwise the browser would load it twice with separate state.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const cur = Number(/const VERSION = (\d+);/.exec(read('sw.js'))[1]);
const next = process.argv[2] ? Number(process.argv[2]) : cur + 1;
if (!(next > 0)) throw new Error('Version must be a positive number');

const files = ['index.html', 'sw.js', ...fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)];
for (const f of files) {
  let s = read(f);
  const before = s;
  s = s.replace(/\?v=\d+/g, '?v=' + next)
    .replace(/const VERSION = \d+;/, 'const VERSION = ' + next + ';')
    .replace(/export const APP_VERSION = \d+;/, 'export const APP_VERSION = ' + next + ';');
  if (s !== before) { fs.writeFileSync(path.join(root, f), s); console.log('updated', f); }
}
// keep the service worker's offline list in step with the files in js/
let sw = read('sw.js');
const js = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).sort();
sw = sw.replace(/const SHELL = \[.*?\];/, "const SHELL = ['./', 'index.html', 'styles.css?v=" + next + "', " + js.map((f) => "'js/" + f + '?v=' + next + "'").join(', ') +
  ", 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];");
fs.writeFileSync(path.join(root, 'sw.js'), sw);
let cat = read('js/catalog.js');
cat = cat.replace(/export const APP_FILES = \[.*?\];/, 'export const APP_FILES = [' + js.map((f) => "'js/" + f + "'").join(', ') + '];');
fs.writeFileSync(path.join(root, 'js/catalog.js'), cat);
console.log('version', cur, '→', next);
