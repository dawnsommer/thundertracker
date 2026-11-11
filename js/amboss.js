// The AMBOSS tab and its overview card: the user's AMBOSS tracker (block accuracy, why questions were missed,
// topics to review, the reviewed questions) inside Thunder tracker. Hidden until switched on in Settings → Extras
// (`prefs.amboss`, synced). The numbers come from the AMBOSS tracker page on the same site, which the user's
// local MogiAmboss tool rebuilds; this app only reads it (nothing of it is saved in the tracker's data).
// The service worker keeps the last copy, so it still shows offline.

import { $, fmtK, h, plural } from './util.js?v=28';
import { state, ui } from './store.js?v=28';
import { render, showTab } from './shell.js?v=28';
import { tile } from './overview.js?v=28';
import { browse, doneBatches, filterOptions, focus, groups, hasCurrent, heat, kpis, parseDashboard, plain, series, sysEstimates, TIPS, why } from './amboss-data.js?v=28';

export const ambossOn = () => state.prefs.amboss === true;
// the AMBOSS tracker page, next to this app on dawnsommer.github.io
export const AMB_URL = () => new URL('../amboss-tracker/', location.href).href;
const STALE = 5 * 60e3; // look for a newer page at most every 5 minutes while it's on screen

export const amb = { d: null, at: 0, err: '', busy: false };
export async function loadAmboss(force) {
  if (amb.busy || (!force && amb.at && Date.now() - amb.at < STALE)) return;
  amb.busy = true;
  if (force) render();
  try {
    const res = await fetch(AMB_URL(), { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = parseDashboard(await res.text());
    if (!d) throw new Error('no data on the page');
    amb.d = d; amb.err = '';
  } catch (e) {
    amb.err = amb.d ? 'Couldn’t check for a newer copy, showing the last one.' : 'Couldn’t load your AMBOSS tracker. Check your connection and try again.';
  }
  amb.at = Date.now(); amb.busy = false;
  if (ambossOn()) render();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ambossOn() && (ui.tab === 'amboss' || ui.tab === 'overview')) loadAmboss(); });

const era = () => (ui.ambEra || (amb.d && hasCurrent(amb.d) ? 'current' : 'all'));
const pct = (v) => (v == null ? '—' : Math.round(v) + '%');
const pct1 = (v) => (v == null ? '—' : v.toFixed(1) + '%');
const ERR_COLORS = ['var(--ser-nbme)', 'var(--ser-uwsa)', 'var(--ser-asa)', 'var(--hl)', 'var(--ser-f120)'];
const errColor = (D, k) => ERR_COLORS[Object.keys(D.errors).indexOf(k)] || 'var(--muted)';
const sysName = (D, s) => D.systems[s] || s;
const builtText = (D) => (D.built ? 'Updated ' + D.built : '');
export const ambCount = () => (amb.d ? fmtK(kpis(amb.d, 'all').questions) : '');

function deltaChip(d) {
  if (d == null) return null;
  const up = d >= 0;
  return h('span', { class: 'amb-delta ' + (up ? 'up' : 'dn'), title: 'Last 3 blocks against the 3 before' }, (up ? '▲ ' : '▼ ') + Math.abs(d).toFixed(1));
}

// a stacked bar of miss reasons
function whyBar(D, mix, label) {
  return h('div', { class: 'amb-why-row' },
    h('div', { class: 'amb-why-l' }, h('span', { text: label }), h('small', { text: plural(mix.n, 'question') })),
    h('div', { class: 'amb-stack', role: 'img', 'aria-label': label + ': ' + Object.entries(mix.by).map(([k, n]) => (D.errors[k] || k) + ' ' + n).join(', ') },
      Object.keys(D.errors).map((k) => (mix.by[k] ? h('span', { title: (D.errors[k] || k) + ': ' + mix.by[k], style: 'width:' + (100 * mix.by[k] / (mix.tagged || 1)) + '%;background:' + errColor(D, k) }) : null))));
}
const errLegend = (D) => h('div', { class: 'legend amb-legend' }, Object.keys(D.errors).map((k) => h('span', null, h('i', { style: 'background:' + errColor(D, k) }), D.errors[k])));

