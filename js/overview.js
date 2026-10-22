// The Overview tab: tiles, score trend, CMS bars, Up next, activity calendar and the weakness matrix.

import { $, avg, dayNum, daysUntil, fmtDate, fmtK, fmtLong, fmtN, fmtPct, fromDay, h, nn, num, plural, today, weekday } from './util.js?v=13';
import { GROUPS, PASS, SUBJ, SYS_ST } from './catalog.js?v=13';
import { cloud, item, save, state, sysItem, ui } from './store.js?v=13';
import { allArticles, allCms, allSystems, allTests, artItem, band, cmsForms, isEmpty, outlook, pctOf, qbStats, scaledOf, shortSys, taken, trendPoints, weakPattern } from './data.js?v=13';
import { render, showTab } from './shell.js?v=13';
import { openForm } from './assessments.js?v=13';
import { openSystem } from './systems.js?v=13';
import { renderArtSummary } from './articles.js?v=13';
import { openSettings, signIn } from './settings.js?v=13';
import { inDays, openPlanner, plannedForms } from './planner.js?v=13';

export function tile(label, big, small, frac, note) {
  return h('div', { class: 'tile' },
    h('div', { class: 'eyebrow', text: label }),
    h('div', { class: 'big' }, big, small ? h('small', { text: small }) : null),
    frac != null ? h('div', { class: 'meter' }, h('b', { style: 'width:' + Math.round(Math.min(1, frac) * 100) + '%' })) : null,
    note ? h('div', { class: 'note' }, note) : null);
}

