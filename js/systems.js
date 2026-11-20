// The Systems tab: a card per system (stage, confidence, its own resources, notes pages, AMBOSS),
// a small progress summary on top, and the system editor.

import { $, avg, fmtDate, fmtPct, h, num, today, uid } from './util.js?v=30';
import { RESOURCES, SYS_ST } from './catalog.js?v=30';
import { save, snapshot, state, sysItem, toast, ui } from './store.js?v=30';
import { allSystems, band, weakPattern } from './data.js?v=30';
import { closeSheet, numField, openSheet, sheetHead } from './sheets.js?v=30';
import { render } from './shell.js?v=30';

// Status, confidence, resource ticks, notes pages and AMBOSS count as working on a system that day (shown on the calendar).
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
// the default resources (Systems → Default resources); a system can have its own pick instead
export const sysTags = () => state.prefs.sysTags;
export const sysRes = (id) => sysItem(id).res || sysTags();
// notes progress of one system: { done, total, frac } or null without a page count
export function notesOf(it) {
  if (!it.pg) return null;
  const done = Math.min(num(it.pd) || 0, it.pg);
  return { done, total: it.pg, frac: done / it.pg };
}
// everything for the summary (and the overview tile)
export function sysStats() {
  const sys = allSystems(), its = sys.map((s) => sysItem(s.id));
  const st = [0, 0, 0, 0]; its.forEach((it) => st[it.status]++);
  const nts = its.map(notesOf).filter(Boolean);
  const conf = its.map((it) => it.conf).filter((c) => c > 0);
  let resAll = 0, resDone = 0;
  sys.forEach((s) => { const it = sysItem(s.id), r = sysRes(s.id); resAll += r.length; resDone += r.filter((t) => it.tags.includes(t)).length; });
  return { n: sys.length, st, amb: its.filter((it) => it.amb).length, ready: its.filter((it) => it.status === 3 && !it.amb).length,
    pgDone: nts.reduce((a, x) => a + x.done, 0), pgAll: nts.reduce((a, x) => a + x.total, 0), nNotes: nts.length,
    conf: conf.length ? avg(conf) : null, lowConf: conf.filter((c) => c <= 2).length, resAll, resDone };
}
// every resource name in use, for the picker: the built-in list first, then your own
const allRes = () => [...new Set(RESOURCES.concat(...allSystems().map((s) => sysItem(s.id).res || []), ...allSystems().map((s) => sysItem(s.id).tags)))];

function drawResPicker() {
  const box = $('sys-res'), on = new Set(sysTags());
  $('sys-res-btn').setAttribute('aria-expanded', ui.sysRes ? 'true' : 'false');
  box.hidden = !ui.sysRes;
  if (!ui.sysRes) { box.replaceChildren(); return; }
  const own = allSystems().filter((s) => sysItem(s.id).res).length;
  box.replaceChildren(h('span', { class: 'res-h', text: 'Default resources' }),
    h('div', { class: 'tags', role: 'group', 'aria-label': 'Default resources' }, RESOURCES.map((t) => h('button', {
      class: 'tag' + (on.has(t) ? ' on' : ''), 'aria-pressed': on.has(t) ? 'true' : 'false', 'data-res': t,
      onclick: () => { state.prefs.sysTags = RESOURCES.filter((x) => (x === t ? !on.has(t) : on.has(x))); save(); render(); } }, (on.has(t) ? '✓ ' : '') + t))),
    h('span', { class: 'hint', text: own ? 'Used by every system except the ' + own + ' with their own pick (+ on a card).' : 'Used by every system. Tap + on a card to give that system its own.' }),
    h('button', { class: 'linkish', onclick: () => { ui.sysRes = false; render(); } }, 'Done'));
}
$('sys-res-btn').addEventListener('click', () => { ui.sysRes = !ui.sysRes; render(); });

