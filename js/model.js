// The saved data shape: normalising old saves and imported files, change stamps, and the record-by-record merge used by Google sync.

import { arr, clone, ID_RE, inRange, int, ints, isDate, num, obj, safeUrl, stampOf, str, uid } from './util.js?v=23';
import { GROUPS, MERGE, PASSES, QBANKS, RESOURCES, RESOURCES_DEFAULT, SUBJ } from './catalog.js?v=23';
import { PV_PASSES } from './passive-catalog.js?v=23';

export function normItem(x) {
  x = obj(x);
  return { status: int(x.status, 0, 3), score: str(x.score, 12), pct: str(x.pct, 12), date: isDate(x.date), notes: str(x.notes),
    weak: weakList(x.weak), weakPct: weakPcts(x.weakPct), weakN: weakCounts(x.weakN), plan: isDate(x.plan), retake: normRetake(x.retake), t: stampOf(x.t) };
}
// A re-attempt of a form you've taken: its own score, % and date. The first attempt stays in `score`/`pct`/`date`
// and is what the stats use; null when there's no retake.
export function normRetake(x) {
  x = obj(x);
  const r = { score: str(x.score, 12), pct: str(x.pct, 12), date: isDate(x.date) };
  return r.score || r.pct || r.date ? r : null;
}
// weak systems, and the optional % correct you scored in each (shades the weakness matrix)
const weakList = (w) => [...new Set(arr(w).filter((x) => typeof x === 'string' && ID_RE.test(x)))].slice(0, 60);
// assessments: questions you got wrong (e) and got right but weren't sure of (u) in each weak system,
// counted from your review of the score report
function weakCounts(x) {
  const out = {};
  for (const [id, v] of Object.entries(obj(x))) {
    const e = int(obj(v).e, 0, 200), u = int(obj(v).u, 0, 200);
    if (ID_RE.test(id) && (e || u)) out[id] = { e, u };
  }
  return out;
}
function weakPcts(x) {
  const out = {};
  for (const [id, v] of Object.entries(obj(x))) { const p = inRange(v, 0, 100); if (ID_RE.test(id) && p !== '') out[id] = p; }
  return out;
}
// A saved conversion from % correct to a 3-digit score, for an exam type ('nbme', 'uwsa', 'f120') or one
// form ('nbme-12'): a straight line (score = a × % + b) or a table of points to interpolate between.
export function normConversion(x) {
  x = obj(x);
  // which built-in conversion a form uses ('none' = don't use one); see score-models.js
  if (x.kind === 'builtin') return typeof x.model === 'string' && /^[a-z0-9-]{1,40}$/.test(x.model) ? { kind: 'builtin', model: x.model, t: stampOf(x.t) } : null;
  const note = str(x.note, 200);
  if (x.kind === 'table') {
    const points = [...new Map(arr(x.points).map((p) => [num(arr(p)[0]), num(arr(p)[1])]).filter(([a, b]) => a != null && b != null && a >= 0 && a <= 100 && b >= 1 && b <= 300)).entries()]
      .sort((a, b) => a[0] - b[0]).slice(0, 80);
    return points.length >= 2 ? { kind: 'table', points, note, t: stampOf(x.t) } : null;
  }
  const a = num(x.a), b = num(x.b);
  return a != null && b != null && Math.abs(a) < 20 && Math.abs(b) < 1000 ? { kind: 'linear', a, b, note, t: stampOf(x.t) } : null;
}
export function normSys(x) {
  x = obj(x);
  return { status: int(x.status, 0, 3), conf: int(x.conf, 0, 5), notes: str(x.notes), uw: str(x.uw, 12),
    tags: [...new Set(arr(x.tags).filter((t) => typeof t === 'string').map((t) => t.slice(0, 30)))], day: isDate(x.day), t: stampOf(x.t) };
}
export function normQbank(x) {
  x = obj(x);
  const name = str(x.name, 40).trim();
  if (typeof x.id !== 'string' || !ID_RE.test(x.id) || !name) return null;
  const unit = x.unit === 'pct' ? 'pct' : 'q';
  return { id: x.id, name, bank: inRange(x.bank, 1, 50000), done: inRange(x.done, 0, unit === 'pct' ? 100 : 50000), unit, acc: inRange(x.acc, 0, 100),
    finished: isDate(x.finished), weak: weakList(x.weak), weakPct: weakPcts(x.weakPct), t: stampOf(x.t) };
}
// `finished` is the date you marked it done (you can stop before 100%); `weak` are its weak systems
export const blankQbank = (d) => ({ id: d.id, name: d.name, bank: '', done: '', unit: 'q', acc: '', finished: '', weak: [], weakPct: {}, t: 0 });
export function normArt(x) {
  x = obj(x);
  return { reads: int(x.reads, 0, PASSES), date: isDate(x.date), notes: str(x.notes), t: stampOf(x.t) };
}
// Passive study (DIP episodes, PHYSEO parts): times through it, notes done (DIP), last date
export function normPassive(x) {
  x = obj(x);
  return { n: int(x.n, 0, PV_PASSES), notes: !!x.notes, date: isDate(x.date), t: stampOf(x.t) };
}
export function normLog(x) {
  x = obj(x);
  const date = isDate(x.date), q = int(x.q, 0, 5000);
  if (!date || !q) return null;
  return { id: typeof x.id === 'string' && ID_RE.test(x.id) ? x.id : uid(), date, q, pct: inRange(x.pct, 0, 100),
    src: str(x.src, 40).trim() || 'UWorld', note: str(x.note, 200), t: stampOf(x.t) };
}
export function migrate(sys) {
  for (const old in MERGE) {
    if (!sys[old]) continue;
    const a = sys[old], to = MERGE[old], b = sys[to] || normSys(null);
    sys[to] = {
      status: Math.max(a.status, b.status), conf: Math.max(a.conf, b.conf), uw: b.uw || a.uw,
      notes: [b.notes, a.notes].filter(Boolean).join('\n'),
      tags: [...new Set([...b.tags, ...a.tags])], day: a.day > b.day ? a.day : b.day, t: Math.max(a.t, b.t),
    };
    delete sys[old];
  }
  return sys;
}

