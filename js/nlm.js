// The NotebookLM shelf: Passive → NotebookLM (ThunderNBME's NBME/CMS volumes) and AMBOSS → Audio (MogiAMBOSS's).
// The volume list comes from the user's local `tracker_feed.json` (see nlm-data.js), linked once with the File
// System Access API (its handle kept in IndexedDB `thundertracker-nlm`, this device only) and re-read on Refresh
// or quietly once a minute while the shelf is on screen and Chrome still allows it; elsewhere, Import file.
// The feed is stored in the synced pref `nlm`; listening is 5 boxes per volume in `state.passive` (key volKey).

import { h } from './util.js?v=33';
import { save, state, toast, ui } from './store.js?v=33';
import { render } from './shell.js?v=33';
import { boxes, pvItem, tapPass } from './passive.js?v=33';
import { NL_ST, filterRows, heard, normFeed, shelfRows, shelfStats, upNext, volKey } from './nlm-data.js?v=33';

const nl = { checked: 0, linked: null, busy: false };
const passes = (k) => pvItem(k).n;
const canLink = () => typeof window.showOpenFilePicker === 'function' && typeof indexedDB !== 'undefined';

function idb(mode, fn) {
  return new Promise((res, rej) => {
    const o = indexedDB.open('thundertracker-nlm', 1);
    o.onupgradeneeded = () => o.result.createObjectStore('h');
    o.onerror = () => rej(o.error);
    o.onsuccess = () => {
      const tx = o.result.transaction('h', mode), r = fn(tx.objectStore('h'));
      tx.oncomplete = () => { o.result.close(); res(r && r.result); };
      tx.onerror = () => rej(tx.error);
    };
  });
}
const getHandle = () => idb('readonly', (s) => s.get('feed')).catch(() => null);
const putHandle = (x) => idb('readwrite', (s) => s.put(x, 'feed'));

export function applyFeed(raw, quiet) {
  const f = normFeed(raw);
  if (!f) { if (!quiet) toast('That file isn’t a ThunderNBME NotebookLM feed (tracker_feed.json).'); return false; }
  const cur = state.prefs.nlm;
  if (!cur || JSON.stringify(cur) !== JSON.stringify(f)) { state.prefs.nlm = f; save(); render(); if (!quiet) toast('NotebookLM volumes updated'); }
  else if (!quiet) toast('Already up to date');
  return true;
}
async function readHandle(fh, ask) {
  let p = await fh.queryPermission({ mode: 'read' });
  if (p !== 'granted' && ask) p = await fh.requestPermission({ mode: 'read' });
  if (p !== 'granted') return;
  applyFeed(JSON.parse(await (await fh.getFile()).text()), !ask);
}
async function act(fn) {
  nl.busy = true; render();
  try { await fn(); } catch (e) { if (e && e.name !== 'AbortError') toast('Couldn’t read the feed file: ' + (e.message || e)); }
  nl.busy = false; render();
}
const link = () => act(async () => {
  const [fh] = await window.showOpenFilePicker({ types: [{ description: 'NotebookLM feed', accept: { 'application/json': ['.json'] } }] });
  await putHandle(fh); nl.linked = true; await readHandle(fh, true);
});
const refresh = () => act(async () => { const fh = await getHandle(); if (fh) await readHandle(fh, true); else await link(); });
function importFile() {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => { const f = inp.files[0]; if (f) try { applyFeed(JSON.parse(await f.text())); } catch { toast('That file isn’t JSON.'); } };
  inp.click();
}
// quiet re-read (no prompt) at most once a minute while the shelf shows
function autoCheck() {
  if (!canLink() || Date.now() - nl.checked < 60000) return;
  nl.checked = Date.now();
  getHandle().then((fh) => { nl.linked = !!fh; if (fh) return readHandle(fh, false); }).catch(() => {});
}

const md = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fd = (s) => (s ? md.format(new Date(s + 'T12:00:00')) : '');
const chip = (v, k) => h('span', { class: 'nl-chip st-' + (heard(v, passes(k)) ? 'L' : v.st), title: 'Vol ' + v.n + ' · ' + NL_ST[heard(v, passes(k)) ? 'L' : v.st] }, 'V' + v.n);
const seg = (label, items, cur, set, id) => h('div', { class: 'seg mode', role: 'group', 'aria-label': label, id }, items.map(([k, l]) =>
  h('button', { 'aria-pressed': cur === k ? 'true' : 'false', 'data-k': k, onclick: () => { set(k); render(); } }, l)));

function feedBar(part, src) {
  const f = state.prefs.nlm, when = f && f.at ? new Date(f.at) : null;
  const label = (part && part.label) || (src === 'amboss' ? 'MogiAMBOSS' : 'ThunderNBME');
  const btn = canLink()
    ? h('button', { class: 'btn ghost', id: 'nl-refresh', disabled: nl.busy ? '' : null, onclick: nl.linked === false ? link : refresh }, nl.busy ? 'Reading…' : nl.linked === false ? 'Link feed file' : 'Refresh')
    : h('button', { class: 'btn ghost', id: 'nl-import', onclick: importFile }, 'Import file');
  return h('div', { class: 'nl-feed' }, h('span', { class: 'sub', text: label + (when ? ' · updated ' + md.format(when) + ', ' + when.toTimeString().slice(0, 5) : '') }), btn);
}

