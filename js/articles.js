// The AMBOSS articles tab.

import { $, fmtDate, h, isDate, plural, ring, safeUrl, sum, svgIcon, today, uid } from './util.js?v=21';
import { PASSES } from './catalog.js?v=21';
import { save, snapshot, state, toast, ui } from './store.js?v=21';
import { allSystems, artItem, artSections, artUrl } from './data.js?v=21';
import { closeSheet, openSheet, refreshSheet, sheetHead } from './sheets.js?v=21';
import { render, showTab } from './shell.js?v=21';

export function setReads(id, n) {
  const cur = artItem(id);
  state.articles[id] = Object.assign({}, cur, { reads: n, date: n > cur.reads ? today() : n ? cur.date : '' });
  save(); render(); refreshSheet();
}
export const extIcon = () => { const a = h('span', { 'aria-hidden': 'true' }); a.innerHTML = svgIcon('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'); return a; };
export function passBoxes(ar, label) {
  const it = artItem(ar.id);
  return h('span', { class: 'passes', role: 'group', 'aria-label': label || 'Read-throughs of ' + ar.name },
    Array.from({ length: PASSES }, (_, i) => h('button', { class: 'pass' + (it.reads > i ? ' on' : ''), 'aria-pressed': it.reads > i ? 'true' : 'false',
      'aria-label': 'Read ' + (i + 1) + ' of ' + PASSES, title: it.reads > i ? 'Read ' + (i + 1) + ' — tap to untick' : 'Mark read-through ' + (i + 1),
      onclick: () => setReads(ar.id, it.reads === i + 1 ? i : i + 1) })));
}
// Inline form for a new article; the AMBOSS link is optional (without one the title opens an AMBOSS search).
export function addArticleRow(sec) {
  const name = h('input', { type: 'text', maxlength: '120', placeholder: 'Article title, as in AMBOSS', 'aria-label': 'Article title' });
  const url = h('input', { type: 'url', maxlength: '500', placeholder: 'AMBOSS link (optional)', 'aria-label': 'AMBOSS link' });
  const submit = () => {
    const n = name.value.trim(), u = url.value.trim();
    if (!n) { name.focus(); return; }
    if (u && !safeUrl(u)) { toast('That link doesn’t look right — paste the full https:// address'); url.focus(); return; }
    state.artCustom.push({ id: 'ar-x' + uid(), sec: sec.id, name: n.slice(0, 120), url: u ? safeUrl(u) : '', t: 0 });
    save(); ui.focusAdd = true; render();
    toast('Added “' + n + '” to ' + sec.name);
  };
  [name, url].forEach((x) => x.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { ui.artAdding = null; render(); } }));
  if (ui.focusAdd) { ui.focusAdd = false; setTimeout(() => name.focus(), 0); }
  return h('div', { class: 'add-row art-add' }, name, url, h('button', { onclick: submit }, 'Add'), h('button', { class: 'ghost', onclick: () => { ui.artAdding = null; render(); } }, 'Done'));
}
// Your section order (Arrange), with new sections at the end in the order they were added.
export function orderedSections() {
  const secs = artSections(), order = state.prefs.artOrder;
  const pos = (id, i) => { const k = order.indexOf(id); return k < 0 ? 1e4 + i : k; };
  return secs.map((sec, i) => [pos(sec.id, i), sec]).sort((x, y) => x[0] - y[0]).map(([, sec]) => sec);
}
export function moveSection(id, to) {
  const ids = orderedSections().map((x) => x.id), i = ids.indexOf(id);
  const j = to === 'top' ? 0 : to === 'end' ? ids.length - 1 : Math.max(0, Math.min(ids.length - 1, i + to));
  if (i === j) return;
  ids.splice(j, 0, ids.splice(i, 1)[0]);
  state.prefs.artOrder = ids;
  save(); render();
}
export const SORTS = {
  least: (a, b) => artItem(a.id).reads - artItem(b.id).reads,
  most: (a, b) => artItem(b.id).reads - artItem(a.id).reads,
  recent: (a, b) => (artItem(b.id).date || '').localeCompare(artItem(a.id).date || ''),
  az: (a, b) => a.name.localeCompare(b.name),
};
export const sortArts = (list) => (SORTS[state.prefs.artSort] ? list.slice().sort(SORTS[state.prefs.artSort]) : list);
export function toggleCollapsed(id, open) {
  const set = new Set(state.prefs.artCollapsed);
  if (open == null ? set.has(id) : open) set.delete(id); else set.add(id);
  state.prefs.artCollapsed = [...set];
  save(); render();
}

