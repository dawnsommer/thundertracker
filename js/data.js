// Derived views of the state: form lists, scores, qbank stats, weak-system patterns and articles.

import { avg, dayNum, daysUntil, num, sum, today } from './util.js?v=19';
import { ARTICLE_SECTIONS, GROUPS, SUBJ, SYSTEMS } from './catalog.js?v=19';
import { item, save, state } from './store.js?v=19';
import { render } from './shell.js?v=19';
import { openForm } from './assessments.js?v=19';
import { openQbank } from './qbank.js?v=19';

export function testForms(g, includeHidden) {
  const rm = new Set(state.removed);
  const ns = new Set(g.base);
  (state.extraAssess[g.key] || []).forEach((n) => ns.add(n));
  return [...ns].sort((a, b) => a - b).map((n) => {
    const id = g.key + '-' + n;
    return { id, n, g, kind: 'test', label: g.label(n), full: g.full(n), tag: g.tag(n), qs: g.qsFor ? g.qsFor(n) : g.qs,
      old: !!(g.old && g.old(n)), extra: !g.base.includes(n), removed: rm.has(id) };
  }).filter((f) => includeHidden || !f.removed);
}
export function cmsForms(s, includeOld, includeRemoved) {
  const rm = new Set(state.removed);
  const ns = new Set();
  for (let n = 1; n <= s.latest; n++) ns.add(n);
  (state.extraForms[s.key] || []).forEach((n) => ns.add(n));
  return [...ns].sort((a, b) => a - b).map((n) => {
    const id = 'cms-' + s.key + '-' + n;
    const extra = n > s.latest;
    const old = !extra && (n <= s.latest - 4 || (s.retired || []).includes(n));
    return { id, n, kind: 'cms', label: 'Form ' + n, full: s.name + ' Form ' + n, old, subj: s, removed: rm.has(id), extra };
  }).filter((f) => (includeRemoved || !f.removed) && (includeOld || !f.old || item(f.id).status > 0));
}
export const allTests = () => GROUPS.flatMap((g) => testForms(g));
export const allCms = () => SUBJ.flatMap((s) => cmsForms(s, state.prefs.showOld));
export const allSystems = () => SYSTEMS.concat(state.extraSystems);
// "Renal, Urology & Electrolytes" -> "Renal"
export const shortSys = (name) => name.split(/,| &|:/)[0].trim();
export const weakNames = (ids) => ids.map((id) => allSystems().find((x) => x.id === id)).filter(Boolean).map((x) => shortSys(x.name)).join(', ');
// Column label: UWorld -> UW, AMBOSS -> AMB, Kaplan -> KAP
export const qbAbbr = (name) => { const caps = name.match(/[A-Z]/g) || []; return caps.length >= 2 && caps.length <= 3 && caps.length < name.replace(/\W/g, '').length ? caps.join('') : name.replace(/\W/g, '').slice(0, 3).toUpperCase(); };
// Everything you marked weak systems on: self-assessments in the order you took them, then finished qbanks.
export function weakSources() {
  const order = (f) => item(f.id).date || '9999';
  const tests = allTests().filter((f) => item(f.id).weak.length)
    .sort((a, b) => order(a).localeCompare(order(b)) || ORDER(a) - ORDER(b))
    .map((f) => ({ key: f.id, kind: 'test', tag: f.tag, full: f.full, date: item(f.id).date, weak: item(f.id).weak, pct: item(f.id).weakPct || {}, n: item(f.id).weakN || {}, open: () => openForm(f), g: f.g.key }));
  const banks = state.qbanks.filter((q) => q.finished && q.weak.length)
    .map((q) => ({ key: 'qb-' + q.id, kind: 'qbank', tag: qbAbbr(q.name), full: q.name + ' (qbank)', date: q.finished, weak: q.weak, pct: q.weakPct || {}, open: () => openQbank(q) }));
  return tests.concat(banks);
}
// Per system: where it came up weak. "Recent" = weak in one of your last two marked assessments.
export function weakPattern() {
  const sources = weakSources();
  const tests = sources.filter((x) => x.kind === 'test');
  const latest = new Set(tests.slice(-2).map((x) => x.key));
  const by = new Map();
  sources.forEach((src) => src.weak.forEach((id) => { if (!by.has(id)) by.set(id, []); by.get(id).push(src); }));
  const rows = [...by].map(([id, hits]) => ({ sy: allSystems().find((x) => x.id === id), hits,
    tests: hits.filter((x) => x.kind === 'test').length, banks: hits.filter((x) => x.kind === 'qbank').length, recent: hits.some((x) => latest.has(x.key)) }))
    .filter((r) => r.sy).sort((a, b) => b.hits.length - a.hits.length || b.recent - a.recent || a.sy.name.localeCompare(b.sy.name));
  return { rows, sources, nTests: tests.length, nBanks: sources.length - tests.length };
}
export const artItem = (id) => state.articles[id] || { reads: 0, date: '', notes: '', t: 0 };
// Checklist sections first (with any articles you added to them), then your own sections.
export function artSections() {
  const mine = (secId) => state.artCustom.filter((x) => x.sec === secId).map((x) => ({ id: x.id, name: x.name, sec: x.sec, url: x.url, builtIn: false }));
  return ARTICLE_SECTIONS.map((sec) => Object.assign({}, sec, { articles: sec.articles.concat(mine(sec.id)) }))
    .concat(state.artSections.map((sec) => ({ id: sec.id, name: sec.name, builtIn: false, articles: mine(sec.id) })));
}
export const allArticles = () => artSections().flatMap((sec) => sec.articles);
export const artUrl = (ar) => ar.url || 'https://next.amboss.com/us/search?q=' + encodeURIComponent(ar.name) + '&v=overview';
export const taken = (f) => item(f.id).status > 0;
// CMS keeps % correct in `score` (v1 format); assessments keep the 3-digit score in `score` and % in `pct`.
export const scaledOf = (f) => (f.kind === 'test' && f.g.scaled ? num(item(f.id).score) : null);
export const pctOf = (f) => num(f.kind === 'cms' ? item(f.id).score : item(f.id).pct);

