// A printable summary: test date and outlook, every assessment, the score trend, CMS by subject, qbanks,
// articles and the recurring weak systems as a waffle chart. One page while it fits; otherwise the waffle
// moves to a second page. Built fresh right before printing (the Print button, or the browser's own
// Print), and only shown on paper.

import { $, avg, daysUntil, fmtDate, fmtK, fmtLong, fmtPct, h, nn, num, plural, today } from './util.js?v=27';
import { FORM_ST, PASSES, SUBJ } from './catalog.js?v=27';
import { item, state, sysItem } from './store.js?v=27';
import { allArticles, allCms, allSystems, allTests, artItem, chrono, cmsForms, outlook, pctOf, qbStats, retakeOf, scaledOf, shortSys, taken, weakPattern, weakShade } from './data.js?v=27';
import { estimateScore } from './calculator.js?v=27';
import { plannedForms } from './planner.js?v=27';

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
  const step = Math.ceil(pts.length / Math.floor((W - m.l - m.r) / 24)); // labels never crowd
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pr-trend', role: 'img', 'aria-label': 'Score trend' });
  for (let v = lo; v <= hi; v += (hi - lo > 40 ? 20 : 10)) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: '#ddd', 'stroke-width': .6 }));
    svg.append(s('text', { x: m.l - 4, y: y(v) + 3, 'text-anchor': 'end', 'font-size': 8, fill: '#777' }, String(v)));
  }
  if (target) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(target), y2: y(target), stroke: '#1a7f4b', 'stroke-width': .8, 'stroke-dasharray': '3 3' }));
    svg.append(s('text', { x: m.l + 3, y: y(target) - 3, 'text-anchor': 'start', 'font-size': 8, fill: '#1a7f4b' }, 'target ' + target));
  }
  svg.append(s('polyline', { points: pts.map((p, i) => x(i) + ',' + y(p.v)).join(' '), fill: 'none', stroke: '#222', 'stroke-width': 1.4 }));
  pts.forEach((p, i) => {
    svg.append(s('circle', { cx: x(i), cy: y(p.v), r: 2.4, fill: '#fff', stroke: '#222', 'stroke-width': 1.2 }));
    if ((pts.length - 1 - i) % step === 0) svg.append(s('text', { x: x(i), y: H - 4, 'text-anchor': 'middle', 'font-size': 7, fill: '#777' }, p.f.tag));
  });
  // the score on the first, best and latest points
  const best = pts.reduce((b, p, i) => (p.v > pts[b].v ? i : b), 0);
  [...new Set([0, best, pts.length - 1])].forEach((i) => svg.append(s('text', { x: Math.min(W - m.r - 8, Math.max(m.l + 8, x(i))), y: y(pts[i].v) - 6,
    'text-anchor': 'middle', 'font-size': 8, 'font-weight': 700, fill: '#222', class: 'pr-tv' }, String(Math.round(pts[i].v)))));
  return svg;
}

// The weakness matrix on paper, like the overview's: a row per system (most often weak first), a column
// per marked assessment (oldest → newest) then finished qbanks, filled where it came up weak, shaded and
// labelled with your error counts or %, and how many times in all. Cells shrink to fit every column.
function weakWaffle(wp) {
  const { rows, sources } = wp, total = sources.length;
  // the cells share the page width left after the names (32 mm) and totals (24 mm)
  const cell = Math.max(7, Math.min(rows.length > 12 ? 12 : 15, Math.floor(492 / (total + 0.3)) - 2)), label = cell >= 12;
  const nT = sources.filter((x) => x.kind === 'test').length, nQ = total - nT;
  // a thin gap column sets the finished qbanks apart from the assessments
  const gap = (i) => nT && nQ && i === nT ? [h('span')] : [];
  const cols = `grid-template-columns:32mm${nT ? ` repeat(${nT},${cell}px)` : ''}${nT && nQ ? ' 3px' : ''}${nQ ? ` repeat(${nQ},${cell}px)` : ''} 24mm`;
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
          style: `width:${cell}px;height:${cell}px`, text: label && sh && sh.text.length <= (cell >= 14 ? 3 : 2) ? sh.text : null })];
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