// one colour per read-through count, 0× (unread) to 5×
const TONES = ['var(--s0)', 'var(--s1)', 'color-mix(in srgb,var(--s1) 45%,var(--s2))', 'var(--s2)', 'color-mix(in srgb,var(--s2) 50%,var(--s3))', 'var(--s3)'];
const distBar = (dist) => h('div', { class: 'dist', role: 'img', 'aria-label': dist.map((c, i) => c + ' at ' + i).join(', ') + ' read-throughs' },
  dist.map((c, i) => (c ? h('span', { style: 'flex:' + c + ';background:' + TONES[i], title: c + ' article' + (c === 1 ? '' : 's') + ' read ' + i + '×' }) : null)));

// Progress at a glance: totals, how many articles sit at each read-through count, and every section's bar.
// The overview's card (compact) leads with a ring and splits each section's bar by read-throughs.
export function renderArtSummary(box, compact) {
  const secs = orderedSections(), arts = secs.flatMap((x) => x.articles);
  const reads = arts.map((a) => artItem(a.id).reads);
  const read = reads.filter((r) => r > 0).length, passes = sum(reads), finished = reads.filter((r) => r >= PASSES).length;
  const dist = Array.from({ length: PASSES + 1 }, (_, i) => reads.filter((r) => r === i).length);
  const jump = (sec) => {
    if (compact) { ui.artJump = sec.id; showTab('articles', true); return; }
    toggleCollapsed(sec.id, true);
    const el = $('art-' + sec.id); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const bars = h('div', { class: 'sbars art-bars' }, secs.map((sec) => {
    const n = sec.articles.length, rs = sec.articles.map((a) => artItem(a.id).reads), r = rs.filter((x) => x > 0).length;
    // compact: one segment per read-through count (1× light → 5× dark); full: read at least once
    const segs = compact
      ? Array.from({ length: PASSES }, (_, i) => rs.filter((x) => Math.min(x, PASSES) === i + 1).length).map((c, i) => (c ? h('span', { style: 'width:' + c / n * 100 + '%;background:' + TONES[i + 1] }) : null))
      : h('span', { style: 'width:' + (n ? r / n * 100 : 0) + '%;background:var(--s2)' });
    return h('button', { class: 'sbar', onclick: () => jump(sec), 'aria-label': sec.name + ': ' + r + ' of ' + n + ' read' },
      h('span', { class: 'lbl', text: sec.name.replace(/^High-Yield /, ''), title: sec.name }),
      h('span', { class: 'segbar', 'aria-hidden': 'true' }, segs),
      h('span', { class: 'val', text: r + '/' + n }));
  }));
  const legend = h('div', { class: 'dist-l', 'aria-hidden': 'true' }, dist.map((c, i) => h('span', null, h('i', { style: 'background:' + TONES[i] }), i + '×', compact ? h('b', { text: String(c) }) : null)));
  if (compact) {
    const last = arts.filter((a) => artItem(a.id).reads && artItem(a.id).date).sort((a, b) => artItem(b.id).date.localeCompare(artItem(a.id).date))[0];
    box.replaceChildren(h('div', { class: 'art-mini' },
      h('div', { class: 'art-hero' },
        h('div', { class: 'pv-stat' }, ring(arts.length ? read / arts.length : 0, String(read), 'amb'),
          h('div', null, h('span', { class: 'eyebrow', text: 'Read' }), h('p', { text: read + '/' + arts.length + ' articles' }),
            h('small', { text: arts.length ? Math.round(read / arts.length * 100) + '% at least once' : 'No articles' }))),
        h('div', { class: 'art-kpis' },
          h('div', null, h('b', { text: String(passes) }), h('span', { text: 'read-throughs' })),
          h('div', null, h('b', { text: String(finished) }), h('span', { text: 'done 5×' })))),
      distBar(dist), legend, bars,
      h('div', { class: 'art-foot' },
        last ? h('button', { class: 'linkish', 'data-open': last.id, onclick: () => openArticle(last) }, 'Last: ' + last.name + ' · ' + fmtDate(artItem(last.id).date)) : h('span'),
        h('button', { class: 'btn', onclick: () => showTab('articles', true) }, 'Open articles'))));
    return;
  }
  box.replaceChildren(h('div', { class: 'card art-sum' },
    h('div', { class: 'art-stats' },
      h('div', null, h('div', { class: 'eyebrow', text: 'Read' }), h('div', { class: 'big' }, String(read), h('small', { text: 'of ' + arts.length })),
        h('div', { class: 'meter' }, h('b', { style: 'width:' + (arts.length ? read / arts.length * 100 : 0) + '%' }))),
      h('div', null, h('div', { class: 'eyebrow', text: 'Read-throughs' }), h('div', { class: 'big' }, String(passes), h('small', { text: 'of ' + arts.length * PASSES })),
        h('div', { class: 'meter' }, h('b', { style: 'width:' + (arts.length ? passes / (arts.length * PASSES) * 100 : 0) + '%' }))),
      h('div', null, h('div', { class: 'eyebrow', text: 'Done 5×' }), h('div', { class: 'big' }, String(finished), h('small', { text: 'articles' })),
        distBar(dist), legend)),
    bars));
}

export function artCard(ar) {
  const it = artItem(ar.id);
  const link = h('a', { class: 'xs ext', href: artUrl(ar), target: '_blank', rel: 'noopener noreferrer', title: ar.url ? 'Open in AMBOSS' : 'Search AMBOSS for this article', 'aria-label': 'Open ' + ar.name + ' in AMBOSS' });
  link.append(extIcon());
  return h('div', { class: 'acard r' + it.reads + (it.reads >= PASSES ? ' done' : '') },
    h('button', { class: 'ac-nm', 'data-open': ar.id, onclick: () => openArticle(ar), title: ar.name }, ar.name),
    h('div', { class: 'ac-meta' }, ar.builtIn ? null : h('span', { class: 'old', text: 'added' }), it.date ? h('span', { text: fmtDate(it.date) }) : null, it.notes ? h('span', { class: 'ac-note', text: '✎', title: it.notes }) : null),
    h('div', { class: 'ac-foot' }, passBoxes(ar), link));
}
export function artRow(ar) {
  const it = artItem(ar.id);
  const link = h('a', { class: 'xs ext', href: artUrl(ar), target: '_blank', rel: 'noopener noreferrer', title: ar.url ? 'Open in AMBOSS' : 'Search AMBOSS for this article', 'aria-label': 'Open ' + ar.name + ' in AMBOSS' });
  link.append(extIcon());
  return h('div', { class: 'art' + (it.reads >= PASSES ? ' done' : '') },
    h('button', { class: 'nm', 'data-open': ar.id, onclick: () => openArticle(ar) },
      h('span', null, ar.name, ar.builtIn ? null : h('span', { class: 'old', text: 'added' })),
      it.notes || it.date ? h('small', { text: [it.date ? 'last read ' + fmtDate(it.date) : '', it.notes].filter(Boolean).join(' · ') }) : null),
    passBoxes(ar), link);
}

export function renderArticles() {
  const q = ui.artQ.trim().toLowerCase(), f = ui.artF, filtering = !!q || f !== 'all';
  const P = state.prefs, grid = P.artView === 'grid', arrange = ui.artArrange;
  document.querySelectorAll('[data-af]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.af === f ? 'true' : 'false'));
  document.querySelectorAll('#art-view button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === P.artView ? 'true' : 'false'));
  $('art-sort').value = P.artSort;
  $('art-arrange').setAttribute('aria-pressed', arrange ? 'true' : 'false');
  $('art-arrange').textContent = arrange ? 'Done arranging' : 'Arrange sections';
  const secs = orderedSections();
  const allCollapsed = secs.every((x) => P.artCollapsed.includes(x.id));
  $('art-collapse').textContent = allCollapsed ? 'Expand all' : 'Collapse all';
  renderArtSummary($('art-summary'));
  if (ui.artJump) {
    const id = ui.artJump; ui.artJump = '';
    if (P.artCollapsed.includes(id)) { P.artCollapsed = P.artCollapsed.filter((x) => x !== id); save(); }
    setTimeout(() => { const el = $('art-' + id); if (el) el.scrollIntoView({ block: 'start' }); }, 0);
  }

  const groups = secs.map((sec, idx) => {
    const all = sec.articles;
    const read = all.filter((a) => artItem(a.id).reads > 0).length, passes = sum(all.map((a) => artItem(a.id).reads));
    const shown = sortArts(all.filter((a) => (f === 'all' || (f === 'unread' ? !artItem(a.id).reads : artItem(a.id).reads > 0)) && (!q || a.name.toLowerCase().includes(q))));
    if (filtering && !shown.length) return null;
    // filtering or searching always shows matches, even in collapsed sections
    const collapsed = arrange || (!filtering && P.artCollapsed.includes(sec.id));
    let title = h('h3', { text: sec.name });
    if (ui.artRename === sec.id) {
      title = h('input', { type: 'text', class: 'sec-rename', value: sec.name, maxlength: '80', 'aria-label': 'Section name' });
      const done = () => {
        if (ui.artRename !== sec.id) return; // Enter already saved; this is the blur that follows
        const v = title.value.trim();
        if (v) state.artSections = state.artSections.map((x) => (x.id === sec.id ? Object.assign({}, x, { name: v }) : x));
        ui.artRename = null; save(); render();
      };
      title.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { ui.artRename = null; render(); } });
      title.addEventListener('blur', done);
      setTimeout(() => { title.focus(); title.select(); }, 0);
    }
    const mv = (to, label, sym, dis) => h('button', { class: 'mv', disabled: dis, 'data-move': sec.id + ':' + to, 'aria-label': label + ': ' + sec.name, title: label,
      onclick: () => { moveSection(sec.id, to); setTimeout(() => { const b = document.querySelector('[data-move="' + CSS.escape(sec.id + ':' + to) + '"]:not(:disabled)'); if (b) b.focus(); }, 0); } }, sym);
    const head = h('div', { class: 'subj-head art-head' },
      arrange ? null : h('button', { class: 'chev', 'aria-expanded': collapsed ? 'false' : 'true', 'aria-label': (collapsed ? 'Expand ' : 'Collapse ') + sec.name, onclick: () => toggleCollapsed(sec.id) }, h('span', { 'aria-hidden': 'true', text: '▾' })),
      title,
      h('span', { class: 'stat', text: read + '/' + all.length + ' read' + (passes ? ' · ' + plural(passes, 'read-through') : '') }),
      h('span', { class: 'meter sec-meter', 'aria-hidden': 'true' }, h('b', { style: 'width:' + (all.length ? read / all.length * 100 : 0) + '%' })),
      arrange ? h('span', { class: 'sec-tools' }, mv('top', 'Move to top', '⤒', idx === 0), mv(-1, 'Move up', '↑', idx === 0), mv(1, 'Move down', '↓', idx === secs.length - 1), mv('end', 'Move to bottom', '⤓', idx === secs.length - 1))
        : h('span', { class: 'sec-tools' },
          grid && !filtering && ui.artAdding !== sec.id ? h('button', { class: 'linkish sec-add', onclick: () => { ui.artAdding = sec.id; ui.focusAdd = true; toggleCollapsed(sec.id, true); } }, '+ Add article') : null,
          sec.builtIn ? null : h('button', { class: 'linkish', onclick: () => { ui.artRename = sec.id; render(); } }, 'Rename'),
          sec.builtIn ? null : h('button', { class: 'linkish', onclick: () => {
            const undo = snapshot();
            state.artCustom = state.artCustom.filter((x) => x.sec !== sec.id);
            state.artSections = state.artSections.filter((x) => x.id !== sec.id);
            save(); render();
            toast(sec.name + ' removed', undo);
          } }, 'Remove')));
    if (collapsed) return h('div', { class: 'group art-sec collapsed', id: 'art-' + sec.id }, head);
    // grid: "+ Add article" sits in the section header; list: as the last row
    const add = filtering ? null : ui.artAdding === sec.id ? addArticleRow(sec)
      : grid ? null : h('button', { class: 'add-link', onclick: () => { ui.artAdding = sec.id; ui.focusAdd = true; render(); } }, '+ Add an article');
    const body = grid ? h('div', { class: 'acards' }, shown.map(artCard)) : h('div', { class: 'rows' }, shown.map(artRow), add);
    return h('div', { class: 'group art-sec', id: 'art-' + sec.id }, head, shown.length || !grid ? body : null,
      grid && add ? h('div', { class: 'rows', style: 'margin-top:8px' }, add) : null);
  }).filter(Boolean);
  if (!filtering && !arrange) groups.push(ui.artNewSec ? newSectionRow() : h('button', { class: 'add-chip art-newsec', onclick: () => { ui.artNewSec = true; render(); } }, '+ Add a section (for example a system, like Cardiology)'));
  $('art-list').replaceChildren(...(groups.length ? groups : [h('p', { class: 'sub', text: 'No articles match.' })]));
}
export function newSectionRow() {
  const inp = h('input', { type: 'text', maxlength: '80', placeholder: 'Section name, e.g. Cardiology', 'aria-label': 'New section name', list: 'art-sec-ideas' });
  const ideas = h('datalist', { id: 'art-sec-ideas' }, allSystems().map((x) => h('option', { value: x.name })));
  const submit = () => {
    const v = inp.value.trim(); if (!v) { inp.focus(); return; }
    const id = 'sec-x' + uid();
    state.artSections.push({ id, name: v, t: 0 });
    ui.artNewSec = false; ui.artAdding = id; ui.focusAdd = true;
    save(); render();
    toast(v + ' added — now add its articles');
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { ui.artNewSec = false; render(); } });
  setTimeout(() => inp.focus(), 0);
  return h('div', { class: 'card add-row art-sec-form' }, inp, ideas, h('button', { onclick: submit }, 'Add section'), h('button', { class: 'ghost', onclick: () => { ui.artNewSec = false; render(); } }, 'Cancel'));
}
document.querySelectorAll('[data-af]').forEach((b) => b.addEventListener('click', () => { ui.artF = b.dataset.af; render(); }));
$('art-view').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.prefs.artView = b.dataset.view; save(); render(); } });
$('art-sort').addEventListener('change', (e) => { state.prefs.artSort = e.target.value; save(); render(); });
$('art-arrange').addEventListener('click', () => { ui.artArrange = !ui.artArrange; ui.artAdding = null; ui.artNewSec = false; render(); });
$('art-collapse').addEventListener('click', () => {
  const ids = orderedSections().map((x) => x.id), all = ids.every((id) => state.prefs.artCollapsed.includes(id));
  state.prefs.artCollapsed = all ? [] : ids; save(); render();
});
$('art-search').addEventListener('input', (e) => { ui.artQ = e.target.value; render(); });
$('art-add-sec').addEventListener('click', () => {
  ui.artF = 'all'; ui.artQ = ''; $('art-search').value = ''; ui.artArrange = false; ui.artNewSec = true; render();
  $('art-list').lastElementChild.scrollIntoView({ block: 'center', behavior: 'smooth' });
});