// Block accuracy: every block (dot), the last-3 average (line), the batch's stable % (green steps),
// the legacy blocks shaded and a dashed line where a system was added.
function chart(D, { W = 640, H = 270, mini = false } = {}) {
  const sr = series(D), n = sr.blocks.length;
  const ns = 'http://www.w3.org/2000/svg';
  const s = (tag, a) => { const el = document.createElementNS(ns, tag); for (const k in a) el.setAttribute(k, a[k]); return el; };
  const txt = (a, t) => { const el = s('text', a); el.textContent = t; return el; };
  const m = mini ? { l: 4, r: 4, t: 8, b: 6 } : { l: 40, r: 12, t: 18, b: 26 };
  const vals = sr.blocks.map((b) => b.pct).concat(sr.stable.filter((v) => v != null));
  const lo = Math.max(0, Math.min(50, Math.floor(Math.min(...vals) / 10) * 10)), hi = 100;
  const x = (i) => (n > 1 ? m.l + (i * (W - m.l - m.r)) / (n - 1) : (W + m.l - m.r) / 2);
  const y = (v) => m.t + ((hi - v) * (H - m.t - m.b)) / (hi - lo);
  const step = n > 1 ? x(1) - x(0) : 40;
  const k = kpis(D, 'all');
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', class: 'amb-chart' + (mini ? ' mini' : ''),
    'aria-label': 'Block accuracy: ' + n + ' blocks, last 3 average ' + pct(k.last3) + ', last 10 ' + pct(k.last10) });
  if (sr.legacy && !mini) {
    const r = sr.legacy >= n ? W - m.r : x(sr.legacy - 1) + step / 2;
    svg.append(s('rect', { x: m.l, y: m.t, width: Math.max(0, r - m.l), height: H - m.t - m.b, fill: 'var(--s0)', opacity: 0.55, rx: 4 }));
    svg.append(txt({ x: r - 6, y: H - m.b - 6, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 10.5 }, 'legacy'));
  }
  if (!mini) for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += lo <= 30 ? 20 : 10) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: 'var(--line)', 'stroke-width': 1 }));
    svg.append(txt({ x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11, 'font-family': 'var(--f-mono)' }, v + '%'));
  }
  if (!mini) for (const [i, sys] of Object.entries(sr.adds)) {
    const px = Math.max(m.l, x(+i) - step / 2);
    svg.append(s('line', { x1: px, x2: px, y1: m.t, y2: H - m.b, stroke: 'var(--muted)', 'stroke-dasharray': '3 3', 'stroke-width': 1 }));
    svg.append(txt({ x: px + 4, y: m.t + 10, fill: 'var(--muted)', 'font-size': 10.5 }, '+' + sys.join(' +')));
  }
  // batch stable %: a flat step over each block of the batch
  let d = '';
  sr.stable.forEach((v, i) => {
    if (v == null) return;
    const a = Math.max(m.l, x(i) - step / 2), b = Math.min(W - m.r, x(i) + step / 2);
    d += (sr.stable[i - 1] == null ? 'M' : 'L') + a.toFixed(1) + ' ' + y(v).toFixed(1) + 'L' + b.toFixed(1) + ' ' + y(v).toFixed(1);
  });
  if (d) svg.append(s('path', { d, fill: 'none', stroke: 'var(--good)', 'stroke-width': mini ? 1.5 : 2, opacity: 0.85 }));
  // last-3 average
  const roll = sr.roll.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
  if (roll.length > 1) svg.append(s('path', { d: 'M' + roll.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L'), fill: 'none', stroke: 'var(--ser-nbme)', 'stroke-width': mini ? 2 : 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const every = Math.max(1, Math.ceil(n / (W / 46)));
  sr.blocks.forEach((b, i) => {
    const last = i === n - 1;
    const c = s('circle', { cx: x(i), cy: y(b.pct), r: mini ? (last ? 3.5 : 2) : last ? 5 : 3.5, fill: last ? 'var(--hl)' : 'var(--panel)', stroke: last ? 'var(--ink)' : 'var(--muted)', 'stroke-width': mini ? 1.2 : 1.6, class: 'amb-pt' });
    const t = s('title', {});
    t.textContent = '#' + b.seq + (b.doc ? ' ' + b.doc : '') + ': ' + pct1(b.pct) + (sr.roll[i] != null ? ' · last 3 ' + pct1(sr.roll[i]) : '') +
      (b.batch_stable != null ? ' · stable ' + pct1(b.batch_stable) : '') + ' · ' + b.era + (b.targeted ? ', targeted' : ', random') + (b.date ? ' · ' + b.date : '');
    c.append(t);
    svg.append(c);
    if (!mini && (i % every === 0 || last)) svg.append(txt({ x: x(i), y: H - 8, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 10.5, 'font-family': 'var(--f-mono)' }, '#' + b.seq));
  });
  if (!mini && n) svg.append(txt({ x: x(n - 1), y: y(sr.blocks[n - 1].pct) - 10, 'text-anchor': 'end', fill: 'var(--ink)', 'font-size': 11.5, 'font-weight': 600, 'font-family': 'var(--f-mono)' }, pct(sr.blocks[n - 1].pct)));
  return svg;
}
const chartLegend = () => h('div', { class: 'legend' },
  h('span', null, h('i', { style: 'background:var(--ser-nbme)' }), 'Last-3-block average'),
  h('span', null, h('i', { class: 'dot', style: 'background:var(--panel);border:1.5px solid var(--muted)' }), 'Single block'),
  h('span', null, h('i', { style: 'background:var(--good)' }), 'Stable % of batch (right and sure)'));

const focusList = (D, list, compact) => h('ol', { class: 'amb-focus' + (compact ? ' compact' : '') }, list.length ? list.map((o) => h('li', null,
  h('span', { class: 'amb-ft', text: o.topic, title: o.topic }),
  h('span', { class: 'amb-tags' }, o.I ? h('span', { class: 'amb-tag I', text: o.I + ' I' }) : null, o.U ? h('span', { class: 'amb-tag U', text: o.U + ' U' }) : null),
  compact ? null : h('small', { text: o.system + ' · last in ' + o.last, title: sysName(D, o.system) }))) : h('li', { class: 'sub', text: 'Nothing reviewed in this scope yet.' }));

// incorrect (red) and unstable (amber) bars per group
function iuBars(D, rows, label) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return h('div', { class: 'amb-bars' }, rows.length ? rows.map((r) => h('div', { class: 'amb-bar', title: label(r.key) + ': ' + r.I + ' incorrect, ' + r.U + ' unstable' },
    h('span', { class: 'lbl', text: label(r.key) }),
    h('span', { class: 'amb-iu' }, h('i', { class: 'I', style: 'width:' + (100 * r.I / max) + '%' }), h('i', { class: 'U', style: 'width:' + (100 * r.U / max) + '%' })),
    h('span', { class: 'val num', text: r.n }))) : h('p', { class: 'sub', text: '—' }));
}

// ---------- the overview card ----------
export function renderAmbCard(box) {
  if (amb.busy && !amb.d) { box.replaceChildren(h('p', { class: 'sub', text: 'Loading your AMBOSS tracker…' })); return; }
  loadAmboss();
  const D = amb.d;
  if (!D) {
    box.replaceChildren(h('p', { class: 'sub', text: amb.err || 'Loading your AMBOSS tracker…' }),
      amb.err ? h('div', { class: 'art-foot' }, h('span'), h('button', { class: 'btn', onclick: () => loadAmboss(true) }, 'Try again')) : null);
    return;
  }
  const k = kpis(D, era()), w = why(D, era()), top = w.top;
  box.replaceChildren(h('div', { class: 'amb-mini' },
    h('div', { class: 'amb-hero' },
      h('div', { class: 'amb-big' }, h('span', { class: 'eyebrow', text: 'Last 3 blocks' }),
        h('div', null, h('b', { text: pct(k.last3) }), deltaChip(k.delta))),
      h('div', { class: 'art-kpis' },
        h('div', null, h('b', { text: k.lastBatch ? pct(k.lastBatch.stable_pct) : '—' }), h('span', { text: 'stable' })),
        h('div', null, h('b', { text: k.blocks }), h('span', { text: 'blocks' })),
        h('div', null, h('b', { text: k.reviewed }), h('span', { text: 'to review' })))),
    D.scores.length ? h('div', { class: 'amb-spark' }, chart(D, { W: 320, H: 64, mini: true })) : null,
    w.recent.n ? h('div', { class: 'amb-why-mini' }, whyBar(D, w.recent, 'Why you miss · last 3 sets'),
      top ? h('p', { class: 'amb-top' }, h('i', { style: 'background:' + errColor(D, top) }), h('b', { text: D.errors[top] || top }),
        ' · ' + Math.round(100 * (w.recent.by[top] || 0) / (w.recent.tagged || 1)) + '% of misses') : null) : null,
    h('div', { class: 'amb-mini-focus' }, h('span', { class: 'eyebrow', text: 'Focus next' }), focusList(D, focus(D, era(), 3), true)),
    h('div', { class: 'art-foot' }, h('span', { class: 'pv-last', text: builtText(D) }),
      h('button', { class: 'btn', onclick: () => showTab('amboss', true) }, 'Open AMBOSS'))));
}

// ---------- the tab ----------
export function renderAmboss() {
  const box = $('amb-body');
  if (!box) return;
  loadAmboss();
  const D = amb.d;
  const refresh = h('button', { class: 'btn ghost', id: 'amb-refresh', disabled: amb.busy ? '' : null, onclick: () => loadAmboss(true) }, amb.busy ? 'Checking…' : 'Refresh');
  const link = h('a', { class: 'btn ghost', href: AMB_URL(), target: '_blank', rel: 'noopener' }, 'Full page ↗');
  if (!D) {
    box.replaceChildren(h('div', { class: 'card amb-empty' },
      h('p', { text: amb.busy || !amb.at ? 'Loading your AMBOSS tracker…' : amb.err }), h('div', { class: 'btnrow' }, refresh, link)));
    return;
  }
  const e = era(), view = ui.ambView === 'questions' ? 'questions' : 'dash';
  const seg = (label, items, cur, set, cls) => h('div', { class: 'seg mode ' + (cls || ''), role: 'group', 'aria-label': label }, items.map(([k, l]) =>
    h('button', { 'aria-pressed': cur === k ? 'true' : 'false', 'data-amb': k, onclick: () => { set(k); render(); } }, l)));
  const Q = e === 'all' ? D.questions : D.questions.filter((q) => q.era === e);
  const bar = h('div', { class: 'amb-bar-top' },
    seg('View', [['dash', 'Dashboard'], ['questions', 'Questions · ' + Q.length]], view, (k) => { ui.ambView = k; }, 'amb-view'),
    seg('Scope', [['current', 'Current'], ['all', 'All'], ['legacy', 'Legacy']], e, (k) => { ui.ambEra = k; ui.ambShown = 0; }, 'amb-era'),
    h('span', { class: 'amb-built sub', text: builtText(D) }), refresh, link);
  const note = amb.err ? h('p', { class: 'banner', text: amb.err }) : null;
  // a redraw (a sync, a refresh) keeps the search box's focus and the questions you opened
  const typing = document.activeElement && document.activeElement.id === 'amb-q' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const open = new Set([...box.querySelectorAll('details.amb-q[open]')].map((d) => d.dataset.q));
  box.replaceChildren(...[bar, note, view === 'questions' ? questions(D, e) : dashboard(D, e)].filter(Boolean));
  box.querySelectorAll('details.amb-q').forEach((d) => { if (open.has(d.dataset.q)) d.open = true; });
  if (typing && $('amb-q')) { $('amb-q').focus(); $('amb-q').setSelectionRange(...typing); }
}

function dashboard(D, e) {
  const k = kpis(D, e), w = why(D, e), ht = heat(D, e), est = sysEstimates(D), bt = doneBatches(D);
  const tiles = h('div', { class: 'tiles amb-tiles' },
    tile('Last 3 blocks', h('span', null, pct1(k.last3), ' ', deltaChip(k.delta)), '', null, 'against the 3 before'),
    tile('Last 10 blocks', pct1(k.last10), '', null, plural(k.blocks, 'block') + ' in all'),
    tile('Stable · last batch', k.lastBatch ? pct1(k.lastBatch.stable_pct) : '—', '', k.lastBatch ? k.lastBatch.stable_pct / 100 : null,
      k.lastBatch ? k.lastBatch.set + ': ' + k.lastBatch.U + ' unstable of ' + k.lastBatch.n_q : 'after your first batch'),
    tile('Questions done', fmtK(k.questions), '', null, k.blocks + ' blocks of 20'),
    tile('Reviewed · ' + e, String(k.reviewed), '', null, k.I + ' incorrect · ' + k.U + ' unstable'),
    tile('Top miss reason', h('span', { class: 'amb-txt', text: k.topErr ? k.topErr.name : '—' }), '', null, k.topErr ? Math.round(k.topErr.share * 100) + '% of reviewed' : ''));

  const acc = h('section', { class: 'card', 'aria-labelledby': 'amb-acc-h' },
    h('div', { class: 'sec-head' }, h('div', null, h('h3', { id: 'amb-acc-h', text: 'Block accuracy' }), h('p', { class: 'sub', text: 'Every 20-question block · shaded = legacy' }))),
    D.scores.length ? h('div', { class: 'chart amb-chart-box' }, chart(D)) : h('p', { class: 'sub', text: 'No blocks yet.' }),
    h('div', { class: 'chart-foot' }, chartLegend()));
  const foc = h('section', { class: 'card', 'aria-labelledby': 'amb-foc-h' },
    h('div', { class: 'sec-head' }, h('div', null, h('h3', { id: 'amb-foc-h', text: 'Focus next' }), h('p', { class: 'sub', text: 'Recent and repeated misses weigh more' }))),
    focusList(D, focus(D, e)));

  const whyCard = h('section', { class: 'card', 'aria-labelledby': 'amb-why-h' },
    h('div', { class: 'sec-head' }, h('h3', { id: 'amb-why-h', text: 'Why you miss' })),
    h('div', { class: 'amb-why' }, whyBar(D, w.recent, 'Last 3 review sets'), whyBar(D, w.all, 'All in scope')), errLegend(D),
    w.top && TIPS[w.top] ? h('p', { class: 'amb-tip' }, h('b', { text: 'Fix first. ' }), TIPS[w.top]) : null);
  const estCard = h('section', { class: 'card', 'aria-labelledby': 'amb-est-h' },
    h('div', { class: 'sec-head' }, h('div', null, h('h3', { id: 'amb-est-h', text: 'Accuracy by system' }), h('p', { class: 'sub', text: 'Estimated · weakest first' }))),
    est.length ? h('div', { class: 'amb-est' }, est.map((r) => h('div', { class: 'amb-est-row', title: '≈' + Math.round(r.seen) + ' questions seen · ' + r.I + ' incorrect · ' + r.U + ' unstable' },
      h('span', { class: 'lbl', text: sysName(D, r.system) }),
      h('span', { class: 'amb-meter' }, h('i', { class: r.acc < 60 ? 'lo' : r.acc < 70 ? 'mid' : 'hi', style: 'width:' + Math.max(0, Math.min(100, r.acc)) + '%' })),
      h('span', { class: 'val num', text: Math.round(r.acc) + '%' })))) : h('p', { class: 'sub', text: 'Shows once a system has about 8 questions.' }),
    h('p', { class: 'hint', text: 'Questions per system are inferred from your selection and the exam blueprint, not counted.' + (D.unplaced ? ' ' + D.unplaced + (D.unplaced === 1 ? ' miss' : ' misses') + ' outside the selection left out.' : '') }));

  const heatCard = h('section', { class: 'card', 'aria-labelledby': 'amb-heat-h' },
    h('div', { class: 'sec-head' }, h('div', null, h('h3', { id: 'amb-heat-h', text: 'Systems × review set' }), h('p', { class: 'sub', text: 'Reviewed questions (incorrect + unstable) · darker = more · ● = in your selection' }))),
    ht.rows.length ? h('div', { class: 'amb-heat-w' }, h('table', { class: 'amb-heat' },
      h('thead', null, h('tr', null, h('th', { text: 'System' }), ht.sets.map((s) => h('th', { class: 'n', text: s })), h('th', { class: 'n', text: 'Total' }), h('th', { text: 'Trend' }))),
      h('tbody', null, ht.rows.map((r) => h('tr', null,
        h('td', { class: 'amb-sys', title: sysName(D, r.system) }, r.sel ? h('span', { class: 'amb-sel', 'aria-label': 'in your selection' }) : null, r.system),
        r.cells.map((c, i) => {
          if (!c) return h('td', { class: 'c' });
          const a = Math.round(14 + 70 * c.n / ht.max);
          return h('td', { class: 'c' + (a > 50 ? ' dark' : ''), title: r.system + ' · ' + ht.sets[i] + ': ' + c.I + ' incorrect, ' + c.U + ' unstable', style: 'background:color-mix(in srgb,var(--s2) ' + a + '%,var(--panel))', text: c.n });
        }),
        h('td', { class: 'n num', text: r.total }),
        h('td', { class: 'tr ' + r.trend, text: { more: '▲ more', fewer: '▼ fewer', steady: 'steady' }[r.trend] || '' })))))) : h('p', { class: 'sub', text: 'Nothing reviewed in this scope yet.' }));

  const subj = h('section', { class: 'card' }, h('div', { class: 'sec-head' }, h('h3', { text: 'Subjects' }), iuKey()), iuBars(D, groups(D, e, 'subject'), (k) => D.subjects[k] || k));
  const qt = h('section', { class: 'card' }, h('div', { class: 'sec-head' }, h('h3', { text: 'Question types' }), iuKey()), iuBars(D, groups(D, e, 'qtype'), (k) => k));
  const bat = h('section', { class: 'card' }, h('div', { class: 'sec-head' }, h('div', null, h('h3', { text: 'Batches' }), h('p', { class: 'sub', text: 'Current era' }))),
    bt.length ? h('table', { class: 'amb-tbl' },
      h('thead', null, h('tr', null, ['Set', 'Qs', 'Acc', 'Stable', 'I', 'U'].map((t, i) => h('th', { class: i ? 'n' : '', text: t })))),
      h('tbody', null, bt.map((b) => h('tr', null, h('td', { text: b.set }), h('td', { class: 'n', text: b.n_q }), h('td', { class: 'n', text: pct1(b.pct) }),
        h('td', { class: 'n', text: pct1(b.stable_pct) }), h('td', { class: 'n', text: b.I }), h('td', { class: 'n', text: b.U }))))) : h('p', { class: 'sub', text: 'Your first batch will show here.' }));

  return h('div', { class: 'amb-dash' }, tiles,
    h('div', { class: 'grid-wide' }, acc, foc),
    h('div', { class: 'grid2' }, whyCard, estCard),
    heatCard,
    h('div', { class: 'amb-grid3' }, subj, qt, bat));
}
const iuKey = () => h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:var(--bad)' }), 'I'), h('span', null, h('i', { style: 'background:var(--warn)' }), 'U'));

// ---------- the question browser ----------
function questions(D, e) {
  const f = ui.ambF = ui.ambF || { system: '', status: '', error: '', set: '', q: '' };
  const opts = filterOptions(D, e);
  if (f.system && !opts.systems.includes(f.system)) f.system = '';
  if (f.set && !opts.sets.includes(f.set)) f.set = '';
  const sel = (key, first, items) => {
    const el = h('select', { 'aria-label': first, 'data-f': key, onchange: () => { f[key] = el.value; ui.ambShown = 0; render(); } },
      h('option', { value: '', text: first }), items.map(([v, l]) => h('option', { value: v, text: l })));
    el.value = f[key];
    return el;
  };
  const search = h('input', { type: 'search', id: 'amb-q', placeholder: 'Search topic, board call, trap…', 'aria-label': 'Search questions', value: f.q });
  search.addEventListener('input', () => { f.q = search.value; ui.ambShown = 0; drawList(); });
  const listBox = h('div', { class: 'amb-qlist' }), count = h('span', { class: 'sub amb-qct' });
  const drawList = () => {
    const L = browse(D, e, f), n = ui.ambShown || 40;
    count.textContent = plural(L.length, 'question');
    listBox.replaceChildren(...(L.length ? L.slice(0, n).map((q) => qRow(D, q)) : [h('p', { class: 'sub', text: 'No questions match.' })]),
      ...(L.length > n ? [h('button', { class: 'btn ghost amb-more', onclick: () => { ui.ambShown = n + 40; drawList(); } }, 'Show more (' + (L.length - n) + ')')] : []));
  };
  drawList();
  return h('section', { class: 'card amb-qcard', 'aria-label': 'Reviewed questions' },
    h('div', { class: 'amb-filters' },
      sel('system', 'All systems', opts.systems.map((s) => [s, s])),
      sel('status', 'Incorrect + unstable', [['I', 'Incorrect'], ['U', 'Unstable'], ['?', 'Unknown']]),
      sel('error', 'All miss reasons', Object.entries(D.errors)),
      sel('set', 'All review sets', opts.sets.map((s) => [s, s])),
      search, count),
    listBox);
}
function qRow(D, q) {
  return h('details', { class: 'amb-q', 'data-q': q.id },
    h('summary', null,
      h('span', { class: 'amb-tag ' + (q.status === '?' ? 'X' : q.status), text: D.statuses[q.status] || q.status }),
      h('span', { class: 'amb-qset num', text: q.set }),
      h('span', { class: 'amb-qsys', text: q.system, title: sysName(D, q.system) }),
      h('span', { class: 'amb-qt' }, h('b', { text: q.topic || '—' }), h('span', { class: 'amb-qcall', text: plain(q.call) }))),
    h('div', { class: 'amb-qbody' },
      q.call ? h('p', null, h('b', { text: 'Board call ' }), plain(q.call)) : null,
      q.hinge ? h('p', null, h('b', { text: 'Hinge ' }), plain(q.hinge)) : null,
      q.trap ? h('p', null, h('b', { text: 'Trap ' }), plain(q.trap)) : null,
      q.selected ? h('p', null, h('b', { text: 'You picked ' }), plain(q.selected)) : null,
      h('p', { class: 'sub', text: [D.subjects[q.subject] || q.subject, D.errors[q.error] || '', q.qtype].filter(Boolean).join(' · ') })));
}
