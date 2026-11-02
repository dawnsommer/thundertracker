// A printable summary: test date and outlook, every assessment, the score trend, CMS by subject, qbanks,
// recurring weak systems and articles. One page while it fits; a long history gets a second page with the
// weak systems as a waffle chart. Built fresh right before printing (the Print button, or the browser's own
// Print), and only shown on paper.

import { $, avg, daysUntil, fmtDate, fmtK, fmtLong, fmtPct, h, nn, num, plural, today } from './util.js?v=24';
import { FORM_ST, PASSES, SUBJ } from './catalog.js?v=24';
import { item, state, sysItem } from './store.js?v=24';
import { allArticles, allCms, allSystems, allTests, artItem, chrono, cmsForms, outlook, pctOf, qbStats, retakeOf, scaledOf, shortSys, taken, weakNames, weakPattern, weakShade } from './data.js?v=24';
import { estimateScore } from './calculator.js?v=24';
import { plannedForms } from './planner.js?v=24';

// Printable area in mm (11 × 10 mm margins) of Letter and A4, less a little slack. Letter is wider, A4 taller;
// the summary keeps to one page only when it fits both.
const PAGES = [[195.9, 255], [190, 273]];

function trendSvg(pts, target, W = 340, H = 110) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = (tag, a, text) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); if (text != null) e.textContent = text; return e; };
  const m = { l: 30, r: 8, t: 8, b: 16 };
  const vals = pts.map((p) => p.v).concat(target ? [target] : []);
  const lo = Math.floor((Math.min(...vals) - 5) / 10) * 10, hi = Math.ceil((Math.max(...vals) + 5) / 10) * 10;
  const x = (i) => m.l + (pts.length === 1 ? (W - m.l - m.r) / 2 : i * (W - m.l - m.r) / (pts.length - 1));
  const y = (v) => m.t + (hi - v) / (hi - lo || 1) * (H - m.t - m.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pr-trend', role: 'img', 'aria-label': 'Score trend' });
  for (let v = lo; v <= hi; v += (hi - lo > 40 ? 20 : 10)) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: '#ddd', 'stroke-width': .6 }));
    svg.append(s('text', { x: m.l - 4, y: y(v) + 3, 'text-anchor': 'end', 'font-size': 8, fill: '#777' }, String(v)));
  }
  if (target) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(target), y2: y(target), stroke: '#1a7f4b', 'stroke-width': .8, 'stroke-dasharray': '3 3' }));
    svg.append(s('text', { x: W - m.r, y: y(target) - 3, 'text-anchor': 'end', 'font-size': 8, fill: '#1a7f4b' }, 'target ' + target));
  }
  svg.append(s('polyline', { points: pts.map((p, i) => x(i) + ',' + y(p.v)).join(' '), fill: 'none', stroke: '#222', 'stroke-width': 1.4 }));
  pts.forEach((p, i) => {
    svg.append(s('circle', { cx: x(i), cy: y(p.v), r: 2.4, fill: '#fff', stroke: '#222', 'stroke-width': 1.2 }));
    svg.append(s('text', { x: x(i), y: H - 4, 'text-anchor': 'middle', 'font-size': 7, fill: '#777' }, p.f.tag));
  });
  return svg;
}