export function renderOverview() {
  // welcome
  const wel = $('welcome');
  wel.hidden = !isEmpty();
  if (!wel.hidden) wel.replaceChildren(h('div', { class: 'card welcome' },
    h('h3', { text: 'Welcome to your Step 2 CK tracker' }),
    h('p', { text: 'Everything you log is saved in this browser right away, and works offline. Set your test date first, then tap any form to log it.' }),
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn primary', 'data-open': 'settings', onclick: () => openSettings('#st-exam') }, 'Set test date & target'),
      cloud() && cloud().status().canSignIn ? h('button', { class: 'btn', onclick: () => signIn() }, 'Sign in with Google') : null,
      h('button', { class: 'btn', 'data-open': 'sim-import', onclick: () => $('sim-import').click() }, 'Import from Exam Simulator'),
      h('button', { class: 'btn ghost', onclick: () => $('import').click() }, 'Import a backup')),
    h('p', { class: 'hint', text: 'Signing in with Google keeps your progress in your Google account so it follows you to any device. Used the Step Exam Simulator? Import its progress backup and your NBME, UWSA and CMS results fill in automatically.' })));

  const tests = allTests(), cms = allCms(), sys = allSystems();
  const tTaken = tests.filter(taken), cTaken = cms.filter(taken);
  const o = outlook(), qb = qbStats();
  const ex = state.prefs.examDate, dl = ex ? daysUntil(ex) : null, tgt = num(state.prefs.target);

  const countdown = !ex
    ? tile('Test day', '—', '', null, h('button', { class: 'linkish', 'data-open': 'settings', onclick: () => openSettings('#st-exam') }, 'Set your test date'))
    : tile('Test day', dl > 0 ? String(dl) : dl === 0 ? 'Today' : '✓', dl > 0 ? (dl === 1 ? 'day to go' : 'days to go') : dl < 0 ? 'exam done' : '', null,
      fmtLong(ex) + (dl > 13 ? ' · ' + Math.floor(dl / 7) + ' weeks' : '') + (tgt ? ' · target ' + tgt : ''));

  let outBig = '—', outSmall = '', outNote;
  if (o.proj != null) { outBig = h('span', { class: band('score', o.proj), text: String(Math.round(o.proj)) }); outSmall = 'projected'; }
  else if (o.recent != null) { outBig = h('span', { class: band('score', o.recent), text: String(Math.round(o.recent)) }); outSmall = o.pts.length >= 3 ? 'avg of last 3' : 'average'; }
  if (o.latest) {
    outNote = 'Latest ' + o.latest.v + ' (' + o.latest.f.full + ')' + (o.best !== o.latest.v ? ' · best ' + o.best : '') +
      (o.slope != null ? ' · ' + (o.slope >= 0 ? '+' : '−') + Math.abs(o.slope * 7).toFixed(1) + '/week' : '') +
      (o.proj == null && o.slope != null && !ex ? ' · set a test date to project' : '');
  } else outNote = 'Log NBME or UWSA scores to see your outlook';

  const reviewed = tTaken.filter((f) => item(f.id).status >= 2).length;
  const cScores = cTaken.map(pctOf).filter(nn);
  const sRev = sys.filter((s) => sysItem(s.id).status === 3).length;
  const sAny = sys.filter((s) => sysItem(s.id).status > 0).length;

  $('tiles').replaceChildren(
    countdown,
    tile('Score outlook', outBig, outSmall, null, outNote),
    tile('Assessments', String(tTaken.length), 'of ' + tests.length, tests.length ? tTaken.length / tests.length : 0,
      tTaken.length ? reviewed + ' reviewed · ' + tTaken.filter((f) => item(f.id).status >= 3).length + ' with Anki cards' : 'NBME, UWSA and Free 120'),
    tile('CMS forms', String(cTaken.length), 'of ' + cms.length, cms.length ? cTaken.length / cms.length : 0,
      cScores.length ? 'Average ' + fmtPct(avg(cScores)) + ' correct · ' + cTaken.filter((f) => item(f.id).status >= 2).length + ' reviewed' : 'No scores logged yet'),
    tile('Systems revised', String(sRev), 'of ' + sys.length, sys.length ? sRev / sys.length : 0,
      (sAny ? sAny + ' started' : 'None started yet') + ' · ' + sys.filter((s) => sysItem(s.id).tags.includes('Sketchy')).length + ' Sketchy done'),
    tile('Qbanks', fmtK(qb.total), 'questions', null,
      qb.total || qb.acc != null
        ? [qb.banks.filter((b) => b.pctDone != null).map((b) => b.qb.name + ' ' + fmtPct(b.pctDone)).join(' · '), qb.acc != null ? fmtPct(qb.acc) + ' correct' : ''].filter(Boolean).join(' · ')
        : h('button', { class: 'linkish', onclick: () => showTab('qbank', true) }, 'Add your qbank progress')),
  );

  drawTrend();

  $('sbars').replaceChildren(...SUBJ.map((s) => {
    const fs = cmsForms(s, state.prefs.showOld);
    const cnt = [0, 0, 0, 0];
    fs.forEach((f) => cnt[item(f.id).status]++);
    const a = avg(fs.map(pctOf).filter(nn));
    const tot = fs.length || 1;
    return h('button', { class: 'sbar', onclick: () => { ui.subj = s.key; showTab('cms', true); }, 'aria-label': s.name + ': ' + (cnt[1] + cnt[2] + cnt[3]) + ' of ' + fs.length + ' done' + (a != null ? ', average ' + fmtPct(a) : '') },
      h('span', { class: 'lbl', text: s.name }),
      h('span', { class: 'segbar', 'aria-hidden': 'true' },
        h('span', { style: 'width:' + (cnt[1] / tot * 100) + '%;background:var(--s1)' }),
        h('span', { style: 'width:' + (cnt[2] / tot * 100) + '%;background:var(--s2)' }),
        h('span', { style: 'width:' + (cnt[3] / tot * 100) + '%;background:var(--s3)' })),
      h('span', { class: 'val' }, (cnt[1] + cnt[2] + cnt[3]) + '/' + fs.length,
        a != null ? h('span', { class: band('cms', a), text: ' · ' + fmtPct(a) }) : ' · —'));
  }));

  renderNext(tests, cms, qb, dl);
  renderHeat($('heat'));
  renderWeak($('weak'));
  renderArtSummary($('art-mini'), true);
}