export function sortedSystems() {
  const list = allSystems().slice(), m = state.prefs.sysSort;
  const uw = (s) => { const v = num(sysItem(s.id).uw); return v == null ? 999 : v; };
  const nf = (s) => { const n = notesOf(sysItem(s.id)); return n ? n.frac : 2; };
  if (m === 'conf') list.sort((a, b) => (sysItem(a.id).conf || 6) - (sysItem(b.id).conf || 6));
  if (m === 'status') list.sort((a, b) => sysItem(a.id).status - sysItem(b.id).status);
  if (m === 'uw') list.sort((a, b) => uw(a) - uw(b));
  if (m === 'notes') list.sort((a, b) => nf(a) - nf(b));
  // not in AMBOSS yet first, the furthest along (ready to add) at the top
  if (m === 'amb') list.sort((a, b) => (!!sysItem(a.id).amb - !!sysItem(b.id).amb) || sysItem(b.id).status - sysItem(a.id).status);
  if (m === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

const meter = (frac, cls) => h('span', { class: 'mini-bar' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.round(Math.min(1, frac) * 100) + '%' }));

// Small progress analysis above the cards: stages, AMBOSS, notes pages, confidence.
function renderSummary() {
  const s = sysStats(), n = s.n || 1;
  const stat = (k, big, small, vis, note) => h('div', { class: 'ss' },
    h('span', { class: 'eyebrow', text: k }), h('div', { class: 'ss-v' }, h('b', { text: big }), small ? h('small', { text: small }) : null), vis, note ? h('span', { class: 'ss-n', text: note }) : null);
  $('sys-sum').replaceChildren(
    stat('Stage', String(s.st[3]), 'of ' + s.n + ' revised',
      h('span', { class: 'stage-bar', role: 'img', 'aria-label': SYS_ST.map((l, i) => s.st[i] + ' ' + l.toLowerCase()).join(', ') },
        [1, 2, 3].map((i) => h('i', { class: 'v' + i, style: 'width:' + (s.st[i] / n * 100) + '%' }))),
      s.st[1] + ' learning · ' + s.st[2] + ' qbank done'),
    stat('AMBOSS', String(s.amb), 'of ' + s.n + ' added', meter(s.amb / n, 'amb'),
      s.ready ? s.ready + ' revised, not added yet' : s.amb === s.n ? 'All added' : 'Add each one once revised'),
    stat('Notes', s.pgAll ? Math.round(s.pgDone / s.pgAll * 100) + '%' : '—', s.pgAll ? s.pgDone + ' of ' + s.pgAll + ' pages' : '',
      meter(s.pgAll ? s.pgDone / s.pgAll : 0, 'nt'), s.nNotes ? s.nNotes + ' system' + (s.nNotes > 1 ? 's' : '') + ' with pages set' : 'Set pages on a system'),
    stat('Confidence', s.conf != null ? s.conf.toFixed(1) : '—', s.conf != null ? 'of 5 avg' : '',
      h('span', { class: 'ss-dots', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map((i) => h('i', { class: s.conf != null && s.conf >= i - 0.5 ? 'on' : '' }))),
      s.lowConf ? s.lowConf + ' at 1–2' : s.resAll ? s.resDone + ' of ' + s.resAll + ' resources done' : ''));
}

function sysCard(sy, weakIn) {
  const it = sysItem(sy.id), uw = num(it.uw), nt = notesOf(it), weak = weakIn.get(sy.id);
  const pdIn = nt ? h('input', { type: 'number', class: 'pg-in', min: '0', max: String(it.pg), inputmode: 'numeric', value: String(nt.done), 'aria-label': 'Pages done in ' + sy.name + ' notes' }) : null;
  if (pdIn) pdIn.addEventListener('change', () => { const v = num(pdIn.value); if (v != null && v >= 0) setSys(sy.id, { pd: Math.min(Math.round(v), it.pg) }); });
  return h('div', { class: 'sys sys-s' + it.status + (it.amb ? ' in-amb' : '') },
    h('div', { class: 'sys-top' },
      h('div', { class: 'sys-id' },
        h('button', { class: 'nm', 'data-open': sy.id, onclick: () => openSystem(sy) }, sy.name, it.notes ? h('small', { text: it.notes }) : null),
        uw != null || weak ? h('span', { class: 'sys-meta' },
          uw != null ? h('span', { class: 'tag uw ' + band('cms', uw), title: 'UWorld % correct', text: 'UW ' + fmtPct(uw) }) : null,
          weak ? h('span', { class: 'tag weak-tag' + (weak.length >= 2 ? ' rec' : ''), title: 'Marked weak on ' + weak.map((f) => f.full).join(', '), text: 'Weak ' + weak.length + '×' }) : null) : null),
      h('span', { class: 'conf', role: 'group', 'aria-label': 'Confidence for ' + sy.name },
        [1, 2, 3, 4, 5].map((n) => h('button', { class: it.conf >= n ? 'on' : '', 'aria-label': 'Confidence ' + n, 'aria-pressed': it.conf === n ? 'true' : 'false', title: 'Confidence ' + n + '/5', onclick: () => setSys(sy.id, { conf: it.conf === n ? 0 : n }) })))),
    h('span', { class: 'seg stage', role: 'group', 'aria-label': 'Status for ' + sy.name },
      SYS_ST.map((l, i) => h('button', { class: 'v' + i, 'aria-pressed': it.status === i ? 'true' : 'false', onclick: () => setSys(sy.id, { status: i }) }, l))),
    h('div', { class: 'tags sys-res' }, sysRes(sy.id).map((t) => tagBtn(sy.id, t)),
      h('button', { class: 'tag add', title: 'Choose resources for ' + sy.name, 'aria-label': 'Choose resources for ' + sy.name, onclick: () => openSystem(sy, '#ed-res-new') }, '+')),
    h('div', { class: 'sys-foot' },
      nt ? h('div', { class: 'sys-nt' }, h('span', { class: 'lab', text: 'Notes' }), meter(nt.frac, 'nt'), pdIn, h('span', { class: 'of', text: '/ ' + nt.total + ' p' }))
        : h('button', { class: 'linkish sys-nt-add', onclick: () => openSystem(sy, '#ed-pg') }, '+ Notes pages'),
      h('button', { class: 'amb-tog' + (it.amb ? ' on' : it.status === 3 ? ' ready' : ''), 'aria-pressed': it.amb ? 'true' : 'false',
          title: it.amb ? 'Added to AMBOSS on ' + fmtDate(it.amb) + ' (tap to undo)' : 'Mark as added to AMBOSS',
          onclick: () => setSys(sy.id, { amb: it.amb ? '' : today() }) }, it.amb ? '✓ AMBOSS' : it.status === 3 ? 'Add to AMBOSS' : 'AMBOSS')));
}

export function renderSystems() {
  $('sys-sort').value = state.prefs.sysSort;
  drawResPicker();
  renderSummary();
  const inp = h('input', { type: 'text', placeholder: 'Add a system or topic (e.g. Vascular surgery)', id: 'add-sys', maxlength: '60', 'aria-label': 'New system name' });
  const add = () => {
    const name = inp.value.trim(); if (!name) return;
    state.extraSystems.push({ id: 'sys-x' + uid(), name });
    save(); render();
    setTimeout(() => $('add-sys')?.focus(), 0);
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const weakIn = new Map(weakPattern().rows.map((r) => [r.sy.id, r.hits]));
  $('sys-rows').replaceChildren(...sortedSystems().map((sy) => sysCard(sy, weakIn)));
  $('sys-add').replaceChildren(inp, h('button', { class: 'btn', onclick: add }, 'Add'));
}
$('sys-sort').addEventListener('change', (e) => { state.prefs.sysSort = e.target.value; save(); render(); });

export function openSystem(sy, focus) {
  const cur = () => sysItem(sy.id);
  const patch = (p) => { state.systems[sy.id] = Object.assign({}, cur(), p); save(); render(); };
  const notesIn = h('textarea', { id: 'ed-sys-notes', placeholder: 'High-yield gaps, resources to revisit…' });
  notesIn.value = cur().notes;
  notesIn.addEventListener('input', () => patch({ notes: notesIn.value }));
  const uw = numField('ed-uw', 'UWorld % correct', { inputmode: 'decimal', step: 'any', placeholder: 'e.g. 68', value: cur().uw }, 0, 100, false, (raw) => patch({ uw: raw }));
  const pg = numField('ed-pg', 'Total pages', { inputmode: 'numeric', placeholder: 'e.g. 120', value: cur().pg }, 1, 9999, true, (raw) => patch({ pg: raw === '' ? '' : Number(raw), day: today() }));
  const pd = numField('ed-pd', 'Pages done', { inputmode: 'numeric', placeholder: '0', value: cur().pd }, 0, 9999, true, (raw) => patch({ pd: raw === '' ? '' : Number(raw), day: today() }));
  const ambOn = h('input', { type: 'checkbox', id: 'ed-amb' });
  const ambDate = h('input', { type: 'date', id: 'ed-amb-date', class: 'sel', 'aria-label': 'Date added to AMBOSS' });
  ambOn.addEventListener('change', () => patch({ amb: ambOn.checked ? today() : '', day: today() }));
  ambDate.addEventListener('change', () => { if (ambDate.value) patch({ amb: ambDate.value }); });

  // which resources this system tracks (its own pick, or the default) and which are done
  const pickBox = h('div', { class: 'tags', role: 'group', 'aria-label': 'Resources for this system' });
  const doneBox = h('div', { class: 'tags', role: 'group', 'aria-label': 'Resources done' });
  const resNew = h('input', { type: 'text', id: 'ed-res-new', maxlength: '30', placeholder: 'Add your own (e.g. Boards & Beyond)', 'aria-label': 'Add a resource for this system' });
  const setRes = (list) => patch({ res: list });
  const addOwn = () => { const t = resNew.value.trim().slice(0, 30); if (!t) return; const r = sysRes(sy.id); if (!r.includes(t)) setRes(r.concat(t)); resNew.value = ''; drawRes(); };
  resNew.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addOwn(); } });
  const resetBtn = h('button', { class: 'linkish', onclick: () => { setRes(null); drawRes(); } }, 'Use the default resources');
  const drawRes = () => {
    const on = new Set(sysRes(sy.id));
    pickBox.replaceChildren(...[...new Set(allRes().concat(...on))].map((t) => h('button', { class: 'tag pick' + (on.has(t) ? ' on' : ''), 'aria-pressed': on.has(t) ? 'true' : 'false', 'data-res': t,
      onclick: () => { const r = sysRes(sy.id); setRes(on.has(t) ? r.filter((x) => x !== t) : r.concat(t)); drawRes(); } }, (on.has(t) ? '✓ ' : '') + t)));
    // your resources, plus any other you'd ticked before (so it can still be unticked)
    doneBox.replaceChildren(...[...new Set(sysRes(sy.id).concat(cur().tags))].map((t) => tagBtn(sy.id, t, drawRes)));
    resetBtn.hidden = !cur().res;
  };
  const drawAmb = () => { ambOn.checked = !!cur().amb; ambDate.value = cur().amb; ambDate.hidden = !cur().amb; };
  drawRes(); drawAmb();
  const isExtra = state.extraSystems.some((x) => x.id === sy.id);
  const rm = isExtra ? h('button', { class: 'btn ghost danger', onclick: () => {
    const undo = snapshot();
    state.extraSystems = state.extraSystems.filter((x) => x.id !== sy.id); delete state.systems[sy.id]; save(); closeSheet();
    toast(sy.name + ' removed', undo);
  } }, 'Remove system') : null;
  openSheet(sy.id, sy.name, [
    sheetHead('System · ' + SYS_ST[cur().status] + (cur().conf ? ' · confidence ' + cur().conf + '/5' : ''), sy.name),
    h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Resources done' }), doneBox),
    h('div', { class: 'field res-own' }, h('span', { class: 'lab', text: 'Resources for this system' }), pickBox,
      h('div', { class: 'add-sys' }, resNew, h('button', { class: 'btn', onclick: addOwn }, 'Add')), resetBtn),
    h('div', { class: 'two' }, pd.field, pg.field),
    h('div', { class: 'field' }, h('span', { class: 'lab', text: 'AMBOSS' }),
      h('div', { class: 'amb-row' }, h('label', { class: 'switch' }, ambOn, 'Added to AMBOSS'), ambDate)),
    h('div', { class: 'two' }, uw.field, h('div')),
    h('div', { class: 'field' }, h('label', { for: 'ed-sys-notes', text: 'Notes' }), notesIn),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'Done'), rm),
  ], () => {
    if (document.activeElement !== notesIn) notesIn.value = cur().notes;
    if (document.activeElement !== uw.inp) uw.inp.value = cur().uw;
    if (document.activeElement !== pg.inp) pg.inp.value = cur().pg;
    if (document.activeElement !== pd.inp) pd.inp.value = cur().pd;
    drawRes(); drawAmb();
  }, focus || '#ed-sys-notes');
}
