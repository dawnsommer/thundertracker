// A printable one-page summary: test date and outlook, every assessment with its weak systems, the score
// trend, CMS by subject, qbanks, recurring weak systems and articles. Built fresh right before printing
// (the Print button, or the browser's own Print), and only shown on paper.

import { $, avg, daysUntil, fmtDate, fmtK, fmtLong, fmtPct, h, nn, num, plural, today } from './util.js?v=23';
import { FORM_ST, PASSES, SUBJ } from './catalog.js?v=23';
import { item, state, sysItem } from './store.js?v=23';
import { allArticles, allCms, allSystems, allTests, artItem, chrono, cmsForms, outlook, pctOf, qbStats, retakeOf, scaledOf, shortSys, taken, weakNames, weakPattern } from './data.js?v=23';
import { estimateScore } from './calculator.js?v=23';
import { plannedForms } from './planner.js?v=23';

const MAX_ROWS = 18; // assessments that fit on the page; the oldest drop off first

function trendSvg(pts, target) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = (tag, a, text) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); if (text != null) e.textContent = text; return e; };
  const W = 340, H = 110, m = { l: 30, r: 8, t: 8, b: 16 };
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

export function buildSummary() {
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

  const shown = done.slice(-MAX_ROWS);
  const rows = shown.flatMap((f) => {
    const it = item(f.id), s3 = scaledOf(f), p = pctOf(f);
    const est = s3 == null && p != null ? estimateScore(f, p) : null;
    const rt = retakeOf(f);
    return [h('tr', null,
      h('td', { class: 'nw', text: f.full }), h('td', { class: 'nw', text: fmtDate(it.date) }),
      h('td', { class: 'n', text: s3 != null ? String(s3) : est ? '≈' + est.score : '' }),
      h('td', { class: 'n', text: p != null ? fmtPct(p) : '' }),
      h('td', { text: FORM_ST[it.status] }),
      h('td', { class: 'wk', text: weakNames(it.weak) })),
    ...(rt ? [h('tr', null,
      h('td', { class: 'nw', text: '↻ retake' }), h('td', { class: 'nw', text: fmtDate(rt.date) }),
      h('td', { class: 'n', text: rt.s != null ? String(rt.s) : '' }),
      h('td', { class: 'n', text: rt.p != null ? fmtPct(rt.p) : '' }),
      h('td'), h('td'))] : [])];
  });
  const planned = plannedForms();

  const left = h('div', { class: 'pr-col' },
    sec('Assessments',
      done.length ? h('table', { class: 'pr-table' },
        h('thead', null, h('tr', null, ['Form', 'Date', 'Score', '%', 'Status', 'Weak systems'].map((x) => h('th', { class: x === 'Score' || x === '%' ? 'n' : '', text: x })))),
        h('tbody', null, rows)) : h('p', { class: 'pr-muted', text: 'No assessments taken yet.' }),
      done.length > shown.length ? h('p', { class: 'pr-muted', text: plural(done.length - shown.length, 'older form') + ' not shown.' }) : null,
      planned.length ? h('p', { class: 'pr-line' }, h('b', { text: 'Planned: ' }), planned.slice(0, 8).map((f) => f.full + ' ' + fmtDate(item(f.id).plan)).join(' · ')) : null,
      h('p', { class: 'pr-muted', text: '≈ = estimated from % correct.' })),
    o.pts.length >= 2 ? sec('Score trend', trendSvg(o.pts, tgt)) : null);

  const right = h('div', { class: 'pr-col' },
    sec('CMS by subject', h('table', { class: 'pr-table' },
      h('tbody', null, SUBJ.map((s) => {
        const fs = cmsForms(s, P.showOld), d = fs.filter(taken), a = avg(fs.map(pctOf).filter(nn));
        return h('tr', null, h('td', { text: s.name }), h('td', { class: 'n', text: d.length + '/' + fs.length }), h('td', { class: 'n', text: a != null ? fmtPct(a) : '—' }));
      })))),
    sec('Qbanks', qb.banks.length ? h('table', { class: 'pr-table' }, h('tbody', null, qb.banks.map((b) =>
      h('tr', null, h('td', { text: b.qb.name + (b.finished ? ' ✓' : '') }),
        h('td', { class: 'n', text: b.pctDone != null ? fmtPct(b.pctDone) + ' done' : b.done ? fmtK(b.done) + ' Qs' : '—' }),
        h('td', { class: 'n', text: b.acc != null ? fmtPct(b.acc) : '—' }))))) : h('p', { class: 'pr-muted', text: 'No qbanks yet.' }),
      qb.total ? h('p', { class: 'pr-line', text: fmtK(qb.total) + ' questions' + (qb.acc != null ? ' · ' + fmtPct(qb.acc) + ' correct overall' : '') + (qb.week ? ' · ' + qb.week + ' this week' : '') }) : null),
    sec('Recurring weak systems', wp.rows.length
      ? h('ol', { class: 'pr-weak' }, wp.rows.slice(0, 8).map((r) => h('li', null, h('b', { text: shortSys(r.sy.name) }), ' ' + r.hits.length + '× — ' + r.hits.slice(-6).map((x) => x.tag).join(', ') + (r.hits.length > 6 ? ' …' : ''))))
      : h('p', { class: 'pr-muted', text: 'None marked yet.' })),
    sec('AMBOSS articles', h('p', { class: 'pr-line', text: read + ' of ' + arts.length + ' read' + (fin ? ' · ' + fin + ' read ' + PASSES + '×' : '') })));

  return h('div', { class: 'pr-page' },
    h('header', { class: 'pr-head' },
      h('div', null, h('h1', null, 'Thunder tracker'), h('p', { text: 'USMLE Step 2 CK · summary printed ' + fmtLong(today()) })),
      h('div', { class: 'pr-exam' }, ex ? h('b', { text: fmtLong(ex) }) : h('b', { text: 'Test date not set' }),
        ex ? h('span', { text: dl > 0 ? plural(dl, 'day') + ' to go' : dl === 0 ? 'today' : 'done' }) : null,
        tgt ? h('span', { text: 'target ' + tgt }) : null)),
    h('div', { class: 'pr-stats' },
      stat('Score outlook', outBig, outSmall + (o.best != null ? ' · best ' + o.best : '')),
      stat('Assessments', done.length + '/' + tests.length, planned.length ? planned.length + ' planned' : ''),
      stat('CMS forms', cDone.length + '/' + cms.length, cAvg != null ? 'avg ' + fmtPct(cAvg) : ''),
      stat('Qbank', fmtK(qb.total), qb.acc != null ? fmtPct(qb.acc) + ' correct' : 'questions'),
      stat('Systems revised', sRev + '/' + sys.length, ''),
      stat('Articles read', read + '/' + arts.length, '')),
    h('div', { class: 'pr-cols' }, left, right));
}

// Kept in the page so Ctrl/Cmd+P prints the summary too.
const sheet = () => $('print-sheet') || document.body.appendChild(h('div', { id: 'print-sheet', 'aria-hidden': 'true' }));
export function preparePrint() { sheet().replaceChildren(buildSummary()); }
export function printSummary() { preparePrint(); window.print(); }
window.addEventListener('beforeprint', preparePrint);
$('print-btn').addEventListener('click', printSummary);