// `base`, `deleted`, `lt` and `pt` exist for Google sync: see "change stamps + merge" below.
export const blank = () => ({ v: 2, base: 0, deleted: {}, lt: 0, pt: 0, items: {}, systems: {}, extraForms: {}, extraAssess: {}, extraSystems: [], removed: [], log: [],
  qbanks: QBANKS.map(blankQbank), articles: {}, artSections: [], artCustom: [], conversions: {}, passive: {}, pvSecs: [], pvCustom: [],
  prefs: { showOld: false, theme: 'system', examDate: '', target: '', bank: '', chart: 'score', sysSort: 'default', lastBackup: '',
    artOrder: [], artView: 'grid', artSort: 'checklist', artCollapsed: [], passive: false, pvCollapsed: [], pvFilter: 'all', sysTags: RESOURCES_DEFAULT.slice() } });

// Accepts v1 saves (the original single-file version) and v2.
export function norm(s) {
  s = obj(s);
  const items = {};
  for (const [id, x] of Object.entries(obj(s.items))) if (ID_RE.test(id)) items[id] = normItem(x);
  const sys = {};
  for (const [id, x] of Object.entries(obj(s.systems))) if (ID_RE.test(id)) sys[id] = normSys(x);
  const extraForms = {};
  for (const sj of SUBJ) { const a = ints(obj(s.extraForms)[sj.key], 1, 99); if (a.length) extraForms[sj.key] = a; }
  const extraAssess = {};
  for (const g of GROUPS) { const a = ints(obj(s.extraAssess)[g.key], g.min, g.max); if (a.length) extraAssess[g.key] = a; }
  const p = obj(s.prefs), b = blank().prefs;
  const deleted = {};
  for (const [k, t] of Object.entries(obj(s.deleted))) if (/^[ilsxqacrvpuw]:[a-z0-9-]{1,48}$/i.test(k) && stampOf(t)) deleted[k] = stampOf(t);
  const conversions = {};
  for (const [id, x] of Object.entries(obj(s.conversions))) { const c = ID_RE.test(id) && normConversion(x); if (c) conversions[id] = c; }
  const qIn = arr(s.qbanks).map(normQbank).filter(Boolean);
  const qbanks = QBANKS.map((d) => Object.assign(qIn.find((x) => x.id === d.id) || blankQbank(d), { name: d.name }))
    .concat(qIn.filter((x) => !QBANKS.some((d) => d.id === x.id)));
  if (!qbanks[0].bank) qbanks[0].bank = inRange(p.bank, 1, 50000); // v2 kept the UWorld bank size in prefs
  const articles = {};
  for (const [id, x] of Object.entries(obj(s.articles))) if (ID_RE.test(id)) articles[id] = normArt(x);
  const passive = {};
  for (const [id, x] of Object.entries(obj(s.passive))) if (ID_RE.test(id)) passive[id] = normPassive(x);
  // your own passive-study sections (a podcast, a topic) and their episodes
  const pvSecs = arr(s.pvSecs).filter((x) => x && typeof x.id === 'string' && ID_RE.test(x.id) && typeof x.name === 'string' && x.name.trim())
    .map((x) => ({ id: x.id, name: x.name.trim().slice(0, 60), t: stampOf(x.t) }));
  const pvCustom = arr(s.pvCustom).filter((x) => x && typeof x.id === 'string' && ID_RE.test(x.id) && typeof x.sec === 'string' && typeof x.name === 'string' && x.name.trim())
    .map((x) => ({ id: x.id, sec: x.sec.slice(0, 48), name: x.name.trim().slice(0, 120), mins: int(x.mins, 0, 1000), t: stampOf(x.t) }));
  const artSections = arr(s.artSections).filter((x) => x && typeof x.id === 'string' && ID_RE.test(x.id) && typeof x.name === 'string' && x.name.trim())
    .map((x) => ({ id: x.id, name: x.name.trim().slice(0, 80), t: stampOf(x.t) }));
  const artCustom = arr(s.artCustom).filter((x) => x && typeof x.id === 'string' && ID_RE.test(x.id) && typeof x.sec === 'string' && typeof x.name === 'string' && x.name.trim())
    .map((x) => ({ id: x.id, sec: x.sec.slice(0, 48), name: x.name.trim().slice(0, 120), url: x.url ? safeUrl(x.url) : '', t: stampOf(x.t) }));
  return {
    v: 2, base: stampOf(s.base), deleted, lt: stampOf(s.lt), pt: stampOf(s.pt),
    items, systems: migrate(sys), extraForms, extraAssess,
    extraSystems: arr(s.extraSystems).filter((x) => x && typeof x.id === 'string' && ID_RE.test(x.id) && typeof x.name === 'string' && x.name.trim())
      .map((x) => ({ id: x.id, name: x.name.trim().slice(0, 60), t: stampOf(x.t) })),
    removed: [...new Set(arr(s.removed).filter((x) => typeof x === 'string' && ID_RE.test(x)))],
    log: arr(s.log).map(normLog).filter(Boolean),
    qbanks, articles, artSections, artCustom, conversions, passive, pvSecs, pvCustom,
    prefs: {
      showOld: !!p.showOld,
      theme: ['light', 'dark'].includes(p.theme) ? p.theme : b.theme,
      examDate: isDate(p.examDate),
      target: inRange(p.target, 1, 300),
      bank: inRange(p.bank, 1, 20000),
      chart: p.chart === 'pct' ? 'pct' : b.chart,
      sysSort: ['conf', 'status', 'uw', 'az'].includes(p.sysSort) ? p.sysSort : b.sysSort,
      lastBackup: typeof p.lastBackup === 'string' ? p.lastBackup.slice(0, 40) : '',
      artOrder: [...new Set(arr(p.artOrder).filter((x) => typeof x === 'string' && ID_RE.test(x)))].slice(0, 200),
      artView: p.artView === 'list' ? 'list' : 'grid',
      artSort: ['least', 'most', 'recent', 'az'].includes(p.artSort) ? p.artSort : 'checklist',
      artCollapsed: [...new Set(arr(p.artCollapsed).filter((x) => typeof x === 'string' && ID_RE.test(x)))].slice(0, 200),
      passive: p.passive === true,
      // which resources show on systems: your pick, in the catalog's order (an empty pick is kept)
      sysTags: Array.isArray(p.sysTags) ? RESOURCES.filter((t) => p.sysTags.includes(t)) : RESOURCES_DEFAULT.slice(),
      pvCollapsed: [...new Set(arr(p.pvCollapsed).filter((x) => typeof x === 'string' && ID_RE.test(x)))].slice(0, 50),
      pvFilter: ['todo', 'video', 'notes'].includes(p.pvFilter) ? p.pvFilter : 'all',
    },
  };
}

