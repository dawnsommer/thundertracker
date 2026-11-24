// The NotebookLM shelf: Passive → NotebookLM (ThunderNBME's NBME/CMS volumes) and AMBOSS → Audio (MogiAMBOSS's).
// The volume list is `nlm.json` on the user's public amboss-tracker page (`../amboss-tracker/nlm.json`), pushed by
// their local ThunderNBME / MogiAMBOSS at the end of every turn (only when volumes changed). Read like the AMBOSS
// page: fetch(no-cache), at most every 5 minutes while the shelf is on screen, plus Refresh; kept in memory only.
// Listening is 5 boxes per volume in `state.passive` (key volKey), synced like DIP episodes.

import { h } from './util.js?v=34';
import { state, toast, ui } from './store.js?v=34';
import { render } from './shell.js?v=34';
import { boxes, pvItem, tapPass } from './passive.js?v=34';
import { NL_ST, filterRows, heard, normFeed, shelfRows, shelfStats, upNext, volKey } from './nlm-data.js?v=34';

export const NLM_URL = () => new URL('../amboss-tracker/nlm.json', location.href).href;
const STALE = 5 * 60e3;
export const nl = { f: null, at: 0, busy: false, err: '' };
const passes = (k) => pvItem(k).n;

export async function loadNlm(force) {
  if (nl.busy || (!force && nl.at && Date.now() - nl.at < STALE)) return;
  nl.busy = true;
  if (force) render();
  try {
    const res = await fetch(NLM_URL(), { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status === 404 ? 'No NotebookLM volumes published yet.' : 'HTTP ' + res.status);
    const f = normFeed(await res.json());
    if (!f) throw new Error('The published volume list isn’t in the expected format.');
    nl.f = f; nl.err = '';
  } catch (e) {
    nl.err = (e && e.message) || 'Couldn’t load the NotebookLM volumes.';
    if (force) toast(nl.err);
  }
  nl.at = Date.now(); nl.busy = false;
  render();
}

const md = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fd = (s) => (s ? md.format(new Date(s + 'T12:00:00')) : '');
const chip = (v, k) => h('span', { class: 'nl-chip st-' + (heard(v, passes(k)) ? 'L' : v.st), title: 'Vol ' + v.n + ' · ' + NL_ST[heard(v, passes(k)) ? 'L' : v.st] }, 'V' + v.n);
const seg = (label, items, cur, set, id) => h('div', { class: 'seg mode', role: 'group', 'aria-label': label, id }, items.map(([k, l]) =>
  h('button', { 'aria-pressed': cur === k ? 'true' : 'false', 'data-k': k, onclick: () => { set(k); render(); } }, l)));

function feedBar(part, src) {
  const when = nl.f && nl.f.at ? new Date(nl.f.at) : null;
  const label = (part && part.label) || (src === 'amboss' ? 'MogiAMBOSS' : 'ThunderNBME');
  return h('div', { class: 'nl-feed' }, h('span', { class: 'sub', text: label + (when ? ' · updated ' + md.format(when) + ', ' + when.toTimeString().slice(0, 5) : '') }),
    h('button', { class: 'btn ghost', id: 'nl-refresh', disabled: nl.busy ? '' : null, onclick: () => loadNlm(true) }, nl.busy ? 'Checking…' : 'Refresh'));
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
  loadNlm();
  const f = nl.f, part = f ? f[src] : null;
  if (!part) {
    return h('section', { class: 'card nl-empty' },
      h('h3', { text: !nl.at || nl.busy ? 'Loading NotebookLM volumes…' : f ? 'No ' + (src === 'amboss' ? 'MogiAMBOSS' : 'ThunderNBME') + ' volumes yet' : 'No NotebookLM volumes yet' }),
      nl.at && !nl.busy ? h('p', { class: 'sub', text: (nl.err && !f ? nl.err + ' ' : '') + (src === 'amboss' ? 'MogiAMBOSS' : 'ThunderNBME') + ' publishes them after every turn that changes a volume.' }) : null,
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
