// The Systems tab: your plan per system. Each system has its own resources with progress; the list is grouped by
// where a system stands (in progress → revised, add to AMBOSS → not started → in AMBOSS) and each row says what's next.
// Tap a row to update its resources; Edit opens the side sheet (resources, totals, AMBOSS date, UWorld %, notes).

import { $, fmtDate, fmtPct, h, num, plural, ring, today, uid } from './util.js?v=35';
import { RESOURCES, SYS_ST } from './catalog.js?v=35';
import { UNITS } from './model.js?v=35';
import { save, snapshot, state, sysItem, toast, ui } from './store.js?v=35';
import { allSystems, band, shortSys, weakPattern } from './data.js?v=35';
import { closeSheet, openSheet, sheetHead } from './sheets.js?v=35';
import { render, showTab } from './shell.js?v=35';

// Any change counts as working on a system that day (shown on the activity calendar).
export function setSys(id, patch) {
  state.systems[id] = Object.assign({}, sysItem(id), patch, { day: today() });
  save(); render();
}

// A system's resources. Until you change them, a system shows the resources picked in the old version
// (prefs.sysTags, Sketchy · CKNotes · Inner Circle for a new user) plus anything ticked, as done / not done.
export function resList(id) {
  const it = sysItem(id);
  if (it.rs) return it.rs;
  return [...new Set(state.prefs.sysTags.concat(it.tags))].map((n) => ({ n, d: it.tags.includes(n) ? 1 : 0, tot: '', u: '' }));
}
const setRes = (id, list) => setSys(id, { rs: list.map((r) => Object.assign({}, r)) });
export const resFrac = (r) => (r.tot ? Math.min(r.d, r.tot) / r.tot : r.d ? 1 : 0);
const resDone = (r) => resFrac(r) >= 1;
const resLeft = (r) => (r.tot ? (r.tot - Math.min(r.d, r.tot)) + ' ' + (r.u || 'left') + (r.u ? ' left' : '') : 'to do');

// progress of one system: share of its resources done (each counts the same), and the next thing to do
export function sysProg(id) {
  const rs = resList(id), it = sysItem(id);
  const frac = rs.length ? rs.reduce((a, r) => a + resFrac(r), 0) / rs.length : null;
  const nextR = rs.find((r) => !resDone(r) && r.d > 0) || rs.find((r) => !resDone(r));
  let next;
  if (it.amb) next = 'In AMBOSS since ' + fmtDate(it.amb);
  else if (it.status === 3) next = 'Revised — add it to AMBOSS';
  else if (!rs.length) next = 'Add the resources you’ll use';
  else if (nextR) next = 'Next: ' + nextR.n + (nextR.tot ? ' · ' + resLeft(nextR) : '');
  else next = 'All resources done — mark it revised';
  return { rs, frac, next, done: rs.filter(resDone).length };
}
// where a system stands, for the groups
export function phaseOf(id) {
  const it = sysItem(id);
  if (it.amb) return 'amb';
  if (it.status === 3) return 'ready';
  if (it.status > 0 || resList(id).some((r) => r.d > 0)) return 'doing';
  return 'todo';
}
export const PHASES = [
  ['doing', 'In progress'], ['ready', 'Revised · add to AMBOSS'], ['todo', 'Not started'], ['amb', 'In AMBOSS'],
];
export function sysStats() {
  const sys = allSystems(), ph = { doing: 0, ready: 0, todo: 0, amb: 0 };
  let rAll = 0, rFrac = 0, rDone = 0;
  sys.forEach((s) => {
    ph[phaseOf(s.id)]++;
    resList(s.id).forEach((r) => { rAll++; rFrac += resFrac(r); if (resDone(r)) rDone++; });
  });
  return { n: sys.length, ph, amb: ph.amb, ready: ph.ready, revised: ph.ready + ph.amb, frac: rAll ? rFrac / rAll : null, rAll, rDone };
}

