// The Systems tab and the system editor.

import { $, fmtPct, h, num, today, uid } from './util.js?v=23';
import { RESOURCES, SYS_ST } from './catalog.js?v=23';
import { save, snapshot, state, sysItem, toast, ui } from './store.js?v=23';
import { allSystems, band, weakPattern } from './data.js?v=23';
import { closeSheet, numField, openSheet, sheetHead } from './sheets.js?v=23';
import { render } from './shell.js?v=23';

// Status, confidence and resource ticks count as working on a system that day (shown on the calendar).
export function setSys(id, patch) {
  state.systems[id] = Object.assign({}, sysItem(id), patch, { day: today() });
  save(); render();
}
export function tagBtn(id, t, after) {
  const on = sysItem(id).tags.includes(t);
  return h('button', { class: 'tag' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', title: on ? t + ' done' : 'Mark ' + t + ' done',
    onclick: () => {
      const cur = sysItem(id).tags;
      setSys(id, { tags: on ? cur.filter((x) => x !== t) : cur.concat(t) });
      if (after) after();
    } }, (on ? '✓ ' : '') + t);
}
// the resources you chose to track (Systems → Resources); ticks on others stay saved
export const sysTags = () => state.prefs.sysTags;
function drawResPicker() {
  const box = $('sys-res'), on = new Set(sysTags());
  $('sys-res-btn').setAttribute('aria-expanded', ui.sysRes ? 'true' : 'false');
  box.hidden = !ui.sysRes;
  if (!ui.sysRes) { box.replaceChildren(); return; }
  box.replaceChildren(h('span', { class: 'res-h', text: 'Show on each system' }),
    h('div', { class: 'tags', role: 'group', 'aria-label': 'Resources to track' }, RESOURCES.map((t) => h('button', {
      class: 'tag' + (on.has(t) ? ' on' : ''), 'aria-pressed': on.has(t) ? 'true' : 'false', 'data-res': t,
      onclick: () => { state.prefs.sysTags = RESOURCES.filter((x) => (x === t ? !on.has(t) : on.has(x))); save(); render(); } }, (on.has(t) ? '✓ ' : '') + t))),
    h('button', { class: 'linkish', onclick: () => { ui.sysRes = false; render(); } }, 'Done'));
}
$('sys-res-btn').addEventListener('click', () => { ui.sysRes = !ui.sysRes; render(); });
export function sortedSystems() {
  const list = allSystems().slice(), m = state.prefs.sysSort;
  const uw = (s) => { const v = num(sysItem(s.id).uw); return v == null ? 999 : v; };
  if (m === 'conf') list.sort((a, b) => (sysItem(a.id).conf || 6) - (sysItem(b.id).conf || 6));
  if (m === 'status') list.sort((a, b) => sysItem(a.id).status - sysItem(b.id).status);
  if (m === 'uw') list.sort((a, b) => uw(a) - uw(b));
  if (m === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

export function renderSystems() {
  $('sys-sort').value = state.prefs.sysSort;
  drawResPicker();
  const inp = h('input', { type: 'text', placeholder: 'Add a system or topic (e.g. Vascular surgery)', id: 'add-sys', maxlength: '60', 'aria-label': 'New system name' });
  const add = () => {
    const name = inp.value.trim(); if (!name) return;
    state.extraSystems.push({ id: 'sys-x' + uid(), name });
    save(); render();
    setTimeout(() => $('add-sys')?.focus(), 0);
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const weakIn = new Map(weakPattern().rows.map((r) => [r.sy.id, r.hits]));
  $('sys-rows').replaceChildren(...sortedSystems().map((sy) => {
    const it = sysItem(sy.id), uw = num(it.uw);
    return h('div', { class: 'sys' },
      h('div', { class: 'sys-main' },
        h('button', { class: 'nm', 'data-open': sy.id, onclick: () => openSystem(sy) }, sy.name, it.notes ? h('small', { text: it.notes }) : null),
        h('div', { class: 'tags' }, sysTags().map((t) => tagBtn(sy.id, t)),
          uw != null ? h('span', { class: 'tag uw ' + band('cms', uw), title: 'UWorld % correct', text: 'UW ' + fmtPct(uw) }) : null,
          weakIn.get(sy.id) ? h('span', { class: 'tag weak-tag' + (weakIn.get(sy.id).length >= 2 ? ' rec' : ''), title: 'Marked weak on ' + weakIn.get(sy.id).map((f) => f.full).join(', '),
            text: 'Weak ' + weakIn.get(sy.id).length + '×' }) : null)),
      h('span', { class: 'conf', role: 'group', 'aria-label': 'Confidence for ' + sy.name },
        [1, 2, 3, 4, 5].map((n) => h('button', { class: it.conf >= n ? 'on' : '', 'aria-label': 'Confidence ' + n, 'aria-pressed': it.conf === n ? 'true' : 'false', title: 'Confidence ' + n + '/5', onclick: () => setSys(sy.id, { conf: it.conf === n ? 0 : n }) }))),
      h('span', { class: 'seg', role: 'group', 'aria-label': 'Status for ' + sy.name },
        SYS_ST.map((l, i) => h('button', { class: 'v' + i, 'aria-pressed': it.status === i ? 'true' : 'false', onclick: () => setSys(sy.id, { status: i }) }, l))));
  }), h('div', { class: 'add-sys' }, inp, h('button', { class: 'btn', onclick: add }, 'Add')));
}
$('sys-sort').addEventListener('change', (e) => { state.prefs.sysSort = e.target.value; save(); render(); });

export function openSystem(sy) {
  const cur = () => sysItem(sy.id);
  const patch = (p) => { state.systems[sy.id] = Object.assign({}, cur(), p); save(); render(); };
  const notesIn = h('textarea', { id: 'ed-sys-notes', placeholder: 'High-yield gaps, resources to revisit…' });
  notesIn.value = cur().notes;
  notesIn.addEventListener('input', () => patch({ notes: notesIn.value }));
  const uw = numField('ed-uw', 'UWorld % correct', { inputmode: 'decimal', step: 'any', placeholder: 'e.g. 68', value: cur().uw }, 0, 100, false, (raw) => patch({ uw: raw }));
  const tagBox = h('div', { class: 'tags', role: 'group', 'aria-label': 'Resources done' });
  // your resources, plus any other you'd ticked before (so it can still be unticked)
  const drawTags = () => tagBox.replaceChildren(...[...new Set(sysTags().concat(cur().tags))].map((t) => tagBtn(sy.id, t, drawTags)));
  drawTags();
  const isExtra = state.extraSystems.some((x) => x.id === sy.id);
  const rm = isExtra ? h('button', { class: 'btn ghost danger', onclick: () => {
    const undo = snapshot();
    state.extraSystems = state.extraSystems.filter((x) => x.id !== sy.id); delete state.systems[sy.id]; save(); closeSheet();
    toast(sy.name + ' removed', undo);
  } }, 'Remove system') : null;
  openSheet(sy.id, sy.name, [
    sheetHead('System · ' + SYS_ST[cur().status] + (cur().conf ? ' · confidence ' + cur().conf + '/5' : ''), sy.name),
    h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Resources done' }), tagBox),
    h('div', { class: 'two' }, uw.field, h('div')),
    h('div', { class: 'field' }, h('label', { for: 'ed-sys-notes', text: 'Notes' }), notesIn),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'Done'), rm),
  ], () => {
    if (document.activeElement !== notesIn) notesIn.value = cur().notes;
    if (document.activeElement !== uw.inp) uw.inp.value = cur().uw;
    drawTags();
  }, '#ed-sys-notes');
}