export function toggleRemove(f) {
  const list = f.kind === 'cms' ? state.extraForms : state.extraAssess;
  const key = f.kind === 'cms' ? f.subj.key : f.g.key;
  if (f.extra) {
    list[key] = (list[key] || []).filter((n) => n !== f.n);
  } else {
    const set = new Set(state.removed);
    if (set.has(f.id)) set.delete(f.id); else set.add(f.id);
    state.removed = [...set];
  }
  save(); render();
}
// Add (or bring back) a form number. Returns a message for the user.
export function addForm(kind, grp, n) {
  const id = kind === 'cms' ? 'cms-' + grp.key + '-' + n : grp.key + '-' + n;
  const rm = new Set(state.removed);
  const list = kind === 'cms' ? state.extraForms : state.extraAssess;
  const builtIn = kind === 'cms' ? n <= grp.latest : grp.base.includes(n);
  const name = kind === 'cms' ? grp.name + ' Form ' + n : grp.full(n);
  let msg;
  if (rm.has(id)) { rm.delete(id); state.removed = [...rm]; msg = name + ' is back on the list'; }
  else if (builtIn || (list[grp.key] || []).includes(n)) msg = name + ' is already on the list';
  else { list[grp.key] = [...new Set([...(list[grp.key] || []), n])].sort((a, b) => a - b); msg = name + ' added'; }
  if (kind === 'cms' && n <= grp.latest - 4 && !state.prefs.showOld) state.prefs.showOld = true;
  save();
  return msg;
}