// Weakness matrix: a row per system, a column per marked assessment (oldest → newest) and finished qbank.
// A filled square = weak there. Rows sort by how often a system came up; 2+ is a recurring pattern.
export function renderWeak(box) {
  const { rows, sources, nTests, nBanks } = weakPattern();
  if (!rows.length) {
    box.replaceChildren(h('p', { class: 'sub', text: 'After reviewing an NBME, UWSA or Free 120 — or finishing a qbank — tap the systems you were weak in. The ones that keep coming back show up here.' }),
      h('div', { class: 'btnrow', style: 'margin-top:12px' },
        h('button', { class: 'btn', onclick: () => showTab('nbme', true) }, 'Go to assessments'),
        h('button', { class: 'btn ghost', onclick: () => showTab('qbank', true) }, 'Go to qbanks')));
    return;
  }
  const recurring = rows.filter((r) => r.hits.length >= 2);
  // optional % correct in a weak system: lower % = darker square (UWorld falls back to the system's UW %)
  const pctFor = (src, sy) => num(src.pct[sy.id]) ?? (src.kind === 'qbank' && src.full.startsWith('UWorld') ? num(sysItem(sy.id).uw) : null);
  const shade = (p) => (p == null ? '' : p < 55 ? ' sh3' : p < 65 ? ' sh2' : ' sh1');
  const anyPct = rows.some((r) => r.hits.some((src) => pctFor(src, r.sy) != null));
  const shown = ui.weakAll ? rows : rows.slice(0, 10);
  const total = sources.length;
  const cols = 'grid-template-columns:minmax(7.5rem,9.5rem) repeat(' + sources.length + ',22px) 4.2rem';
  const head = h('div', { class: 'wm-row wm-head', style: cols, 'aria-hidden': 'true' },
    h('span'),
    sources.map((src, i) => h('button', { class: 'wm-col' + (src.kind === 'qbank' ? ' qb' : '') + (src.kind === 'qbank' && (i === 0 || sources[i - 1].kind !== 'qbank') ? ' first-qb' : ''),
      title: src.full + (src.date ? ' · ' + fmtDate(src.date) : ''), tabindex: '-1', onclick: src.open }, src.tag)),
    h('span', { class: 'wm-tot', text: 'times' }));
  const body = shown.map((r) => {
    const hit = new Set(r.hits.map((x) => x.key)), n = r.hits.length;
    return h('button', { class: 'wm-row' + (n >= 2 ? ' rec' : ''), style: cols, 'data-open': r.sy.id, onclick: () => openSystem(r.sy),
      'aria-label': r.sy.name + ': weak ' + n + ' of ' + total + ' times — ' + r.hits.map((x) => x.full).join(', ') + (r.recent ? '. Weak recently.' : '') },
      h('span', { class: 'wm-name', title: r.sy.name }, shortSys(r.sy.name), h('small', { class: 'wm-n', text: n + '×' }), r.recent ? h('i', { class: 'wm-recent', title: 'Weak in one of your last two marked assessments' }) : null),
      sources.map((src, i) => {
        const on = hit.has(src.key), p = on ? pctFor(src, r.sy) : null;
        return h('span', { class: 'wm-cell' + (on ? (src.kind === 'qbank' ? ' on qb' : ' on') + shade(p) : '') + (src.kind === 'qbank' && (i === 0 || sources[i - 1].kind !== 'qbank') ? ' first-qb' : ''),
          title: on ? shortSys(r.sy.name) + ' weak · ' + src.full + (p != null ? ' · ' + fmtPct(p) + ' correct' : '') : '' }, p != null ? String(Math.round(p)) : null);
      }),
      h('span', { class: 'wm-tot' }, h('b', { text: String(n) }), h('span', { class: 'wm-bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + (n / total * 100) + '%' }))));
  });
  box.replaceChildren(...[
    h('div', { class: 'wm-sum' },
      recurring.length
        ? h('p', null, h('b', { text: 'Recurring: ' }), recurring.slice(0, 4).map((r) => shortSys(r.sy.name) + ' ' + r.hits.length + '×').join(' · '))
        : h('p', { class: 'muted', text: 'No system has come up weak twice yet.' }),
      h('p', { class: 'hint', text: plural(nTests, 'assessment') + (nBanks ? ' and ' + plural(nBanks, 'finished qbank') : '') + ' marked' })),
    h('div', { class: 'wm-scroll' }, h('div', { class: 'wm' }, head, body)),
    rows.length > 10 ? h('button', { class: 'linkish', style: 'margin-top:8px', onclick: () => { ui.weakAll = !ui.weakAll; render(); } }, ui.weakAll ? 'Show top 10' : 'Show all ' + rows.length + ' systems') : null,
    h('div', { class: 'heat-legend wm-legend', 'aria-hidden': 'true' },
      h('span', null, h('i', { class: 'wm-cell on' }), 'Weak in an assessment'),
      nBanks ? h('span', null, h('i', { class: 'wm-cell on qb' }), 'Weak in a qbank') : null,
      h('span', null, h('i', { class: 'wm-recent' }), 'Weak in your last 2 assessments'),
      anyPct ? h('span', null, h('i', { class: 'wm-cell on sh1' }), h('i', { class: 'wm-cell on sh2' }), h('i', { class: 'wm-cell on sh3' }), 'Your % in that system (65+ · 55–64 · under 55)') : null,
      h('span', { text: 'Columns oldest → newest · tap a row for the system, a column for the form' })),
  ].filter(Boolean));
}

export function renderNext(tests, cms, qb, dl) {
  const lis = [];
  const go = (text, fn, key) => h('button', { class: 'go', onclick: fn, 'data-open': key || null }, text);
  const left = tests.filter((f) => !taken(f) && !f.old);
  const planned = plannedForms(), overdue = planned.filter((f) => daysUntil(item(f.id).plan) < 0), upcoming = planned.find((f) => daysUntil(item(f.id).plan) >= 0);
  if (overdue.length) lis.push(['Overdue', go(overdue.map((f) => f.full).join(', ') + ' — planned ' + fmtDate(item(overdue[0].id).plan) + '. Take it or pick a new date', () => openForm(overdue[0]), overdue[0].id)]);
  if (upcoming) lis.push(['Planned', go(upcoming.full + ' ' + inDays(item(upcoming.id).plan) + ' (' + fmtLong(item(upcoming.id).plan) + ')', () => openForm(upcoming), upcoming.id)]);
  else {
    const nextT = left.find((f) => f.g.key !== 'f120') || left[0];
    if (nextT) lis.push(['Next', go('Take ' + nextT.full, () => openForm(nextT), nextT.id)]);
  }
  const unplanned = left.filter((f) => !item(f.id).plan);
  if (dl != null && dl > 3 && unplanned.length) lis.push(['Plan', go('Pick dates for ' + plural(unplanned.length, 'remaining assessment') + ' before test day', openPlanner, 'planner')]);
  if (dl != null && dl > 0 && left.length) {
    const every = dl / left.length;
    lis.push(['Pace', left.length + ' assessment' + (left.length > 1 ? 's' : '') + ' left in ' + plural(dl, 'day') +
      (every >= 1 ? ' · about one every ' + (every < 10 ? every.toFixed(1).replace(/\.0$/, '') : Math.round(every)) + ' days' : ' · more than one a day — consider trimming the list')]);
  }
  const paced = qb.banks.filter((b) => b.left != null && b.started && !b.finished);
  if (paced.length && dl != null && dl > 0) {
    lis.push(['Qbank', paced.map((b) => b.left > 0 ? b.qb.name + ' ' + fmtN(b.left) + ' left (~' + Math.ceil(b.left / dl) + '/day)' : b.qb.name + ' finished').join(' · ')]);
  }
  const pattern = weakPattern().rows.filter((r) => r.hits.length >= 2);
  if (pattern.length) lis.push(['Pattern', go(pattern.slice(0, 3).map((r) => shortSys(r.sy.name) + ' (' + r.hits.length + '×)').join(', ') + ' keep coming up weak', () => openSystem(pattern[0].sy), pattern[0].sy.id)]);
  const unread = allArticles().filter((a) => !artItem(a.id).reads);
  if (unread.length) lis.push(['Articles', go(unread.length + ' of ' + allArticles().length + ' AMBOSS articles not read yet — next: ' + unread[0].name, () => showTab('articles', true))]);
  const unrev = tests.concat(cms).filter((f) => item(f.id).status === 1);
  if (unrev.length) lis.push(['Review', go(plural(unrev.length, 'taken form') + ' still need review: ' + unrev.slice(0, 4).map((f) => f.full).join(', ') + (unrev.length > 4 ? '…' : ''), () => openForm(unrev[0]), unrev[0].id)]);
  const weak = SUBJ.map((s) => ({ s, a: avg(cmsForms(s, state.prefs.showOld).map(pctOf).filter(nn)) }))
    .filter((x) => x.a != null).sort((a, b) => a.a - b.a)[0];
  if (weak) lis.push(['Weakest', go(weak.s.name + ' CMS average is ' + fmtPct(weak.a), () => { ui.subj = weak.s.key; showTab('cms', true); })]);
  const lowSys = allSystems().filter((s) => sysItem(s.id).conf > 0).sort((a, b) => sysItem(a.id).conf - sysItem(b.id).conf)[0];
  if (lowSys) lis.push(['Low conf.', go(lowSys.name + ' (' + sysItem(lowSys.id).conf + '/5)', () => openSystem(lowSys), lowSys.id)]);
  const notStarted = allSystems().filter((s) => sysItem(s.id).status === 0);
  if (notStarted.length) lis.push(['Systems', notStarted.length + ' not started yet, e.g. ' + notStarted.slice(0, 3).map((s) => s.name).join(', ')]);
  if (!isEmpty() && !(cloud() && cloud().status().connected)) {
    const lb = state.prefs.lastBackup ? Math.floor((Date.now() - new Date(state.prefs.lastBackup)) / 864e5) : null;
    if (lb == null || lb >= 14) lis.push(['Backup', go(lb == null ? 'You haven’t exported a backup yet — keep one in case this browser’s data is cleared' : 'Last backup was ' + plural(lb, 'day') + ' ago', () => openSettings('#st-export'), 'settings')]);
  }
  if (!lis.length) lis.push(['Done', 'Everything is logged. Nice work.']);
  $('next').replaceChildren(...lis.map(([k, t]) => h('li', null, h('span', { class: 'k', text: k }), typeof t === 'string' ? h('span', { text: t }) : t)));
}

export function drawTrend() {
  const mode = state.prefs.chart;
  document.querySelectorAll('#chart-mode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode ? 'true' : 'false'));
  $('trend-sub').textContent = mode === 'pct' ? '% correct on NBME, UWSA and Free 120, in the order you took them' : 'NBME and UWSA 3-digit scores, in the order you took them';
  const box = $('trend');
  const pts = trendPoints(mode);
  const present = GROUPS.filter((g) => pts.some((p) => p.f.g === g));
  $('trend-legend').replaceChildren(...present.map((g) => h('span', null, h('i', { style: 'background:var(--ser-' + g.key + ')' }), g.short)));
  $('trend-note').replaceChildren();
  box.replaceChildren();
  if (!pts.length) {
    box.append(h('div', { class: 'empty', text: mode === 'pct' ? 'Log % correct on an NBME, UWSA or Free 120 and your trend will show here.' : 'Log a 3-digit score on an NBME or UWSA and your trend line will show here.' }));
    return;
  }
  const W = Math.max(300, box.clientWidth || 480), H = 220;
  const m = { t: 22, r: 18, b: 30, l: 40 };
  const ns = 'http://www.w3.org/2000/svg';
  const s = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const txt = (a, t) => { const e = s('text', a); e.textContent = t; return e; };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': (mode === 'pct' ? 'Percent correct' : 'Score') + ' trend: ' + pts.map((p) => p.f.full + ' ' + p.v + (mode === 'pct' ? '%' : '')).join(', ') });
  const vals = pts.map((p) => p.v), tgt = num(state.prefs.target);
  let lo, hi;
  if (mode === 'pct') {
    lo = Math.max(0, Math.floor((Math.min(...vals, 50) - 5) / 10) * 10);
    hi = Math.min(100, Math.ceil((Math.max(...vals, 90) + 5) / 10) * 10);
  } else {
    lo = Math.floor((Math.min(...vals, 210) - 5) / 10) * 10;
    hi = Math.ceil((Math.max(...vals, 260, tgt || 0) + 5) / 10) * 10;
  }
  const x = (i) => pts.length === 1 ? (m.l + W - m.r) / 2 : m.l + (i / (pts.length - 1)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const step = (hi - lo) > 60 ? 20 : 10;
  for (let v = lo; v <= hi; v += step) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: 'var(--line)', 'stroke-width': 1 }));
    svg.append(txt({ x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11, 'font-family': 'var(--f-mono)' }, v + (mode === 'pct' ? '%' : '')));
  }
  const ref = (v, color, label, left) => {
    if (v < lo || v > hi) return;
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: color, 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: .75 }));
    svg.append(txt({ x: left ? m.l + 4 : W - m.r, y: y(v) - 5, 'text-anchor': left ? 'start' : 'end', fill: color, 'font-size': 10.5 }, label));
  };
  if (mode === 'score') {
    ref(PASS, 'var(--bad)', 'Pass ' + PASS);
    if (tgt) ref(tgt, 'var(--good)', 'Target ' + tgt, true);
  }
  for (const g of present) {
    const idx = pts.map((p, i) => (p.f.g === g ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) continue;
    const d = idx.map((i, k) => (k ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(pts[i].v).toFixed(1)).join(' ');
    svg.append(s('path', { d, fill: 'none', stroke: 'var(--ser-' + g.key + ')', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: .9 }));
  }
  const every = Math.ceil(pts.length / Math.max(1, Math.floor((W - m.l - m.r) / 44)));
  const tip = h('div', { class: 'tip', hidden: true });
  pts.forEach((p, i) => {
    const last = i === pts.length - 1, col = 'var(--ser-' + p.f.g.key + ')';
    svg.append(s('circle', { cx: x(i), cy: y(p.v), r: last ? 5.5 : 4, fill: last ? 'var(--hl)' : 'var(--panel)', stroke: last ? 'var(--ink)' : col, 'stroke-width': 2 }));
    if (i % every === 0 || last) svg.append(txt({ x: x(i), y: H - 10, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11, 'font-family': 'var(--f-mono)' }, p.f.tag));
    if (last || pts.length <= 8) svg.append(txt({ x: x(i), y: y(p.v) - 10, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 11.5, 'font-weight': 600, 'font-family': 'var(--f-mono)' }, Math.round(p.v) + (mode === 'pct' ? '%' : '')));
    const hit = s('circle', { cx: x(i), cy: y(p.v), r: 14, fill: 'transparent', style: 'cursor:pointer' });
    hit.addEventListener('mouseenter', () => {
      const s3 = scaledOf(p.f), pc = pctOf(p.f);
      tip.hidden = false;
      tip.replaceChildren(h('span', { text: p.f.full + (p.it.date ? ' · ' + fmtDate(p.it.date) : '') + '  ' }),
        h('b', { text: [s3 != null ? String(s3) : null, pc != null ? fmtPct(pc) : null].filter(Boolean).join(' · ') }));
      const r = box.getBoundingClientRect(), sr = svg.getBoundingClientRect();
      tip.style.left = Math.min(Math.max(80, (x(i) / W) * sr.width), r.width - 80) + 'px';
      tip.style.top = ((y(p.v) / H) * sr.height) + 'px';
    });
    hit.addEventListener('mouseleave', () => (tip.hidden = true));
    hit.addEventListener('click', () => openForm(p.f));
    svg.append(hit);
  });
  box.append(svg, tip);
  if (mode === 'score') {
    const o = outlook();
    if (o.proj != null) $('trend-note').append(h('span', { text: 'Trend projects ' + Math.round(o.proj) + ' on test day' }));
  }
}
$('chart-mode').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.prefs.chart = b.dataset.mode; save(); drawTrend();
});