// The weakness matrix on paper, like the overview's: a row per system (most often weak first), a column
// per marked assessment (oldest → newest) then finished qbanks, filled where it came up weak, shaded and
// labelled with your error counts or %, and how many times in all. Cells shrink to fit every column.
function weakWaffle(wp) {
  const { rows, sources } = wp, total = sources.length;
  const cell = Math.max(7, Math.min(17, Math.floor(500 / total) - 2)), label = cell >= 13;
  const nT = sources.filter((x) => x.kind === 'test').length, nQ = total - nT;
  // a thin gap column sets the finished qbanks apart from the assessments
  const gap = (i) => nT && nQ && i === nT ? [h('span')] : [];
  const cols = `grid-template-columns:30mm${nT ? ` repeat(${nT},${cell}px)` : ''}${nT && nQ ? ' 3px' : ''}${nQ ? ` repeat(${nQ},${cell}px)` : ''} 24mm`;
  const head = h('div', { class: 'pw-row pw-head', style: cols },
    h('span'),
    sources.flatMap((src, i) => [...gap(i), h('span', { class: 'pw-col' + (src.kind === 'qbank' ? ' qb' : ''), text: src.tag })]),
    h('span', { class: 'pw-tot', text: 'times' }));
  const body = rows.map((r) => {
    const hit = new Set(r.hits.map((x) => x.key)), n = r.hits.length;
    return h('div', { class: 'pw-row' + (n >= 2 ? ' rec' : ''), style: cols },
      h('span', { class: 'pw-name' }, shortSys(r.sy.name), r.recent ? h('i', { class: 'pw-recent' }) : null),
      sources.flatMap((src, i) => {
        const on = hit.has(src.key), sh = on ? weakShade(src, r.sy) : null;
        return [...gap(i), h('span', { class: 'pw-cell' + (on ? ' on' + (src.kind === 'qbank' ? ' qb' : '') + (sh ? sh.cls : '') : ''),
          style: `width:${cell}px;height:${cell}px`, text: label && sh && sh.text.length <= 3 ? sh.text : null })];
      }),
      h('span', { class: 'pw-tot' }, h('b', { text: String(n) }), h('span', { class: 'pw-bar' }, h('i', { style: 'width:' + (n / total * 100) + '%' }))));
  });
  const kinds = new Set(rows.flatMap((r) => r.hits.map((src) => (weakShade(src, r.sy) || {}).kind)).filter(Boolean));
  const sw = (cls) => h('i', { class: 'pw-cell on' + cls });
  return [h('div', { class: 'pw' }, head, body),
    h('p', { class: 'pw-legend' },
      h('span', null, sw(''), 'weak in an assessment'),
      wp.nBanks ? h('span', null, sw(' qb'), 'weak in a qbank') : null,
      h('span', null, h('i', { class: 'pw-recent' }), 'weak in your last 2 assessments'),
      kinds.has('n') ? h('span', null, sw(' sh1'), sw(' sh2'), sw(' sh3'), 'errors·unstable (under 3 · 3–4 · 5+)') : null,
      kinds.has('pct') ? h('span', null, sw(' qb sh1'), sw(' qb sh2'), sw(' qb sh3'), '% correct (65+ · 55–64 · under 55)') : null,
      h('span', { text: 'bold = 2× or more' }))];
}