// chronological order: dated first by date, then undated in catalog order
export const ORDER = (f) => (f.kind === 'test' ? GROUPS.indexOf(f.g) * 1e4 + f.n : 9e4 + f.n);
export const chrono = (a, b) => {
  const da = a.it.date, db = b.it.date;
  if (da && db && da !== db) return da.localeCompare(db);
  if (da && !db) return -1;
  if (db && !da) return 1;
  return ORDER(a.f) - ORDER(b.f);
};
export function trendPoints(mode) {
  return allTests().filter((f) => mode === 'pct' || f.g.scaled)
    .map((f) => ({ f, it: item(f.id), v: mode === 'pct' ? pctOf(f) : scaledOf(f) }))
    .filter((p) => p.v != null).sort(chrono);
}
// Score outlook: latest, best, recent average and a straight-line projection to test day.
export function outlook() {
  const pts = trendPoints('score');
  const vals = pts.map((p) => p.v);
  const out = { pts, latest: pts[pts.length - 1] || null, best: vals.length ? Math.max(...vals) : null,
    recent: avg(vals.slice(-3)), slope: null, proj: null };
  const dated = pts.filter((p) => p.it.date);
  if (dated.length >= 3) {
    const xs = dated.map((p) => dayNum(p.it.date)), ys = dated.map((p) => p.v);
    const mx = avg(xs), my = avg(ys);
    let sxx = 0, sxy = 0;
    xs.forEach((x, i) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (ys[i] - my); });
    if (sxx > 0 && Math.max(...xs) - Math.min(...xs) >= 7) {
      out.slope = sxy / sxx;
      const ex = state.prefs.examDate;
      if (ex && daysUntil(ex) >= 0) {
        const raw = my + out.slope * (dayNum(ex) - mx);
        // keep extrapolation honest: never far beyond what you've actually scored
        out.proj = Math.max(Math.min(...ys) - 15, Math.min(raw, out.best + 15, 300));
      }
    }
  }
  return out;
}
export const band = (kind, s) => {
  if (s == null) return '';
  if (kind === 'score') {
    const good = num(state.prefs.target) || 250;
    return s >= good ? 'sc-good' : s >= Math.min(230, good - 10) ? 'sc-warn' : 'sc-bad';
  }
  return s >= 80 ? 'sc-good' : s >= 65 ? 'sc-warn' : 'sc-bad';
};

// One qbank: the progress you entered as "done so far" plus every session logged for it.
export function bankStats(qb) {
  const logs = state.log.filter((e) => e.src === qb.name);
  const bank = num(qb.bank), dv = num(qb.done), da = num(qb.acc);
  // "% of bank" needs the bank size to become a question count
  const baseQ = dv == null ? 0 : qb.unit === 'pct' ? (bank ? Math.round(bank * dv / 100) : null) : dv;
  const loggedQ = sum(logs.map((e) => e.q));
  const done = baseQ == null ? null : baseQ + loggedQ;
  const parts = logs.filter((e) => num(e.pct) != null).map((e) => [e.q, num(e.pct)]);
  if (da != null && baseQ) parts.push([baseQ, da]);
  const wq = sum(parts.map((x) => x[0]));
  let acc = wq ? sum(parts.map(([q, v]) => q * v)) / wq : null;
  if (baseQ == null && da != null) acc = da;
  const pctDone = bank && done != null ? Math.min(100, done / bank * 100) : qb.unit === 'pct' && dv != null ? dv : null;
  return { qb, logs, loggedQ, baseQ, done, bank, pctDone, acc, left: bank && done != null ? Math.max(0, bank - done) : null,
    started: dv != null || da != null || logs.length > 0, finished: !!qb.finished };
}
export function qbStats() {
  const log = state.log, t = dayNum(today());
  const banks = state.qbanks.map(bankStats);
  const names = new Set(state.qbanks.map((q) => q.name));
  const other = log.filter((e) => !names.has(e.src));
  // all questions done: each qbank's total plus sessions logged under "Other"
  const total = sum(banks.map((b) => b.done || 0)) + sum(other.map((e) => e.q));
  const parts = banks.filter((b) => b.acc != null).map((b) => [b.done || b.loggedQ || 1, b.acc])
    .concat(other.filter((e) => num(e.pct) != null).map((e) => [e.q, num(e.pct)]));
  const wq = sum(parts.map((x) => x[0]));
  const acc = wq ? sum(parts.map(([q, v]) => q * v)) / wq : null;
  const recent = log.filter((e) => { const d = t - dayNum(e.date); return d >= 0 && d < 7; });
  const days = new Set(log.map((e) => dayNum(e.date)));
  let streak = 0, d = days.has(t) ? t : t - 1;
  while (days.has(d)) { streak++; d--; }
  let best = 0, run = 0, prev = null;
  [...days].sort((a, b) => a - b).forEach((x) => { run = prev === x - 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; });
  const bySrc = {};
  log.forEach((e) => (bySrc[e.src] = (bySrc[e.src] || 0) + e.q));
  return { total, acc, week: sum(recent.map((e) => e.q)), streak, best, bySrc, banks, sessions: log.length, logged: sum(log.map((e) => e.q)) };
}
export const isEmpty = () => !Object.keys(state.items).length && !Object.keys(state.systems).length && !state.log.length && !state.prefs.examDate;