// Each record carries `t`, the time of its last change, and deletions leave a tombstone in `deleted`.
// A full restore or erase bumps `base`: on merge, anything older than the newest base is dropped,
// so the restore wins on every device. Lists of added/hidden forms (`lt`) and the plan prefs (`pt`)
// merge as a unit, newest wins. Theme and other view prefs stay per device.
export const SYNC_PREFS = ['examDate', 'target', 'bank', 'showOld', 'artOrder', 'passive', 'sysTags'];
export const sig = (r) => JSON.stringify(Object.keys(r).filter((k) => k !== 't').sort().map((k) => [k, r[k]]));
export const listsSig = (s) => JSON.stringify([s.extraForms, s.extraAssess, s.removed]);
export const prefsSig = (s) => JSON.stringify(SYNC_PREFS.map((k) => s.prefs[k]));
export const byId = (a) => new Map(a.map((x) => [x.id, x]));
// [tombstone tag, state key, shape]: every record kind that syncs one by one
export const REC = [['i:', 'items', 'map'], ['s:', 'systems', 'map'], ['l:', 'log', 'list'], ['x:', 'extraSystems', 'list'], ['v:', 'conversions', 'map'],
  ['q:', 'qbanks', 'list'], ['a:', 'articles', 'map'], ['c:', 'artSections', 'list'], ['r:', 'artCustom', 'list'],
  ['p:', 'passive', 'map'], ['u:', 'pvSecs', 'list'], ['w:', 'pvCustom', 'list']];
