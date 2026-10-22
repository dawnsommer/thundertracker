// The Passive study tab: Divine Intervention Podcasts (DIP) and PHYSEO. Hidden until unlocked with a code in
// Settings → Extras. Optional study: it stays out of Up next, the pace and the overview's totals.
// Each item has 5 boxes, ticked once per time through; a DIP episode also has a "notes done" switch, so you
// can tell video-only from video + notes.

import { $, fmtDate, h, today } from './util.js?v=14';
import { save, state, ui } from './store.js?v=14';
import { render } from './shell.js?v=14';
import { DIP_ITEMS, DIP_SECTIONS, PHYSEO, PV_PASSES } from './passive-catalog.js?v=14';

// The code only decides whether the tab shows; it's not a password (the app has no secrets).
const CODE = '1afqyji';
const hash = (s) => { let x = 0x811c9dc5; for (const c of s) { x ^= c.codePointAt(0); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(36); };
export const codeOk = (s) => hash(String(s).trim().toLowerCase()) === CODE;
export const passiveOn = () => state.prefs.passive === true;

export const pvItem = (id) => state.passive[id] || { n: 0, notes: false, date: '', t: 0 };
const patch = (id, p) => {
  const cur = pvItem(id), next = Object.assign({}, cur, p);
  if ((p.n != null && p.n > cur.n) || (p.notes && !cur.notes)) next.date = today();
  if (!next.n && !next.notes) delete state.passive[id]; else state.passive[id] = next;
  save(); render();
};
// tap box i: tick up to it, or untick it if it's the last one ticked
const tapPass = (id, i) => { const n = pvItem(id).n; patch(id, { n: n === i + 1 ? i : i + 1 }); };

const status = (it) => (it.notes ? 'notes' : it.n ? 'video' : 'todo');
const fmtMin = (m) => (m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + 'm');

export function pvStats() {
  const dip = DIP_ITEMS.map((x) => [x, pvItem(x.id)]), ph = PHYSEO.map((x) => [x, pvItem(x.id)]);
  const timed = DIP_ITEMS.filter((x) => x.mins);
  const last = [...dip, ...ph].filter(([, it]) => it.date).sort((a, b) => b[1].date.localeCompare(a[1].date))[0];
  return {
    // every episode is exactly one of: to do, video only, with notes
    dipDone: dip.filter(([, it]) => it.n).length, dipNotes: dip.filter(([, it]) => status(it) === 'notes').length,
    dipVideoOnly: dip.filter(([, it]) => status(it) === 'video').length, dipTodo: dip.filter(([, it]) => status(it) === 'todo').length, dipTotal: dip.length,
    mins: timed.reduce((t, x) => t + x.mins, 0), minsDone: timed.filter((x) => pvItem(x.id).n).reduce((t, x) => t + x.mins, 0),
    phDone: ph.filter(([, it]) => it.n).length, phPasses: ph.reduce((t, [, it]) => t + it.n, 0), phTotal: ph.length,
    last: last ? { name: last[0].ep ? 'Ep ' + last[0].ep : last[0].name, date: last[1].date } : null,
  };
}

function boxes(id, name) {
  const n = pvItem(id).n;
  return h('span', { class: 'passes pv-passes', role: 'group', 'aria-label': 'Times through ' + name },
    Array.from({ length: PV_PASSES }, (_, i) => h('button', { class: 'pass' + (n > i ? ' on' : ''), 'aria-pressed': n > i ? 'true' : 'false',
      'aria-label': 'Time ' + (i + 1) + ' of ' + PV_PASSES, title: n > i ? 'Done ' + (i + 1) + '× — tap to untick' : 'Mark time ' + (i + 1), onclick: () => tapPass(id, i) })));
}
const NOTE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>';
function notesBtn(x) {
  const on = pvItem(x.id).notes;
  const b = h('button', { class: 'pv-note' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-notes': x.id,
    'aria-label': 'Notes done for ' + (x.ep ? 'Ep ' + x.ep : x.name), title: on ? 'Notes done — tap to undo' : 'Mark the notes as done', onclick: () => patch(x.id, { notes: !on }) });
  b.innerHTML = NOTE_ICON;
  return b;
}
// progress ring: share of items started
function ring(frac, label, cls) {
  const ns = 'http://www.w3.org/2000/svg', r = 15, c = 2 * Math.PI * r;
  const s = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = s('svg', { viewBox: '0 0 36 36', class: 'pv-ring ' + cls, 'aria-hidden': 'true' });
  svg.append(s('circle', { cx: 18, cy: 18, r, class: 'bg' }), s('circle', { cx: 18, cy: 18, r, class: 'fg', 'stroke-dasharray': (frac * c).toFixed(2) + ' ' + c.toFixed(2), transform: 'rotate(-90 18 18)' }));
  return h('div', { class: 'pv-ringw' }, svg, h('b', { text: label }));
}

const FILTERS = [['all', 'All'], ['todo', 'To do'], ['video', 'Video only'], ['notes', 'With notes']];
const shows = (f, it) => f === 'all' || status(it) === f;

export function renderPassive() {
  const box = $('pv-body');
  if (!box) return;
  const st = pvStats(), P = state.prefs, f = P.pvFilter || 'all';
  const pc = (a, b) => (b ? a / b : 0);

  // overview
  const bar = h('div', { class: 'pv-bar', role: 'img', 'aria-label': 'Divine Intervention: ' + st.dipNotes + ' with notes, ' + st.dipVideoOnly + ' video only, ' + st.dipTodo + ' to do' },
    h('i', { class: 'n', style: 'width:' + pc(st.dipNotes, st.dipTotal) * 100 + '%' }),
    h('i', { class: 'v', style: 'width:' + pc(st.dipVideoOnly, st.dipTotal) * 100 + '%' }));
  const over = h('section', { class: 'card pv-over', 'aria-label': 'Passive study overview' },
    h('div', { class: 'pv-stat' }, ring(pc(st.dipDone, st.dipTotal), st.dipDone + '', 'dip'),
      h('div', null, h('span', { class: 'eyebrow', text: 'Divine' }), h('p', { text: st.dipDone + ' of ' + st.dipTotal + ' episodes' }),
        h('small', { text: fmtMin(st.minsDone) + ' of ' + fmtMin(st.mins) + ' listened' }))),
    bar,
    h('div', { class: 'pv-legend' },
      h('span', null, h('i', { class: 'n' }), st.dipNotes + ' with notes'),
      h('span', null, h('i', { class: 'v' }), st.dipVideoOnly + ' video only'),
      h('span', null, h('i'), st.dipTodo + ' to do')),
    h('div', { class: 'pv-stat' }, ring(pc(st.phDone, st.phTotal), st.phDone + '', 'ph'),
      h('div', null, h('span', { class: 'eyebrow', text: 'PHYSEO' }), h('p', { text: st.phDone + ' of ' + st.phTotal + ' parts' }),
        h('small', { text: st.phPasses + ' of ' + st.phTotal * PV_PASSES + ' passes' }))),
    st.last ? h('p', { class: 'pv-last', text: 'Last: ' + st.last.name + ' · ' + fmtDate(st.last.date) }) : null);

  // PHYSEO: six parts, five boxes each
  const physeo = h('section', { class: 'card pv-card pv-ph', 'aria-labelledby': 'pv-ph-h' },
    h('div', { class: 'pv-head' }, h('h3', { id: 'pv-ph-h', text: 'PHYSEO' }), h('span', { class: 'pv-ct', text: st.phDone + '/' + st.phTotal })),
    h('div', { class: 'pv-phlist' }, PHYSEO.map((x) => {
      const it = pvItem(x.id);
      return h('div', { class: 'pv-ph-row' + (it.n ? ' on' : ''), 'data-pv': x.id },
        h('span', { class: 'pv-nm', text: x.name }), boxes(x.id, x.name));
    })));

  // DIP: sections of episodes
  const coll = new Set(P.pvCollapsed);
  const secs = DIP_SECTIONS.map((sec) => {
    const items = sec.items.map((x) => [x, pvItem(x.id)]);
    const done = items.filter(([, it]) => it.n).length;
    const shown = items.filter(([, it]) => shows(f, it));
    if (f !== 'all' && !shown.length) return null;
    const closed = f === 'all' && coll.has(sec.id);
    const toggle = () => { const s = new Set(P.pvCollapsed); s.has(sec.id) ? s.delete(sec.id) : s.add(sec.id); P.pvCollapsed = [...s]; save(); render(); };
    return h('div', { class: 'pv-sec', id: 'pv-' + sec.id },
      h('button', { class: 'pv-sec-h', 'aria-expanded': closed ? 'false' : 'true', onclick: toggle },
        h('span', { class: 'chev', 'aria-hidden': 'true', text: '▾' }),
        h('b', { text: sec.name }),
        h('span', { class: 'pv-stars', 'aria-label': sec.stars + ' of 5 stars', title: 'Priority ' + sec.stars + '/5', text: '★'.repeat(sec.stars) }),
        h('span', { class: 'pv-mini', 'aria-hidden': 'true' }, h('i', { style: 'width:' + pc(done, items.length) * 100 + '%' })),
        h('span', { class: 'pv-ct', text: done + '/' + items.length })),
      closed ? null : h('div', { class: 'pv-rows' }, shown.map(([x, it]) => h('div', { class: 'pv-row s-' + status(it), 'data-pv': x.id },
        h('span', { class: 'pv-ep' + (x.ep ? '' : ' series'), text: x.ep || 'Series' }),
        h('span', { class: 'pv-ti' }, h('span', { class: 'pv-nm', text: x.name, title: x.name }), x.mins ? h('small', { title: (x.approx ? 'About ' : '') + x.mins + ' min', text: fmtMin(x.mins) }) : null),
        boxes(x.id, x.ep ? 'Ep ' + x.ep : x.name), notesBtn(x)))));
  }).filter(Boolean);
  const dip = h('section', { class: 'card pv-card pv-dip', 'aria-labelledby': 'pv-dip-h' },
    h('div', { class: 'pv-head' }, h('h3', { id: 'pv-dip-h', text: 'Divine Intervention' }),
      h('div', { class: 'pv-filter', role: 'group', 'aria-label': 'Show' }, FILTERS.map(([k, l]) =>
        h('button', { class: 'pill', 'aria-pressed': f === k ? 'true' : 'false', 'data-pvf': k, onclick: () => { P.pvFilter = k; save(); render(); } }, l)))),
    h('p', { class: 'pv-key' }, 'Boxes: times through the video · ', h('span', { class: 'pv-note on mini', 'aria-hidden': 'true' }), ' notes done'),
    secs.length ? secs : h('p', { class: 'sub', text: 'Nothing here with this filter.' }));
  dip.querySelector('.pv-note.mini').innerHTML = NOTE_ICON;

  box.replaceChildren(h('div', { class: 'pv-grid' }, h('div', { class: 'pv-side' }, over, physeo), dip));
}