function upCard(part, src) {
  const u = upNext(part, passes, src);
  if (!u) return h('div', { class: 'nl-up done' }, h('span', { class: 'eyebrow', text: 'Up next' }), h('p', { text: 'Every volume heard.' }));
  const k = volKey(src, u.vol.id);
  return h('div', { class: 'nl-up' }, h('span', { class: 'eyebrow', text: 'Up next' }),
    h('div', { class: 'nl-up-r' },
      h('div', null, h('p', { text: u.row.name + ' · Vol ' + u.vol.n }), h('small', { text: u.vol.q + ' questions · ' + (u.needsAudio ? 'make the audio in NotebookLM' : 'audio ready') })),
      h('button', { class: 'btn', id: 'nl-heard', onclick: () => tapPass(k, 0) }, 'Heard')));
}

function volLine(v, src) {
  const k = volKey(src, v.id), dates = v.d0 ? fd(v.d0) + (v.d1 && v.d1 !== v.d0 ? ' – ' + fd(v.d1) : '') : '';
  return h('div', { class: 'nl-vol', 'data-vol': v.id }, chip(v, k),
    h('span', { class: 'nl-vt' }, h('span', { text: v.q + ' questions' + (dates ? ' · ' + dates : '') }),
      h('small', { text: NL_ST[heard(v, passes(k)) ? 'L' : v.st] })),
    boxes(k, v.title));
}

function shelfRow(r, src, opened) {
  const key = src + ':' + r.id, open = opened.has(key);
  const q = r.queue && r.thr ? h('span', { class: 'nl-q', title: r.queue + ' questions waiting; a new volume at ' + r.thr },
    h('small', { text: '+' + r.queue + ' / ' + r.thr + ' next' }), h('span', { class: 'nl-qbar' }, h('i', { style: 'width:' + Math.min(100, 100 * r.queue / r.thr) + '%' }))) : h('span');
  return h('div', { class: 'nl-row' + (open ? ' open' : ''), 'data-g': r.id },
    h('button', { class: 'nl-rh', 'aria-expanded': open ? 'true' : 'false', onclick: () => { open ? opened.delete(key) : opened.add(key); render(); } },
      h('span', { class: 'nl-nm', text: r.name }), h('span', { class: 'nl-chips' }, r.vols.map((v) => chip(v, volKey(src, v.id)))), q),
    open ? h('div', { class: 'nl-vols' }, r.vols.length ? r.vols.map((v) => volLine(v, src)) : h('p', { class: 'sub', text: 'No volume yet; it’s made when the queue fills.' })) : null);
}

export function renderShelf(src) {
  autoCheck();
  const f = state.prefs.nlm, part = f ? f[src] : null;
  if (!part) {
    return h('section', { class: 'card nl-empty' },
      h('h3', { text: f ? 'No ' + (src === 'amboss' ? 'MogiAMBOSS' : 'ThunderNBME') + ' volumes in the feed yet' : 'Link your NotebookLM feed' }),
      h('p', { class: 'sub', text: 'ThunderNBME writes output/_notebooklm/tracker_feed.json after every batch (with the MogiAMBOSS volumes in it too). Link it once; Refresh reads it again. It stays out of the public repo and syncs with your Drive.' }),
      feedBar(part, src));
  }
  const grp = src === 'amboss' ? 'system' : (ui.nlGrp || 'system'), fl = (ui.nlF || {})[src] || 'all';
  const opened = ui.nlOpen = ui.nlOpen || new Set();
  const st = shelfStats(part, passes, src);
  const rows = filterRows(shelfRows(part, grp), fl, passes, src);
  const tile = (l, v, s) => h('div', { class: 'nl-tile' }, h('span', { class: 'eyebrow', text: l }), h('b', { class: 'num', text: v }), s ? h('small', { text: s }) : null);
  return h('section', { class: 'card nl-shelf', 'data-src': src },
    h('div', { class: 'nl-top' }, upCard(part, src),
      tile('Volumes', st.total, st.q + ' questions'), tile('Audio ready', st.ready), tile('Listened', st.heard)),
    h('div', { class: 'nl-ctl' },
      src === 'amboss' ? h('span') : seg('Group', [['system', 'Systems'], ['repeat', 'Repeat packs'], ['form', 'Form debriefs']], grp, (k) => { ui.nlGrp = k; }, 'nl-grp'),
      seg('Show', [['all', 'All'], ['todo', 'To hear'], ['ready', 'Audio ready']], fl, (k) => { ui.nlF = Object.assign({}, ui.nlF, { [src]: k }); }, 'nl-flt')),
    h('div', { class: 'nl-list' }, rows.length ? rows.map((r) => shelfRow(r, src, opened)) : h('p', { class: 'sub nl-none', text: 'Nothing here with this filter.' })),
    h('div', { class: 'nl-foot' },
      h('span', { class: 'nl-legend' }, Object.entries(NL_ST).map(([k, l]) => h('span', null, h('i', { class: 'nl-chip st-' + k }), l))),
      feedBar(part, src)));
}