export const records = (s) => REC.map(([tag, key, shape]) => [tag, shape === 'map' ? new Map(Object.entries(s[key])) : byId(s[key])]);

export function stamp(next, prev, now) {
  let changed = false;
  const before = new Map(records(prev));
  for (const [tag, cur] of records(next)) {
    const old = before.get(tag);
    for (const [id, r] of cur) {
      const p = old.get(id);
      if (!p || sig(p) !== sig(r)) { r.t = now; changed = true; } else r.t = Math.max(r.t || 0, p.t);
    }
    for (const id of old.keys()) if (!cur.has(id)) { next.deleted[tag + id] = now; changed = true; }
  }
  if (listsSig(next) !== listsSig(prev)) { next.lt = now; changed = true; }
  if (prefsSig(next) !== prefsSig(prev)) { next.pt = now; changed = true; }
  return changed;
}
// Mark the whole state as a fresh starting point (after import/erase).
export function stampAll(s, now) {
  for (const [, m] of records(s)) for (const r of m.values()) r.t = now;
  s.base = s.lt = s.pt = now;
  s.deleted = {};
}
// Order-independent comparison that ignores per-device prefs.
export function canon(s) {
  const sort = (v) => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
  const c = Object.assign({}, s, { prefs: Object.fromEntries(SYNC_PREFS.map((k) => [k, s.prefs[k]])) });
  for (const [, key, shape] of REC) if (shape === 'list') c[key] = s[key].slice().sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(sort(c));
}
export const same = (a, b) => canon(a) === canon(b);
// `first`: this device's first sync, so keep everything from both sides (nothing is dropped by `base`).
export function merge(a, b, opts) {
  const first = !!(opts && opts.first);
  const base = Math.max(a.base, b.base);
  const keep = (r) => r && (first || r.t >= base) ? r : null;
  const deleted = {};
  for (const s of [a, b]) for (const [k, t] of Object.entries(s.deleted)) if ((first || t >= base) && !(deleted[k] >= t)) deleted[k] = t;
  const pick = (x, y) => { x = keep(x); y = keep(y); return !x ? y : !y ? x : y.t > x.t ? y : x; };
  const join = (tag, ma, mb) => {
    const out = [];
    for (const id of new Set([...ma.keys(), ...mb.keys()])) {
      const r = pick(ma.get(id), mb.get(id));
      if (r && !(deleted[tag + id] > r.t)) out.push([id, clone(r)]);
    }
    return out;
  };
  const out = clone(a);
  out.base = base;
  const ra = new Map(records(a)), rb = new Map(records(b));
  for (const [tag, key, shape] of REC) {
    const joined = join(tag, ra.get(tag), rb.get(tag));
    out[key] = shape === 'map' ? Object.fromEntries(joined) : joined.map(([, r]) => r);
  }
  // Lists and plan prefs: newest wins. A tie (typically two devices whose data predates sync) keeps
  // everything: lists are combined and empty plan fields are filled from the other side.
  // A device's first sync (a = this device, b = the account's copy) never lets one side's lists or plan
  // replace the other's: a new phone where you only ticked "Show older forms" must not wipe the
  // account's test date, target or added forms. Lists are combined; the account's plan fields win
  // where they're set, this device fills the rest.
  const empty = (v) => !v || (Array.isArray(v) && !v.length);
  const union = (x, y) => { const o = clone(x); for (const k in y) o[k] = [...new Set([...(o[k] || []), ...y[k]])].sort((m, n) => m - n); return o; };
  if (first || a.lt === b.lt) {
    Object.assign(out, { extraForms: union(a.extraForms, b.extraForms), extraAssess: union(a.extraAssess, b.extraAssess), removed: [...new Set([...a.removed, ...b.removed])], lt: Math.max(a.lt, b.lt) });
  } else {
    const lw = b.lt > a.lt ? b : a;
    Object.assign(out, { extraForms: clone(lw.extraForms), extraAssess: clone(lw.extraAssess), removed: clone(lw.removed), lt: lw.lt });
  }
  if (first) {
    SYNC_PREFS.forEach((k) => { if (!empty(b.prefs[k])) out.prefs[k] = clone(b.prefs[k]); });
    out.pt = Math.max(a.pt, b.pt);
  } else if (a.pt !== b.pt) {
    const pw = b.pt > a.pt ? b : a;
    SYNC_PREFS.forEach((k) => (out.prefs[k] = clone(pw.prefs[k])));
    out.pt = pw.pt;
  } else SYNC_PREFS.forEach((k) => { if (empty(out.prefs[k]) && b.prefs[k]) out.prefs[k] = clone(b.prefs[k]); });
  // tombstones only need to outlive devices that haven't synced in a long while
  const cutoff = Date.now() - 400 * 864e5;
  out.deleted = Object.fromEntries(Object.entries(deleted).filter(([, t]) => t > cutoff));
  if (first) for (const [, m] of records(out)) for (const r of m.values()) if (r.t < base) r.t = base;
  return out;
}