// Everything dated, by day: qbank questions, self-assessments, CMS forms, system updates, article reads.
export function activityByDay() {
  const act = new Map();
  const get = (d) => { if (!act.has(d)) act.set(d, { q: 0, src: {}, tests: [], cms: [], sys: [], arts: [] }); return act.get(d); };
  state.log.forEach((e) => { const a = get(e.date); a.q += e.q; a.src[e.src] = (a.src[e.src] || 0) + e.q; });
  allTests().forEach((f) => { const it = item(f.id), s3 = scaledOf(f), p = pctOf(f); if (it.status > 0 && it.date) get(it.date).tests.push(f.full + (s3 != null ? ' · ' + s3 : p != null ? ' · ' + fmtPct(p) : '')); });
  SUBJ.flatMap((s) => cmsForms(s, true)).forEach((f) => { const it = item(f.id), p = pctOf(f); if (it.status > 0 && it.date) get(it.date).cms.push(f.full + (p != null ? ' · ' + fmtPct(p) : '')); });
  allSystems().forEach((sy) => { const it = sysItem(sy.id); if (it.day) get(it.day).sys.push(sy.name + ' (' + SYS_ST[it.status].toLowerCase() + ')'); });
  allArticles().forEach((ar) => { const it = artItem(ar.id); if (it.reads && it.date) get(it.date).arts.push(ar.name); });
  return act;
}
export const dayText = (ds, a) => {
  if (!a) return fmtLong(ds) + ' — nothing logged';
  const parts = [];
  if (a.q) parts.push(fmtN(a.q) + ' qbank questions' + (Object.keys(a.src).length > 1 || !a.src.UWorld ? ' (' + Object.entries(a.src).map(([k, v]) => k + ' ' + v).join(', ') + ')' : ''));
  if (a.tests.length) parts.push(a.tests.join(', '));
  if (a.cms.length) parts.push('CMS ' + a.cms.join(', '));
  if (a.sys.length) parts.push('Systems: ' + a.sys.join(', '));
  if (a.arts.length) parts.push('Read ' + a.arts.join(', '));
  return fmtLong(ds) + ' — ' + parts.join(' · ');
};