// the journey bar: in AMBOSS · revised · in progress · not started
export function journey(st) {
  const n = st.n || 1, order = ['amb', 'ready', 'doing'];
  return [
    h('span', { class: 'jbar', role: 'img', 'aria-label': PHASES.map(([k, l]) => st.ph[k] + ' ' + l.toLowerCase()).join(', ') },
      order.map((k) => h('i', { class: 'j-' + k, style: 'width:' + (st.ph[k] / n * 100) + '%' }))),
    h('span', { class: 'jleg' }, ['amb', 'ready', 'doing', 'todo'].map((k) => h('span', null, h('i', { class: 'j-' + k }),
      h('b', { text: String(st.ph[k]) }), { amb: ' in AMBOSS', ready: ' revised', doing: ' in progress', todo: ' not started' }[k]))),
  ];
}
const bar = (frac) => h('span', { class: 'mini-bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.round(Math.min(1, frac || 0) * 100) + '%' }));
const pctTxt = (f) => (f == null ? '–' : String(Math.round(f * 100)));

function renderSummary() {
  const st = sysStats();
  $('sys-sum').replaceChildren(
    h('div', { class: 'pv-stat' }, ring(st.frac || 0, pctTxt(st.frac), 'sysr'),
      h('div', null, h('span', { class: 'eyebrow', text: 'Overall' }), h('p', { text: st.rAll ? st.rDone + ' of ' + st.rAll + ' resources done' : 'No resources yet' }),
        h('small', { text: st.revised + ' of ' + st.n + ' systems revised' }))),
    h('div', { class: 'sum-j' }, journey(st)));
}

function resRow(id, r, i) {
  const done = resDone(r), list = () => resList(id).map((x) => Object.assign({}, x));
  const set = (d) => { const l = list(); l[i].d = Math.max(0, Math.min(d, l[i].tot || 1)); setRes(id, l); };
  return h('div', { class: 'rs' + (done ? ' done' : '') },
    h('button', { class: 'rs-chk', 'aria-pressed': done ? 'true' : 'false', 'aria-label': (done ? 'Mark not done: ' : 'Mark done: ') + r.n, title: done ? 'Done' : 'Mark done',
      onclick: () => set(done ? 0 : r.tot || 1) }, done ? '✓' : ''),
    h('span', { class: 'rs-n', text: r.n }),
    bar(resFrac(r)),
    h('span', { class: 'rs-v', text: r.tot ? Math.min(r.d, r.tot) + ' / ' + r.tot + (r.u ? ' ' + r.u : '') : done ? 'Done' : 'Not done' }),
    r.tot ? h('span', { class: 'rs-step' },
      h('button', { 'aria-label': 'One less ' + (r.u || 'done') + ' in ' + r.n, onclick: () => set(r.d - 1), disabled: r.d <= 0 ? '' : null }, '−'),
      h('button', { 'aria-label': 'One more ' + (r.u || 'done') + ' in ' + r.n, onclick: () => set(r.d + 1), disabled: r.d >= r.tot ? '' : null }, '+')) : h('span', { class: 'rs-step' }));
}

function sysRow(sy, weakIn) {
  const it = sysItem(sy.id), pr = sysProg(sy.id), open = !!(ui.sysOpen || {})[sy.id], weak = weakIn.get(sy.id), uw = num(it.uw);
  const toggle = () => { ui.sysOpen = Object.assign({}, ui.sysOpen, { [sy.id]: !open }); render(); };
  return h('div', { class: 'sys' + (open ? ' open' : '') + ' ph-' + phaseOf(sy.id), 'data-sys': sy.id },
    h('div', { class: 'sys-row' },
      ring(pr.frac || 0, pctTxt(pr.frac), 'sysr' + (pr.frac >= 1 ? ' full' : '')),
      h('button', { class: 'sys-tg', 'aria-expanded': open ? 'true' : 'false', 'aria-label': sy.name + ': ' + (pr.frac == null ? 'no resources' : pctTxt(pr.frac) + '% done') + '. ' + pr.next, onclick: toggle },
        h('span', { class: 'nm' }, sy.name, weak ? h('span', { class: 'tag weak-tag' + (weak.length >= 2 ? ' rec' : ''), title: 'Marked weak on ' + weak.map((f) => f.full).join(', '), text: 'Weak ' + weak.length + '×' }) : null),
        h('small', { class: 'nx', text: pr.next })),
      h('span', { class: 'conf', role: 'group', 'aria-label': 'Confidence for ' + sy.name },
        [1, 2, 3, 4, 5].map((n) => h('button', { class: it.conf >= n ? 'on' : '', 'aria-label': 'Confidence ' + n, 'aria-pressed': it.conf === n ? 'true' : 'false', title: 'Confidence ' + n + '/5', onclick: () => setSys(sy.id, { conf: it.conf === n ? 0 : n }) }))),
      h('button', { class: 'chev', 'aria-hidden': 'true', tabindex: '-1', onclick: toggle }, '›')),
    open ? h('div', { class: 'sys-body' },
      pr.rs.length ? h('div', { class: 'rs-list' }, pr.rs.map((r, i) => resRow(sy.id, r, i)))
        : h('p', { class: 'hint', text: 'No resources yet. Add the ones you’ll use for this system (e.g. Sketchy videos, CKNotes pages) and track each one.' }),
      h('div', { class: 'sys-ctl' },
        h('span', { class: 'seg stage', role: 'group', 'aria-label': 'Status for ' + sy.name },
          SYS_ST.map((l, i) => h('button', { class: 'v' + i, 'aria-pressed': it.status === i ? 'true' : 'false', onclick: () => setSys(sy.id, { status: i }) }, l))),
        h('button', { class: 'amb-tog' + (it.amb ? ' on' : it.status === 3 ? ' ready' : ''), 'aria-pressed': it.amb ? 'true' : 'false',
          title: it.amb ? 'Added to AMBOSS on ' + fmtDate(it.amb) + ' (tap to undo)' : 'Mark as added to AMBOSS',
          onclick: () => setSys(sy.id, { amb: it.amb ? '' : today() }) }, it.amb ? '✓ In AMBOSS' : 'Add to AMBOSS')),
      h('div', { class: 'sys-foot' },
        uw != null ? h('span', { class: 'tag uw ' + band('cms', uw), title: 'UWorld % correct', text: 'UW ' + fmtPct(uw) }) : null,
        it.notes ? h('span', { class: 'sys-note', text: it.notes, title: it.notes }) : h('span'),
        h('button', { class: 'btn', 'data-open': sy.id, onclick: () => openSystem(sy) }, pr.rs.length ? 'Edit' : 'Add resources'))) : null);
}

export function renderSystems() {
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
  const by = { doing: [], ready: [], todo: [], amb: [] };
  allSystems().forEach((sy) => by[phaseOf(sy.id)].push(sy));
  $('sys-rows').replaceChildren(...PHASES.filter(([k]) => by[k].length).map(([k, label]) => h('section', { class: 'sys-group g-' + k, 'aria-label': label },
    h('h3', { class: 'sys-gh' }, h('i', { class: 'j-' + k }), label, h('span', { text: String(by[k].length) })),
    h('div', { class: 'rows' }, by[k].map((sy) => sysRow(sy, weakIn))))));
  $('sys-add').replaceChildren(inp, h('button', { class: 'btn', onclick: add }, 'Add'));
}

// Overview card: the journey bar and the systems you're working on, with their next step.
export function renderSysCard(box) {
  const st = sysStats();
  const doing = allSystems().filter((s) => phaseOf(s.id) === 'doing').map((s) => ({ s, p: sysProg(s.id) })).sort((a, b) => (b.p.frac || 0) - (a.p.frac || 0));
  const ready = allSystems().filter((s) => phaseOf(s.id) === 'ready');
  box.replaceChildren(h('div', { class: 'sys-mini' },
    h('div', { class: 'pv-stat' }, ring(st.frac || 0, pctTxt(st.frac), 'sysr'),
      h('div', null, h('span', { class: 'eyebrow', text: 'Resources' }), h('p', { text: st.rAll ? st.rDone + ' of ' + st.rAll + ' done' : 'None added yet' }),
        h('small', { text: st.revised + ' of ' + st.n + ' systems revised · ' + st.amb + ' in AMBOSS' }))),
    h('div', { class: 'sum-j' }, journey(st)),
    doing.length || ready.length ? h('div', { class: 'sys-mini-l' },
      ready.length ? h('button', { class: 'smr ready', onclick: () => showTab('systems', true) }, h('span', { class: 'lbl', text: ready.map((s) => shortSys(s.name)).slice(0, 3).join(', ') + (ready.length > 3 ? '…' : '') }), h('small', { text: 'add to AMBOSS' })) : null,
      doing.slice(0, 4).map(({ s, p }) => h('button', { class: 'smr', onclick: () => { ui.sysOpen = Object.assign({}, ui.sysOpen, { [s.id]: true }); showTab('systems', true); } },
        h('span', { class: 'lbl', text: shortSys(s.name) }), bar(p.frac), h('span', { class: 'val', text: pctTxt(p.frac) + '%' }), h('small', { text: p.next.replace(/^Next: /, '') })))) : null,
    h('div', { class: 'art-foot' }, h('span', { class: 'pv-last', text: doing.length > 4 ? plural(doing.length - 4, 'more system') + ' in progress' : '' }),
      h('button', { class: 'btn', onclick: () => showTab('systems', true) }, 'Open systems'))));
}

// The side sheet: resources (add, rename-free: remove and re-add; set totals and units), AMBOSS date, UWorld %, notes.
export function openSystem(sy, focus) {
  const cur = () => sysItem(sy.id);
  const patch = (p) => { state.systems[sy.id] = Object.assign({}, cur(), p, { day: today() }); save(); render(); };
  const list = () => resList(sy.id).map((r) => Object.assign({}, r));
  const notesIn = h('textarea', { id: 'ed-sys-notes', placeholder: 'High-yield gaps, things to revisit…' });
  notesIn.value = cur().notes;
  notesIn.addEventListener('input', () => { state.systems[sy.id] = Object.assign({}, cur(), { notes: notesIn.value }); save(); render(); });
  const uwIn = h('input', { type: 'number', id: 'ed-uw', min: '0', max: '100', step: 'any', inputmode: 'decimal', placeholder: 'e.g. 68' });
  uwIn.value = cur().uw;
  uwIn.addEventListener('input', () => { const v = num(uwIn.value); if (uwIn.value === '' || (v != null && v >= 0 && v <= 100)) { state.systems[sy.id] = Object.assign({}, cur(), { uw: uwIn.value }); save(); render(); } });
  const ambOn = h('input', { type: 'checkbox', id: 'ed-amb' });
  const ambDate = h('input', { type: 'date', id: 'ed-amb-date', class: 'sel', 'aria-label': 'Date added to AMBOSS' });
  ambOn.addEventListener('change', () => patch({ amb: ambOn.checked ? today() : '' }));
  ambDate.addEventListener('change', () => { if (ambDate.value) patch({ amb: ambDate.value }); });

  const resBox = h('div', { class: 'res-ed' });
  const sugBox = h('div', { class: 'tags res-sug' });
  const newIn = h('input', { type: 'text', id: 'ed-res-new', maxlength: '30', placeholder: 'Resource name (e.g. Boards & Beyond)', 'aria-label': 'New resource name' });
  const addRes = (n) => {
    n = (n || newIn.value).trim().slice(0, 30); if (!n) return;
    const l = list();
    if (!l.some((r) => r.n.toLowerCase() === n.toLowerCase())) { l.push({ n, d: 0, tot: '', u: '' }); patch({ rs: l }); }
    newIn.value = ''; drawRes();
    setTimeout(() => { const ins = resBox.querySelectorAll('.re-tot'); if (ins.length && n === list()[list().length - 1].n) ins[ins.length - 1].focus(); }, 0);
  };
  newIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addRes(); } });
  const copyBtn = h('button', { class: 'linkish', onclick: () => {
    const names = list().map((r) => r.n); if (!names.length) return;
    const undo = snapshot();
    allSystems().forEach((s) => {
      if (s.id === sy.id) return;
      const l = resList(s.id).map((r) => Object.assign({}, r));
      names.forEach((n) => { if (!l.some((r) => r.n.toLowerCase() === n.toLowerCase())) l.push({ n, d: 0, tot: '', u: '' }); });
      state.systems[s.id] = Object.assign({}, sysItem(s.id), { rs: l });
    });
    save(); render();
    toast('Added ' + names.join(', ') + ' to every system', undo);
  } }, 'Add these resources to every system');

  const drawRes = () => {
    const l = list();
    resBox.replaceChildren(...(l.length ? [h('div', { class: 're-h', 'aria-hidden': 'true' }, h('span', { text: 'Resource' }), h('span', { text: 'Done' }), h('span', { text: 'Total' }), h('span', { text: 'Unit' }), h('span'))] : []),
      ...l.map((r, i) => {
        const upd = (p) => { const x = list(); Object.assign(x[i], p); if (x[i].tot) x[i].d = Math.min(x[i].d, x[i].tot); else x[i].d = Math.min(x[i].d, 1); patch({ rs: x }); };
        const dIn = h('input', { type: 'number', class: 're-d', min: '0', inputmode: 'numeric', value: String(r.d), 'aria-label': r.n + ': done' });
        const tIn = h('input', { type: 'number', class: 're-tot', min: '0', inputmode: 'numeric', value: r.tot === '' ? '' : String(r.tot), placeholder: '—', 'aria-label': r.n + ': total (leave empty for done / not done)' });
        const uSel = h('select', { class: 'sel re-u', 'aria-label': r.n + ': unit' }, h('option', { value: '', text: '—' }), UNITS.map((u) => h('option', { value: u, text: u })));
        uSel.value = r.u;
        dIn.addEventListener('change', () => upd({ d: Math.max(0, Math.round(num(dIn.value) || 0)) }));
        tIn.addEventListener('change', () => { const v = Math.round(num(tIn.value) || 0); upd({ tot: v > 0 ? Math.min(v, 99999) : '' }); });
        uSel.addEventListener('change', () => upd({ u: uSel.value }));
        return h('div', { class: 're' }, h('span', { class: 're-n', text: r.n }), dIn, tIn, uSel,
          h('button', { class: 're-x', 'aria-label': 'Remove ' + r.n, title: 'Remove', onclick: () => { const undo = snapshot(); patch({ rs: list().filter((_, j) => j !== i) }); drawRes(); toast(r.n + ' removed from ' + shortSys(sy.name), undo); } }, '×'));
      }));
    const have = new Set(l.map((r) => r.n.toLowerCase()));
    const known = [...new Set(RESOURCES.concat(...allSystems().map((s) => resList(s.id).map((r) => r.n))))].filter((n) => !have.has(n.toLowerCase()));
    sugBox.replaceChildren(...known.map((n) => h('button', { class: 'tag pick', 'data-res': n, onclick: () => addRes(n) }, '+ ' + n)));
    copyBtn.hidden = !l.length;
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
    h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Resources' }),
      h('p', { class: 'hint', text: 'Set a total (pages, videos…) to track progress; leave it empty for a simple done / not done.' }),
      resBox, h('div', { class: 'add-sys' }, newIn, h('button', { class: 'btn', onclick: () => addRes() }, 'Add')), sugBox, copyBtn),
    h('div', { class: 'field' }, h('span', { class: 'lab', text: 'AMBOSS' }),
      h('div', { class: 'amb-row' }, h('label', { class: 'switch' }, ambOn, 'Added to AMBOSS'), ambDate)),
    h('div', { class: 'two' }, h('div', { class: 'field' }, h('label', { for: 'ed-uw', text: 'UWorld % correct' }), uwIn), h('div')),
    h('div', { class: 'field' }, h('label', { for: 'ed-sys-notes', text: 'Notes' }), notesIn),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'Done'), rm),
  ], () => {
    if (document.activeElement !== notesIn) notesIn.value = cur().notes;
    if (document.activeElement !== uwIn) uwIn.value = cur().uw;
    if (!resBox.contains(document.activeElement)) drawRes();
    drawAmb();
  }, focus || '#ed-res-new');
}