// One layout: every assessment on one line (its retake beside it, how many systems were weak), CMS, qbanks,
// the score trend and articles beside it, and the recurring weak systems as a waffle across the bottom.
// `two` only when that doesn't fit one page: the waffle moves to page 2.
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

  const anyRetake = done.some((f) => retakeOf(f)), anyWeak = done.some((f) => item(f.id).weak.length);
  const rows = done.map((f) => {
    const it = item(f.id), s3 = scaledOf(f), p = pctOf(f);
    const est = s3 == null && p != null ? estimateScore(f, p) : null;
    const rt = retakeOf(f);
    return h('tr', null, h('td', { class: 'nw', text: f.full }), h('td', { class: 'nw', text: fmtDate(it.date) }),
      h('td', { class: 'n', text: s3 != null ? String(s3) : est ? '≈' + est.score : '' }),
      h('td', { class: 'n', text: p != null ? fmtPct(p) : '' }),
      anyRetake ? h('td', { class: 'nw pr-rt', text: rt ? '↻ ' + [rt.s, rt.p != null ? fmtPct(rt.p) : null].filter(nn).join(' · ') + ' · ' + fmtDate(rt.date) : '' }) : null,
      h('td', { class: 'nw', text: FORM_ST[it.status] }),
      anyWeak ? h('td', { class: 'n', text: it.weak.length ? String(it.weak.length) : '' }) : null);
  });
  const planned = plannedForms();
  const heads = ['Form', 'Date', 'Score', '%', anyRetake ? 'Retake' : null, 'Status', anyWeak ? 'Weak' : null].filter(Boolean);

  const assess = h('section', { class: 'pr-sec pr-assess' }, h('h2', { text: 'Assessments' }),
    done.length ? h('table', { class: 'pr-table' },
      h('thead', null, h('tr', null, heads.map((x) => h('th', { class: ['Score', '%', 'Weak'].includes(x) ? 'n' : '', text: x })))),
      h('tbody', null, rows)) : h('p', { class: 'pr-muted', text: 'No assessments taken yet.' }),
    planned.length ? h('p', { class: 'pr-line' }, h('b', { text: 'Planned: ' }), planned.slice(0, 8).map((f) => f.full + ' ' + fmtDate(item(f.id).plan)).join(' · ')) : null,
    done.length ? h('p', { class: 'pr-muted', text: '≈ = estimated from % correct.' + (anyWeak ? ' Weak = systems marked weak (charted ' + (two ? 'on page 2' : 'below') + ').' : '') }) : null);
  const trend = o.pts.length >= 2 ? sec('Score trend', trendSvg(o.pts, tgt, 250, 150)) : null;

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
  const weakSec = h('section', { class: 'pr-sec pr-weaksec' },
    h('h2', null, 'Recurring weak systems', wp.rows.length ? h('small', { text: plural(wp.nTests, 'assessment') + (wp.nBanks ? ' and ' + plural(wp.nBanks, 'finished qbank') : '') + ' marked · columns oldest → newest' }) : null),
    wp.rows.length ? weakWaffle(wp) : h('p', { class: 'pr-muted', text: 'None marked yet.' }));

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
    stat('AMBOSS articles', read + '/' + arts.length, fin ? fin + ' read ' + PASSES + '×' : 'read'));

  // Assessments | score trend, CMS, qbanks, articles; the weak-system waffle across the bottom.
  return h('div', { class: 'pr-page' + (two ? ' pr-two' : '') }, head, stats,
    h('div', { class: 'pr-cols' }, h('div', { class: 'pr-col' }, assess), h('div', { class: 'pr-col' }, trend, cmsSec, qbSec)),
    two ? h('div', { class: 'pr-p2' }, h('header', { class: 'pr-head pr-head2' }, h('h1', null, 'Thunder tracker'), h('p', { text: 'Page 2 · ' + fmtLong(today()) })), weakSec) : weakSec);
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