export function openArticle(ar) {
  const cur = () => artItem(ar.id);
  const custom = () => state.artCustom.find((x) => x.id === ar.id);
  const patch = (p) => { state.articles[ar.id] = Object.assign({}, cur(), p); save(); render(); };
  const sec = artSections().find((x) => x.id === ar.sec);
  const boxWrap = h('div');
  const drawBoxes = () => boxWrap.replaceChildren(passBoxes(ar, 'Read-throughs'));
  drawBoxes();
  const dateIn = h('input', { type: 'date', id: 'ar-date', value: cur().date });
  dateIn.addEventListener('change', () => patch({ date: isDate(dateIn.value) }));
  const notesIn = h('textarea', { id: 'ar-notes', placeholder: 'Key points, what to revisit, linked questions…' });
  notesIn.value = cur().notes;
  notesIn.addEventListener('input', () => patch({ notes: notesIn.value }));
  const open = h('a', { class: 'btn', href: artUrl(ar), target: '_blank', rel: 'noopener noreferrer' }, ar.url || !ar.builtIn ? 'Open in AMBOSS' : 'Find in AMBOSS');
  open.append(extIcon());
  let editFields = null;
  if (!ar.builtIn) {
    const nameIn = h('input', { type: 'text', id: 'ar-name', maxlength: '120', value: ar.name });
    const urlIn = h('input', { type: 'url', id: 'ar-url', maxlength: '500', placeholder: 'https://next.amboss.com/…', value: ar.url || '' });
    const setCustom = (p) => { state.artCustom = state.artCustom.map((x) => (x.id === ar.id ? Object.assign({}, x, p) : x)); save(); render(); };
    nameIn.addEventListener('input', () => { const v = nameIn.value.trim(); if (v) setCustom({ name: v.slice(0, 120) }); });
    urlIn.addEventListener('change', () => {
      const v = urlIn.value.trim();
      if (v && !safeUrl(v)) { toast('That link doesn’t look right — paste the full https:// address'); return; }
      setCustom({ url: v ? safeUrl(v) : '' });
      open.href = artUrl(custom() || ar);
    });
    editFields = [h('div', { class: 'field' }, h('label', { for: 'ar-name', text: 'Title' }), nameIn),
      h('div', { class: 'field' }, h('label', { for: 'ar-url', text: 'AMBOSS link' }), urlIn, h('p', { class: 'hint', text: 'Without a link, the button searches AMBOSS for the title.' }))];
  }
  const rm = !ar.builtIn ? h('button', { class: 'btn ghost danger', onclick: () => {
    const undo = snapshot();
    state.artCustom = state.artCustom.filter((x) => x.id !== ar.id); delete state.articles[ar.id];
    save(); closeSheet(); toast('Article removed', undo);
  } }, 'Remove article') : null;
  openSheet(ar.id, ar.name, [
    sheetHead('AMBOSS · ' + (sec ? sec.name : 'Article'), ar.name),
    h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Read-throughs (tick one each time you read it)' }), boxWrap),
    h('div', { class: 'two' }, h('div', { class: 'field' }, h('label', { for: 'ar-date', text: 'Last read' }), dateIn), h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Article' }), open)),
    editFields,
    h('div', { class: 'field' }, h('label', { for: 'ar-notes', text: 'Notes' }), notesIn),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'Done'), rm),
  ], () => {
    const a = document.activeElement;
    if (a !== dateIn) dateIn.value = cur().date;
    if (a !== notesIn) notesIn.value = cur().notes;
    drawBoxes();
  }, '.passes .pass');
}