// Activity calendar. Qbank volume fills the square; a self-assessment adds a yellow diamond,
// a CMS form a teal border and a system update a pink dot, so several can share one day.
export function renderHeat(box) {
  const weeks = 20, t = dayNum(today());
  const start = t - weekday(t) - (weeks - 1) * 7;
  const act = activityByDay();
  // planned forms and test day: extend past this week (up to 8 weeks) to reach them
  const plans = new Map();
  plannedForms().forEach((f) => { const d = item(f.id).plan; if (!plans.has(d)) plans.set(d, []); plans.get(d).push(f.full); });
  const ex = state.prefs.examDate;
  const future = [...plans.keys(), ex].filter((d) => d && dayNum(d) > t).map(dayNum);
  const ahead = future.length ? Math.max(0, Math.min(8, Math.ceil((Math.max(...future) - (start + weeks * 7) + 1) / 7))) : 0;
  const futText = (ds) => fmtLong(ds) + ' — ' + [plans.has(ds) ? 'planned: ' + plans.get(ds).join(', ') : '', ds === ex ? 'test day' : ''].filter(Boolean).join(' · ');
  const textFor = (ds) => (dayNum(ds) > t ? futText(ds) : dayText(ds, act.get(ds)));
  const cells = [], months = [];
  const tot = { days: 0, q: 0, tests: 0, cms: 0, sys: 0 };
  let prevMonth = null, lastActive = null;
  for (let w = 0; w < weeks + ahead; w++) {
    const mon = new Date((start + w * 7) * 864e5).getUTCMonth();
    // label each month at its first week; skip a leading partial month that would collide with the next label
    const nextMon = new Date((start + (w + 2) * 7) * 864e5).getUTCMonth();
    if (mon !== prevMonth) {
      if (w > 0 || nextMon === mon) months.push(h('span', { style: 'grid-column:' + (w + 1) + '/span 3', text: new Date((start + w * 7) * 864e5).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) }));
      prevMonth = mon;
    }
    for (let d = 0; d < 7; d++) {
      const n = start + w * 7 + d;
      if (n > t) {
        const ds = fromDay(n), mark = plans.has(ds) || ds === ex;
        cells.push(h('i', { class: 'hc fut' + (plans.has(ds) ? ' m-plan' : '') + (ds === ex ? ' m-test' : '') + (mark && ui.heatDay === ds ? ' sel' : ''),
          'data-day': mark ? ds : null, title: mark ? futText(ds) : null }));
        continue;
      }
      const ds = fromDay(n), a = act.get(ds), q = a ? a.q : 0;
      if (a) {
        tot.days++; tot.q += q; tot.tests += a.tests.length; tot.cms += a.cms.length; tot.sys += a.sys.length;
        lastActive = ds;
      }
      const lv = q === 0 ? 0 : q < 40 ? 1 : q < 80 ? 2 : q < 160 ? 3 : 4;
      cells.push(h('i', { class: 'hc l' + lv + (a && a.tests.length ? ' m-ex' : '') + (a && a.cms.length ? ' m-cms' : '') + (a && a.sys.length ? ' m-sys' : '') +
        (n === t ? ' today' : '') + (ui.heatDay === ds ? ' sel' : ''), 'data-day': ds, title: dayText(ds, a) }));
    }
  }
  const shown = ui.heatDay && dayNum(ui.heatDay) >= start ? ui.heatDay : lastActive;
  const detail = h('p', { class: 'heat-detail', 'aria-live': 'polite', text: shown ? textFor(shown) : 'Nothing logged in the last 20 weeks yet.' });
  const cols = 'grid-template-columns:repeat(' + (weeks + ahead) + ',minmax(0,1fr))';
  const grid = h('div', { class: 'heat', style: cols, role: 'img', 'aria-label': 'Activity over the last ' + weeks + ' weeks: ' + plural(tot.days, 'active day') + ', ' + tot.q + ' qbank questions, ' +
    plural(tot.tests, 'self-assessment') + ', ' + plural(tot.cms, 'CMS form') + ', ' + plural(tot.sys, 'system update') }, cells);
  grid.addEventListener('click', (e) => {
    const c = e.target.closest('.hc[data-day]'); if (!c) return;
    ui.heatDay = c.dataset.day;
    grid.querySelectorAll('.hc.sel').forEach((x) => x.classList.remove('sel'));
    c.classList.add('sel');
    detail.textContent = textFor(ui.heatDay);
  });
  box.replaceChildren(
    h('div', { class: 'heat-wrap' },
      h('span'), h('div', { class: 'heat-m', style: cols, 'aria-hidden': 'true' }, months),
      h('div', { class: 'heat-d', 'aria-hidden': 'true' }, ['Mon', '', 'Wed', '', 'Fri', '', ''].map((x) => h('span', { text: x }))), grid),
    detail,
    h('div', { class: 'heat-legend', 'aria-hidden': 'true' },
      h('span', null, 'Qbank', [1, 2, 3, 4].map((l) => h('i', { class: 'hc l' + l }))),
      h('span', null, h('i', { class: 'hc m-ex' }), 'NBME / UWSA / Free 120'),
      h('span', null, h('i', { class: 'hc m-cms' }), 'CMS form'),
      h('span', null, h('i', { class: 'hc m-sys' }), 'System update'),
      plans.size ? h('span', null, h('i', { class: 'hc fut m-plan' }), 'Planned') : null,
      ex && ahead ? h('span', null, h('i', { class: 'hc fut m-test' }), 'Test day') : null),
    h('p', { class: 'heat-sum', text: [plural(tot.days, 'active day'), fmtN(tot.q) + ' questions', plural(tot.tests, 'assessment'), plural(tot.cms, 'CMS form'), plural(tot.sys, 'system update')].join(' · ') }));
}

export function statusPill(st, labels) {
  return h('span', { class: 'status st' + st }, h('i'), labels[st]);
}