// `two`: the two-page layout for a long history. Page 1 keeps the numbers (every assessment on one line,
// CMS, qbanks, articles); page 2 has the score trend at full width and the recurring weak systems as a waffle.
export function buildSummary(two = false) {
  const P = state.prefs, ex = P.examDate, dl = ex ? daysUntil(ex) : null, tgt = num(P.target);
  const o = outlook(), qb = qbStats(), wp = weakPattern();
  const tests = allTests(), done = tests.filter(taken).map((f) => ({ f, it: item(f.id) })).sort(chrono).map((x) => x.f);
  const cms = allCms(), cDone = cms.filter(taken), cAvg = avg(cDone.map(pctOf).filter(nn));
  const sys = allSystems(), sRev = sys.filter((x) => sysItem(x.id).status === 3).length;
  const arts = allArticles(), read = arts.filter((a) => artItem(a.id).reads > 0).length, fin = arts.filter((a) => artItem(a.id).reads >= PASSES).length;
  const stat = (label, big, small) => h('div', { class: 'pr-stat' }, h('span', { text: label }), h('b', { text: big }), small ? h('small', { text: small }) : null);
  const sec = (title, ...kids) => h('section', { class: 'pr-sec' }, h('h2', { text: title }), ...kids);

  const outBig = o.proj != null ? String(Math.round(o.proj)) : o.recent != null ? String(Math.round(o.recent)) : '—';
  const outSmall = o.proj != null ? 'projected for test day' : o.recent != null ? (o.pts.length >= 3 ? 'average of last 3' : 'average') : 'no 3-digit scores yet';

  // On two pages a retake shares its form's line and the weak systems move to the waffle (the table keeps
  // how many were marked); on one page a retake gets its own line under the first attempt.
  const rows = done.flatMap((f) => {
    const it = item(f.id), s3 = scaledOf(f), p = pctOf(f);
    const est = s3 == null && p != null ? estimateScore(f, p) : null;
    const rt = retakeOf(f);
    const first = [h('td', { class: 'nw', text: f.full }), h('td', { class: 'nw', text: fmtDate(it.date) }),
      h('td', { class: 'n', text: s3 != null ? String(s3) : est ? '≈' + est.score : '' }),
      h('td', { class: 'n', text: p != null ? fmtPct(p) : '' })];
    if (two) return [h('tr', null, first,
      h('td', { class: 'nw pr-rt', text: rt ? '↻ ' + [rt.s, rt.p != null ? fmtPct(rt.p) : null].filter(nn).join(' · ') + ' · ' + fmtDate(rt.date) : '' }),
      h('td', { class: 'nw', text: FORM_ST[it.status] }),
      h('td', { class: 'n', text: it.weak.length ? String(it.weak.length) : '' }))];
    return [h('tr', null, first, h('td', { class: 'nw', text: FORM_ST[it.status] }), h('td', { class: 'wk', text: weakNames(it.weak) })),
      ...(rt ? [h('tr', { class: 'pr-re' },
        h('td', { class: 'nw', text: '↻ retake' }), h('td', { class: 'nw', text: fmtDate(rt.date) }),
        h('td', { class: 'n', text: rt.s != null ? String(rt.s) : '' }),
        h('td', { class: 'n', text: rt.p != null ? fmtPct(rt.p) : '' }),
        h('td'), h('td'))] : [])];
  });
  const planned = plannedForms();
  const heads = two ? ['Form', 'Date', 'Score', '%', 'Retake', 'Status', 'Weak'] : ['Form', 'Date', 'Score', '%', 'Status', 'Weak systems'];

  const assess = h('section', { class: 'pr-sec pr-assess' }, h('h2', { text: 'Assessments' }),
    done.length ? h('table', { class: 'pr-table' },
      h('thead', null, h('tr', null, heads.map((x, i) => h('th', { class: i === 2 || i === 3 || x === 'Weak' ? 'n' : '', text: x })))),
      h('tbody', null, rows)) : h('p', { class: 'pr-muted', text: 'No assessments taken yet.' }),
    planned.length ? h('p', { class: 'pr-line' }, h('b', { text: 'Planned: ' }), planned.slice(0, 8).map((f) => f.full + ' ' + fmtDate(item(f.id).plan)).join(' · ')) : null,
    h('p', { class: 'pr-muted', text: '≈ = estimated from % correct.' + (two ? ' Weak = systems marked weak; they are charted on page 2.' : '') }));
  const trend = o.pts.length >= 2 ? sec('Score trend', two ? trendSvg(o.pts, tgt, 700, 150) : trendSvg(o.pts, tgt)) : null;

  const cmsSec = sec('CMS by subject', h('table', { class: 'pr-table' },
    h('tbody', null, SUBJ.map((s) => {
      const fs = cmsForms(s, P.showOld), d = fs.filter(taken), a = avg(fs.map(pctOf).filter(nn));
      return h('tr', null, h('td', { text: s.name }), h('td', { class: 'n', text: d.length + '/' + fs.length }), h('td', { class: 'n', text: a != null ? fmtPct(a) : '—' }));
    }))));
  const qbSec = sec('Qbanks', qb.banks.length ? h('table', { class: 'pr-table' }, h('tbody', null, qb.banks.map((b) =>
    h('tr', null, h('td', { text: b.qb.name + (b.finished ? ' ✓' : '') }),
      h('td', { class: 'n', text: b.pctDone != null ? fmtPct(b.pctDone) + ' done' : b.done ? fmtK(b.done) + ' Qs' : '—' }),
      h('td', { class: 'n', text: b.acc != null ? fmtPct(b.acc) : '—' }))))) : h('p', { class: 'pr-muted', text: 'No qbanks yet.' }),
    qb.total ? h('p', { class: 'pr-line', text: fmtK(qb.total) + ' questions' + (qb.acc != null ? ' · ' + fmtPct(qb.acc) + ' correct overall' : '') + (qb.week ? ' · ' + qb.week + ' this week' : '') }) : null);
  const recurring = wp.rows.filter((r) => r.hits.length >= 2);
  const weakSec = two
    ? sec('Recurring weak systems', recurring.length
      ? h('p', { class: 'pr-line' }, recurring.slice(0, 5).map((r) => shortSys(r.sy.name) + ' ' + r.hits.length + '×').join(' · '))
      : h('p', { class: 'pr-muted', text: 'No system has come up weak twice yet.' }), h('p', { class: 'pr-muted', text: 'Full chart on page 2.' }))
    : sec('Recurring weak systems', wp.rows.length
      ? h('ol', { class: 'pr-weak' }, wp.rows.slice(0, 8).map((r) => h('li', null, h('b', { text: shortSys(r.sy.name) }), ' ' + r.hits.length + '× — ' + r.hits.slice(-6).map((x) => x.tag).join(', ') + (r.hits.length > 6 ? ' …' : ''))))
      : h('p', { class: 'pr-muted', text: 'None marked yet.' }));
  const artSec = sec('AMBOSS articles', h('p', { class: 'pr-line', text: read + ' of ' + arts.length + ' read' + (fin ? ' · ' + fin + ' read ' + PASSES + '×' : '') }));

  const head = h('header', { class: 'pr-head' },
    h('div', null, h('h1', null, 'Thunder tracker'), h('p', { text: 'USMLE Step 2 CK · summary printed ' + fmtLong(today()) })),
    h('div', { class: 'pr-exam' }, ex ? h('b', { text: fmtLong(ex) }) : h('b', { text: 'Test date not set' }),
      ex ? h('span', { text: dl > 0 ? plural(dl, 'day') + ' to go' : dl === 0 ? 'today' : 'done' }) : null,
      tgt ? h('span', { text: 'target ' + tgt }) : null));
  const stats = h('div', { class: 'pr-stats' },
    stat('Score outlook', outBig, outSmall + (o.best != null ? ' · best ' + o.best : '')),
    stat('Assessments', done.length + '/' + tests.length, planned.length ? planned.length + ' planned' : ''),
    stat('CMS forms', cDone.length + '/' + cms.length, cAvg != null ? 'avg ' + fmtPct(cAvg) : ''),
    stat('Qbank', fmtK(qb.total), qb.acc != null ? fmtPct(qb.acc) + ' correct' : 'questions'),
    stat('Systems revised', sRev + '/' + sys.length, ''),
    stat('Articles read', read + '/' + arts.length, ''));

  if (!two) return h('div', { class: 'pr-page' }, head, stats,
    h('div', { class: 'pr-cols' }, h('div', { class: 'pr-col' }, assess, trend), h('div', { class: 'pr-col' }, cmsSec, qbSec, weakSec, artSec)));

  return h('div', { class: 'pr-page pr-two' },
    h('div', { class: 'pr-p1' }, head, stats,
      h('div', { class: 'pr-cols' }, h('div', { class: 'pr-col' }, assess), h('div', { class: 'pr-col' }, cmsSec, qbSec, weakSec, artSec))),
    h('div', { class: 'pr-p2' },
      h('header', { class: 'pr-head pr-head2' }, h('h1', null, 'Thunder tracker'), h('p', { text: 'Page 2 · ' + fmtLong(today()) })),
      trend,
      sec('Recurring weak systems', wp.rows.length
        ? [h('p', { class: 'pr-muted pr-sub', text: plural(wp.nTests, 'assessment') + (wp.nBanks ? ' and ' + plural(wp.nBanks, 'finished qbank') : '') + ' marked · columns oldest → newest' }), ...weakWaffle(wp)]
        : h('p', { class: 'pr-muted', text: 'None marked yet.' }))));
}

// One page when everything fits (measured off screen at each printable width), otherwise two.
function fitsOnePage(el) {
  const s = sheet();
  s.classList.add('pr-measure'); s.replaceChildren(el);
  const fits = PAGES.every(([w, hgt]) => { s.style.width = w + 'mm'; return el.getBoundingClientRect().height / (96 / 25.4) <= hgt; });
  s.classList.remove('pr-measure'); s.style.width = '';
  return fits;
}

// Kept in the page so Ctrl/Cmd+P prints the summary too.
const sheet = () => $('print-sheet') || document.body.appendChild(h('div', { id: 'print-sheet', 'aria-hidden': 'true' }));
export function preparePrint() {
  const one = buildSummary();
  sheet().replaceChildren(fitsOnePage(one) ? one : buildSummary(true));
}
export function printSummary() { preparePrint(); window.print(); }
window.addEventListener('beforeprint', preparePrint);
$('print-btn').addEventListener('click', printSummary);
