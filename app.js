(() => {
  'use strict';

  // ---------- catalog ----------
  // Self-assessments. `base` is the default list; newer releases can be added from the Assessments tab.
  const GROUPS = [
    { key: 'nbme', name: 'NBME CCSSA', short: 'NBME', qs: 200, scaled: true, min: 1, max: 99,
      desc: '200 questions in 4 blocks of 50 · log the 3-digit score and % correct',
      base: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], old: (n) => n <= 8,
      label: (n) => 'Form ' + n, full: (n) => 'NBME ' + n, tag: (n) => 'N' + n, addHint: 'Form #' },
    { key: 'uwsa', name: 'UWorld Self-Assessment', short: 'UWSA', qs: 160, scaled: true, min: 1, max: 9,
      desc: '160 questions in 4 blocks of 40 · log the 3-digit score and % correct',
      base: [1, 2, 3],
      label: (n) => 'UWSA ' + n, full: (n) => 'UWSA ' + n, tag: (n) => 'U' + n, addHint: 'UWSA #' },
    { key: 'f120', name: 'Free 120', short: 'Free 120', qs: 120, scaled: false, min: 2010, max: 2040,
      desc: '120 questions in 3 blocks of 40 · log % correct',
      base: [2019, 2021, 2023],
      label: (n) => n + ' release', full: (n) => 'Free 120 (' + n + ')', tag: (n) => 'F' + String(n).slice(2), addHint: 'Year' },
  ];

  const SUBJ = [
    { key: 'med',   name: 'Internal Medicine', latest: 10 },
    { key: 'surg',  name: 'Surgery',           latest: 9 },
    { key: 'peds',  name: 'Pediatrics',        latest: 9 },
    { key: 'obgyn', name: 'OB/GYN',            latest: 10 },
    { key: 'psych', name: 'Psychiatry',        latest: 8 },
    { key: 'neuro', name: 'Clinical Neurology',latest: 9 },
    { key: 'fm',    name: 'Family Medicine',   latest: 5 },
    { key: 'em',    name: 'Emergency Medicine',latest: 3 },
  ];
  const SYSTEMS = [
    ['cardio','Cardiovascular'],['resp','Pulmonary & Critical Care'],['gi','Gastrointestinal & Hepatology'],
    ['renal','Renal, Urology & Electrolytes'],['endo','Endocrine & Diabetes'],['heme','Hematology & Oncology'],
    ['id','Infectious Disease'],['immuno','Immunology, Allergy & Dermatology'],['rheum','Rheumatology & Musculoskeletal'],
    ['neuro','Neurology, Ophthalmology & ENT'],['psych','Psychiatry & Behavioral'],
    ['repro','Reproductive: OB, Gyn & Male'],
    ['peds','Pediatrics & Genetics'],['surg','Surgery & Trauma'],['emtox','Emergency Medicine & Toxicology'],
    ['biostat','Biostatistics & Epidemiology'],['ethics','Ethics, Communication & Patient Safety'],
  ].map(([id, name]) => ({ id: 'sys-' + id, name }));
  // old system ids folded into the merged ones
  const MERGE = { 'sys-male': 'sys-repro', 'sys-ob': 'sys-repro', 'sys-gyn': 'sys-repro', 'sys-ent': 'sys-neuro', 'sys-derm': 'sys-immuno' };
  const TAGS = ['Sketchy', 'UWorld', 'AMBOSS', 'Anki'];
  // Built-in qbanks; you can add more on the Qbank tab. Sessions point at a qbank by name.
  const QBANKS = [{ id: 'uworld', name: 'UWorld' }, { id: 'amboss', name: 'AMBOSS' }];
  const PASSES = 5; // read-throughs per AMBOSS article, as in the checklist

  const FORM_ST = ['Not taken', 'Taken', 'Reviewed', 'Anki made'];
  const SYS_ST = ['Not started', 'Learning', 'Qbank done', 'Revised'];
  const TABS = ['overview', 'nbme', 'cms', 'systems', 'qbank', 'articles'];
  const PASS = 218;
  const KEY = 'ck-tracker';

  // ---------- small helpers ----------
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  const $ = (id) => document.getElementById(id);
  const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
  const nn = (x) => x != null;
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const fmtPct = (v) => Math.round(v) + '%';
  const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n));
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const fmtDate = (d) => {
    if (!d) return '';
    const t = new Date(d + 'T00:00:00');
    return isNaN(t) ? d : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  };
  const fmtLong = (d) => {
    const t = new Date(d + 'T00:00:00');
    return isNaN(t) ? d : t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };
  const today = () => { const t = new Date(); return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  // dates as whole days (UTC-based, so daylight-saving changes never shift a day)
  const dayNum = (d) => { const [y, m, dd] = d.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, dd) / 864e5); };
  const fromDay = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
  const daysUntil = (d) => dayNum(d) - dayNum(today());
  const weekday = (n) => (new Date(n * 864e5).getUTCDay() + 6) % 7; // Monday = 0
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const slug = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fmtN = (n) => Math.round(n).toLocaleString('en-US');

  // AMBOSS articles from the Step 2 CK master checklist, in its order (its "Step 2 Prep Condensed"
  // list is left out). Your own sections come after these; your own articles can go in any section.
  const ARTICLE_SECTIONS = [
    ['psqi', 'High-Yield Patient Safety & Quality Improvement', ['Patient safety', 'Quality improvement']],
    ['screen', 'High-Yield Screening & Vaccination', ['Screening', 'Vaccination']],
    ['ethics', 'High-Yield Ethics', ['Challenging clinical and ethical scenarios']],
    ['biostat', 'High-Yield Biostatistics & Epidemiology', ['Epidemiology', 'Population health', 'Statistical analysis of data', 'Interpreting medical evidence', 'Research ethics']],
    ['nutrition', 'High-Yield Nutrition', ['Principles of nutrition', 'Vitamins', 'Trace elements', 'Acute primary malnutrition in children',
      'Unintentional weight loss and malnutrition in adults', 'Overweight and obesity', 'Specialized nutrition support']],
    ['extra', 'Recommended Extra Articles', ['Preventive medicine', 'Health care system', 'Infection prevention and control', 'Overview of palliative medicine',
      'Death', 'Grief and end-of-life counseling', 'Pain management', 'Managing chronic conditions', 'Logistics of US health care and hospitals']],
  ].map(([key, name, list]) => ({ id: 'sec-' + key, name, builtIn: true,
    articles: list.map((n) => ({ id: ('amb-' + key + '-' + slug(n)).slice(0, 48).replace(/-+$/, ''), name: n, sec: 'sec-' + key, builtIn: true })) }));

  // ---------- sanitising (old saves and imported files) ----------
  const ID_RE = /^[a-z0-9-]{1,48}$/i;
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const arr = (x) => (Array.isArray(x) ? x : []);
  const str = (x, max = 4000) => (typeof x === 'string' ? x.slice(0, max) : typeof x === 'number' && Number.isFinite(x) ? String(x) : '');
  const int = (x, lo, hi) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
  const isDate = (x) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(new Date(x + 'T00:00:00')) ? x : '');
  const inRange = (x, lo, hi) => { const v = num(x); return v != null && v >= lo && v <= hi ? String(v) : ''; };
  const stampOf = (x) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
  const ints = (a, lo, hi) => [...new Set(arr(a).map(Number).filter((n) => Number.isInteger(n) && n >= lo && n <= hi))].sort((x, y) => x - y);

  function normItem(x) {
    x = obj(x);
    return { status: int(x.status, 0, 3), score: str(x.score, 12), pct: str(x.pct, 12), date: isDate(x.date), notes: str(x.notes),
      weak: [...new Set(arr(x.weak).filter((w) => typeof w === 'string' && ID_RE.test(w)))].slice(0, 60), t: stampOf(x.t) };
  }
  function normSys(x) {
    x = obj(x);
    return { status: int(x.status, 0, 3), conf: int(x.conf, 0, 5), notes: str(x.notes), uw: str(x.uw, 12),
      tags: [...new Set(arr(x.tags).filter((t) => typeof t === 'string').map((t) => t.slice(0, 30)))], day: isDate(x.day), t: stampOf(x.t) };
  }
  const safeUrl = (x) => { try { const u = new URL(String(x).trim()); return /^https?:$/.test(u.protocol) ? u.href.slice(0, 500) : ''; } catch (e) { return ''; } };
  function normQbank(x) {
    x = obj(x);
    const name = str(x.name, 40).trim();
    if (typeof x.id !== 'string' || !ID_RE.test(x.id) || !name) return null;
    const unit = x.unit === 'pct' ? 'pct' : 'q';
    return { id: x.id, name, bank: inRange(x.bank, 1, 50000), done: inRange(x.done, 0, unit === 'pct' ? 100 : 50000), unit, acc: inRange(x.acc, 0, 100), t: stampOf(x.t) };
  }
  const blankQbank = (d) => ({ id: d.id, name: d.name, bank: '', done: '', unit: 'q', acc: '', t: 0 });
  function normArt(x) {
    x = obj(x);
    return { reads: int(x.reads, 0, PASSES), date: isDate(x.date), notes: str(x.notes), t: stampOf(x.t) };
  }
  function normLog(x) {
    x = obj(x);
    const date = isDate(x.date), q = int(x.q, 0, 5000);
    if (!date || !q) return null;
    return { id: typeof x.id === 'string' && ID_RE.test(x.id) ? x.id : uid(), date, q, pct: inRange(x.pct, 0, 100),
      src: str(x.src, 40).trim() || 'UWorld', note: str(x.note, 200), t: stampOf(x.t) };
  }
  function migrate(sys) {
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
  const blank = () => ({ v: 2, base: 0, deleted: {}, lt: 0, pt: 0, items: {}, systems: {}, extraForms: {}, extraAssess: {}, extraSystems: [], removed: [], log: [],
    qbanks: QBANKS.map(blankQbank), articles: {}, artSections: [], artCustom: [],
    prefs: { showOld: false, theme: 'system', examDate: '', target: '', bank: '', chart: 'score', sysSort: 'default', lastBackup: '',
      artOrder: [], artView: 'grid', artSort: 'checklist', artCollapsed: [] } });

  // Accepts v1 saves (the original single-file version) and v2.
  function norm(s) {
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
    for (const [k, t] of Object.entries(obj(s.deleted))) if (/^[ilsxqacr]:[a-z0-9-]{1,48}$/i.test(k) && stampOf(t)) deleted[k] = stampOf(t);
    const qIn = arr(s.qbanks).map(normQbank).filter(Boolean);
    const qbanks = QBANKS.map((d) => Object.assign(qIn.find((x) => x.id === d.id) || blankQbank(d), { name: d.name }))
      .concat(qIn.filter((x) => !QBANKS.some((d) => d.id === x.id)));
    if (!qbanks[0].bank) qbanks[0].bank = inRange(p.bank, 1, 50000); // v2 kept the UWorld bank size in prefs
    const articles = {};
    for (const [id, x] of Object.entries(obj(s.articles))) if (ID_RE.test(id)) articles[id] = normArt(x);
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
      qbanks, articles, artSections, artCustom,
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
      },
    };
  }

  // ---------- state + storage ----------
  let state = blank();
  const ui = { tab: 'overview', subj: 'all', st: 'all', addingFor: null, focusAdd: false, editForms: false, logAll: false, heatDay: '', weakAll: false, prevTab: 'overview', artArrange: false,
    artF: 'all', artQ: '', artAdding: null, artNewSec: false, artRename: null, artJump: '' };
  let saveTimer = null, storageOk = true, storageMsg = '';
  let saved = blank(); // copy of what is in storage, used to stamp what changed
  const cloud = () => window.CKCloud || null;

  const item = (id) => state.items[id] || { status: 0, score: '', pct: '', date: '', notes: '', weak: [] };
  const sysItem = (id) => state.systems[id] || normSys(null);

  // Header status: local save state first, then Google sync state when signed in.
  let localSave = { cls: '', text: 'Saved on this device' };
  const setSave = (cls, text) => { localSave = { cls, text }; paintStatus(); };
  function paintStatus() {
    const c = cloud() && cloud().status();
    let { cls, text } = localSave;
    if (c && c.connected && !cls && c.short) { cls = { syncing: 'busy', connecting: 'busy', error: 'off', offline: 'off', expired: 'off' }[c.state] || ''; text = c.short; }
    $('save').className = 'save ' + cls;
    $('save-t').textContent = text;
    $('save').title = c && c.message ? c.message : '';
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); }
    catch (e) { storageOk = false; storageMsg = 'Your browser is blocking storage for this page, so nothing you log will be kept after you close it. Allow site data, or export a backup before leaving.'; return blank(); }
    if (!raw) return blank();
    try { return norm(JSON.parse(raw)); }
    catch (e) {
      // keep the unreadable copy so it can be recovered by hand
      try { localStorage.setItem(KEY + '-unreadable-' + Date.now(), raw); } catch (e2) {}
      storageMsg = 'Your saved data couldn’t be read, so the tracker started fresh. The old copy was kept in browser storage; import a backup to restore your progress.';
      return blank();
    }
  }
  function save() {
    setSave('busy', 'Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 300);
  }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    const changed = stamp(state, saved, Date.now());
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      saved = clone(state);
      storageOk = true;
      setSave('', 'Saved on this device');
      if (changed && cloud()) cloud().markDirty();
    } catch (e) {
      storageOk = false;
      setSave('off', e && e.name === 'QuotaExceededError' ? 'Not saved — storage full' : 'Not saved — storage blocked');
      storageMsg = 'Changes can’t be saved in this browser right now. Export a backup from Settings so you don’t lose them.';
      renderNotice();
    }
  }
  window.addEventListener('pagehide', () => { if (saveTimer) flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) flush(); });
  // another tab changed the data
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue || saveTimer) return;
    try { state = norm(JSON.parse(e.newValue)); } catch (err) { return; }
    saved = clone(state);
    applyTheme(); render(); refreshSheet();
  });
  // Write a state that came from elsewhere (Google) without re-stamping it as a local edit.
  function persistQuiet() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); saved = clone(state); } catch (e) {}
  }

  // ---------- change stamps + merge (for Google sync) ----------
  // Each record carries `t`, the time of its last change, and deletions leave a tombstone in `deleted`.
  // A full restore or erase bumps `base`: on merge, anything older than the newest base is dropped,
  // so the restore wins on every device. Lists of added/hidden forms (`lt`) and the plan prefs (`pt`)
  // merge as a unit, newest wins. Theme and other view prefs stay per device.
  const SYNC_PREFS = ['examDate', 'target', 'bank', 'showOld', 'artOrder'];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const sig = (r) => JSON.stringify(Object.keys(r).filter((k) => k !== 't').sort().map((k) => [k, r[k]]));
  const listsSig = (s) => JSON.stringify([s.extraForms, s.extraAssess, s.removed]);
  const prefsSig = (s) => JSON.stringify(SYNC_PREFS.map((k) => s.prefs[k]));
  const byId = (a) => new Map(a.map((x) => [x.id, x]));
  // [tombstone tag, state key, shape]: every record kind that syncs one by one
  const REC = [['i:', 'items', 'map'], ['s:', 'systems', 'map'], ['l:', 'log', 'list'], ['x:', 'extraSystems', 'list'],
    ['q:', 'qbanks', 'list'], ['a:', 'articles', 'map'], ['c:', 'artSections', 'list'], ['r:', 'artCustom', 'list']];
  const records = (s) => REC.map(([tag, key, shape]) => [tag, shape === 'map' ? new Map(Object.entries(s[key])) : byId(s[key])]);

  function stamp(next, prev, now) {
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
  function stampAll(s, now) {
    for (const [, m] of records(s)) for (const r of m.values()) r.t = now;
    s.base = s.lt = s.pt = now;
    s.deleted = {};
  }
  // Order-independent comparison that ignores per-device prefs.
  function canon(s) {
    const sort = (v) => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
    const c = Object.assign({}, s, { prefs: Object.fromEntries(SYNC_PREFS.map((k) => [k, s.prefs[k]])) });
    for (const [, key, shape] of REC) if (shape === 'list') c[key] = s[key].slice().sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify(sort(c));
  }
  const same = (a, b) => canon(a) === canon(b);
  // `first`: this device's first sync, so keep everything from both sides (nothing is dropped by `base`).
  function merge(a, b, opts) {
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
    if (a.lt !== b.lt) {
      const lw = b.lt > a.lt ? b : a;
      Object.assign(out, { extraForms: clone(lw.extraForms), extraAssess: clone(lw.extraAssess), removed: clone(lw.removed), lt: lw.lt });
    } else {
      const union = (x, y) => { const o = clone(x); for (const k in y) o[k] = [...new Set([...(o[k] || []), ...y[k]])].sort((m, n) => m - n); return o; };
      Object.assign(out, { extraForms: union(a.extraForms, b.extraForms), extraAssess: union(a.extraAssess, b.extraAssess), removed: [...new Set([...a.removed, ...b.removed])] });
    }
    if (a.pt !== b.pt) {
      const pw = b.pt > a.pt ? b : a;
      SYNC_PREFS.forEach((k) => (out.prefs[k] = clone(pw.prefs[k])));
      out.pt = pw.pt;
    } else SYNC_PREFS.forEach((k) => { if ((!out.prefs[k] || (Array.isArray(out.prefs[k]) && !out.prefs[k].length)) && b.prefs[k]) out.prefs[k] = clone(b.prefs[k]); });
    // tombstones only need to outlive devices that haven't synced in a long while
    const cutoff = Date.now() - 400 * 864e5;
    out.deleted = Object.fromEntries(Object.entries(deleted).filter(([, t]) => t > cutoff));
    if (first) for (const [, m] of records(out)) for (const r of m.values()) if (r.t < base) r.t = base;
    return out;
  }

  // Undo: capture the whole state before a destructive change.
  function snapshot() {
    const snap = JSON.stringify(state);
    return () => {
      const before = state.base;
      state = norm(JSON.parse(snap));
      // undoing an import/erase is itself a fresh starting point
      if (state.base !== before) stampAll(state, Date.now());
      applyTheme(); save(); render(); refreshSheet();
    };
  }
  function toast(msg, undo) {
    const t = h('div', { class: 'toast' }, h('span', { text: msg }));
    if (undo) t.append(h('button', { onclick: () => { undo(); t.remove(); } }, 'Undo'));
    $('toasts').replaceChildren(t);
    setTimeout(() => t.remove(), undo ? 8000 : 4000);
  }

  function applyTheme() {
    const t = state.prefs.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      const dark = t === 'dark' || (t === 'system' && (m.getAttribute('media') || '').includes('dark'));
      m.setAttribute('content', dark ? '#0e131a' : '#f3f5f8');
    });
    const b = $('theme-btn');
    b.innerHTML = THEME_ICON[t];
    const label = 'Theme: ' + { system: 'matches your device', light: 'light', dark: 'dark' }[t] + '. Tap to switch.';
    b.setAttribute('aria-label', label);
    b.title = label;
  }
  const svgIcon = (body) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  const THEME_ICON = {
    light: svgIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    dark: svgIcon('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    system: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>'),
  };
  // From "match device", the first tap always flips what you see; the third returns to matching the device.
  function cycleTheme() {
    const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const flip = sysDark ? 'light' : 'dark', same = sysDark ? 'dark' : 'light';
    const t = state.prefs.theme;
    state.prefs.theme = t === 'system' ? flip : t === flip ? same : 'system';
    applyTheme(); save(); refreshSheet();
    toast({ light: 'Light mode', dark: 'Dark mode', system: 'Theme matches your device' }[state.prefs.theme]);
  }
  $('theme-btn').addEventListener('click', cycleTheme);

  // ---------- forms ----------
  function testForms(g, includeHidden) {
    const rm = new Set(state.removed);
    const ns = new Set(g.base);
    (state.extraAssess[g.key] || []).forEach((n) => ns.add(n));
    return [...ns].sort((a, b) => a - b).map((n) => {
      const id = g.key + '-' + n;
      return { id, n, g, kind: 'test', label: g.label(n), full: g.full(n), tag: g.tag(n),
        old: !!(g.old && g.old(n)), extra: !g.base.includes(n), removed: rm.has(id) };
    }).filter((f) => includeHidden || !f.removed);
  }
  function cmsForms(s, includeOld, includeRemoved) {
    const rm = new Set(state.removed);
    const ns = new Set();
    for (let n = 1; n <= s.latest; n++) ns.add(n);
    (state.extraForms[s.key] || []).forEach((n) => ns.add(n));
    return [...ns].sort((a, b) => a - b).map((n) => {
      const id = 'cms-' + s.key + '-' + n;
      const extra = n > s.latest;
      const old = !extra && n <= s.latest - 4;
      return { id, n, kind: 'cms', label: 'Form ' + n, full: s.name + ' Form ' + n, old, subj: s, removed: rm.has(id), extra };
    }).filter((f) => (includeRemoved || !f.removed) && (includeOld || !f.old || item(f.id).status > 0));
  }
  const allTests = () => GROUPS.flatMap((g) => testForms(g));
  const allCms = () => SUBJ.flatMap((s) => cmsForms(s, state.prefs.showOld));
  const allSystems = () => SYSTEMS.concat(state.extraSystems);
  // "Renal, Urology & Electrolytes" -> "Renal"
  const shortSys = (name) => name.split(/,| &|:/)[0].trim();
  const weakNames = (ids) => ids.map((id) => allSystems().find((x) => x.id === id)).filter(Boolean).map((x) => shortSys(x.name)).join(', ');
  // Which systems you marked weak across self-assessments, most often first.
  function weakPattern() {
    const flagged = allTests().filter((f) => item(f.id).weak.length);
    const by = new Map();
    flagged.forEach((f) => item(f.id).weak.forEach((id) => { if (!by.has(id)) by.set(id, []); by.get(id).push(f); }));
    const order = (f) => item(f.id).date || '9999';
    const rows = [...by].map(([id, fs]) => ({ sy: allSystems().find((x) => x.id === id), fs: fs.sort((a, b) => order(a).localeCompare(order(b))) }))
      .filter((r) => r.sy).sort((a, b) => b.fs.length - a.fs.length || a.sy.name.localeCompare(b.sy.name));
    return { rows, flagged: flagged.length };
  }
  const artItem = (id) => state.articles[id] || { reads: 0, date: '', notes: '', t: 0 };
  // Checklist sections first (with any articles you added to them), then your own sections.
  function artSections() {
    const mine = (secId) => state.artCustom.filter((x) => x.sec === secId).map((x) => ({ id: x.id, name: x.name, sec: x.sec, url: x.url, builtIn: false }));
    return ARTICLE_SECTIONS.map((sec) => Object.assign({}, sec, { articles: sec.articles.concat(mine(sec.id)) }))
      .concat(state.artSections.map((sec) => ({ id: sec.id, name: sec.name, builtIn: false, articles: mine(sec.id) })));
  }
  const allArticles = () => artSections().flatMap((sec) => sec.articles);
  const artUrl = (ar) => ar.url || 'https://next.amboss.com/us/search?q=' + encodeURIComponent(ar.name) + '&v=overview';
  const taken = (f) => item(f.id).status > 0;
  // CMS keeps % correct in `score` (v1 format); assessments keep the 3-digit score in `score` and % in `pct`.
  const scaledOf = (f) => (f.kind === 'test' && f.g.scaled ? num(item(f.id).score) : null);
  const pctOf = (f) => num(f.kind === 'cms' ? item(f.id).score : item(f.id).pct);

  function toggleRemove(f) {
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
  function addForm(kind, grp, n) {
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
  const ORDER = (f) => (f.kind === 'test' ? GROUPS.indexOf(f.g) * 1e4 + f.n : 9e4 + f.n);
  const chrono = (a, b) => {
    const da = a.it.date, db = b.it.date;
    if (da && db && da !== db) return da.localeCompare(db);
    if (da && !db) return -1;
    if (db && !da) return 1;
    return ORDER(a.f) - ORDER(b.f);
  };
  function trendPoints(mode) {
    return allTests().filter((f) => mode === 'pct' || f.g.scaled)
      .map((f) => ({ f, it: item(f.id), v: mode === 'pct' ? pctOf(f) : scaledOf(f) }))
      .filter((p) => p.v != null).sort(chrono);
  }
  // Score outlook: latest, best, recent average and a straight-line projection to test day.
  function outlook() {
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
  const band = (kind, s) => {
    if (s == null) return '';
    if (kind === 'score') {
      const good = num(state.prefs.target) || 250;
      return s >= good ? 'sc-good' : s >= Math.min(230, good - 10) ? 'sc-warn' : 'sc-bad';
    }
    return s >= 80 ? 'sc-good' : s >= 65 ? 'sc-warn' : 'sc-bad';
  };

  // One qbank: the progress you entered as "done so far" plus every session logged for it.
  function bankStats(qb) {
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
      started: dv != null || da != null || logs.length > 0 };
  }
  function qbStats() {
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
  const isEmpty = () => !Object.keys(state.items).length && !Object.keys(state.systems).length && !state.log.length && !state.prefs.examDate;

  // ---------- tabs ----------
  const VIEWS = TABS.concat('settings');
  function showTab(t, push) {
    if (!VIEWS.includes(t)) t = 'overview';
    const entering = t === 'settings' && ui.tab !== 'settings';
    if (t !== 'settings') settingsRefresh = null;
    ui.tab = t;
    $('open-settings').setAttribute('aria-pressed', t === 'settings' ? 'true' : 'false');
    document.querySelectorAll('.tab').forEach((b) => {
      const on = b.dataset.tab === t;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on || (t === 'settings' && b.dataset.tab === ui.prevTab) ? 0 : -1;
    });
    document.querySelectorAll('section.view').forEach((s) => (s.hidden = s.id !== 'view-' + t));
    if (push && location.hash !== '#' + t) try { history.pushState(null, '', '#' + t); } catch (e) {}
    if (entering) { buildSettings(); window.scrollTo(0, 0); }
    render();
  }
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) showTab(b.dataset.tab, true); });
  $('tabs').addEventListener('keydown', (e) => {
    const i = TABS.indexOf(ui.tab);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (j == null) return;
    e.preventDefault();
    const t = TABS[(j + TABS.length) % TABS.length];
    showTab(t, true);
    $('tab-' + t).focus();
  });
  window.addEventListener('popstate', () => {
    const t = location.hash.slice(1) || 'overview';
    if (sheetOpen) closeSheet();
    if (t === 'settings' && ui.tab !== 'settings') ui.prevTab = ui.tab;
    if (t !== ui.tab) showTab(t);
  });

  // ---------- render ----------
  function render() {
    renderCounts();
    if (ui.tab === 'overview') renderOverview();
    if (ui.tab === 'nbme') renderTests();
    if (ui.tab === 'cms') renderCms();
    if (ui.tab === 'systems') renderSystems();
    if (ui.tab === 'qbank') renderQbank();
    if (ui.tab === 'articles') renderArticles();
    if (ui.tab === 'settings' && settingsRefresh) settingsRefresh();
  }
  function renderNotice() {
    $('notice').replaceChildren(...(storageMsg ? [h('div', { class: 'banner', style: 'margin-bottom:20px', text: storageMsg })] : []));
  }

  function renderCounts() {
    const tests = allTests();
    $('ct-nbme').textContent = tests.filter(taken).length + '/' + tests.length;
    const cms = allCms();
    $('ct-cms').textContent = cms.filter(taken).length + '/' + cms.length;
    const sy = allSystems();
    $('ct-sys').textContent = sy.filter((s) => sysItem(s.id).status === 3).length + '/' + sy.length;
    const q = sum(state.log.map((e) => e.q));
    $('ct-qb').textContent = q ? fmtK(q) : '';
    const arts = allArticles();
    $('ct-art').textContent = arts.filter((a) => artItem(a.id).reads > 0).length + '/' + arts.length;
  }

  function tile(label, big, small, frac, note) {
    return h('div', { class: 'tile' },
      h('div', { class: 'eyebrow', text: label }),
      h('div', { class: 'big' }, big, small ? h('small', { text: small }) : null),
      frac != null ? h('div', { class: 'meter' }, h('b', { style: 'width:' + Math.round(Math.min(1, frac) * 100) + '%' })) : null,
      note ? h('div', { class: 'note' }, note) : null);
  }

  function renderOverview() {
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

  // Bars of how many reviewed forms flagged each system; 2+ forms is a pattern.
  function renderWeak(box) {
    const { rows, flagged } = weakPattern();
    if (!rows.length) {
      box.replaceChildren(h('p', { class: 'sub', text: 'When you review an NBME, UWSA or Free 120, open it and tap the systems you were weak in. The ones that keep coming back show up here.' }),
        h('button', { class: 'btn', style: 'margin-top:12px', onclick: () => showTab('nbme', true) }, 'Go to assessments'));
      return;
    }
    const shown = ui.weakAll ? rows : rows.slice(0, 8);
    box.replaceChildren(...[h('div', { class: 'sbars' }, shown.map((r) => {
      const n = r.fs.length, rec = n >= 2;
      return h('button', { class: 'sbar weakbar' + (rec ? ' rec' : ''), 'data-open': r.sy.id, onclick: () => openSystem(r.sy), title: r.sy.name + ': ' + r.fs.map((f) => f.full).join(', '),
        'aria-label': r.sy.name + ' weak in ' + n + ' of ' + flagged + ' forms: ' + r.fs.map((f) => f.full).join(', ') },
        h('span', { class: 'lbl', text: shortSys(r.sy.name) }),
        h('span', { class: 'segbar', 'aria-hidden': 'true' }, h('span', { style: 'width:' + (n / flagged * 100) + '%;background:' + (rec ? 'var(--bad)' : 'var(--s1)') })),
        h('span', { class: 'val' }, n + '/' + flagged, h('small', { text: ' ' + r.fs.map((f) => f.tag).join(' ') })));
    })), rows.length > 8 ? h('button', { class: 'linkish', style: 'margin-top:10px', onclick: () => { ui.weakAll = !ui.weakAll; render(); } }, ui.weakAll ? 'Show fewer' : 'Show all ' + rows.length) : null,
      h('p', { class: 'hint', style: 'margin-top:10px', text: 'Red = weak in 2 or more of the ' + plural(flagged, 'form') + ' you marked. Tap a system for its notes and status.' })].filter(Boolean));
  }

  function renderNext(tests, cms, qb, dl) {
    const lis = [];
    const go = (text, fn, key) => h('button', { class: 'go', onclick: fn, 'data-open': key || null }, text);
    const left = tests.filter((f) => !taken(f) && !f.old);
    const nextT = left.find((f) => f.g.key !== 'f120') || left[0];
    if (nextT) lis.push(['Next', go('Take ' + nextT.full, () => openForm(nextT), nextT.id)]);
    if (dl != null && dl > 0 && left.length) {
      const every = dl / left.length;
      lis.push(['Pace', left.length + ' assessment' + (left.length > 1 ? 's' : '') + ' left in ' + plural(dl, 'day') +
        (every >= 1 ? ' · about one every ' + (every < 10 ? every.toFixed(1).replace(/\.0$/, '') : Math.round(every)) + ' days' : ' · more than one a day — consider trimming the list')]);
    }
    const paced = qb.banks.filter((b) => b.left != null && b.started);
    if (paced.length && dl != null && dl > 0) {
      lis.push(['Qbank', paced.map((b) => b.left > 0 ? b.qb.name + ' ' + fmtN(b.left) + ' left (~' + Math.ceil(b.left / dl) + '/day)' : b.qb.name + ' finished').join(' · ')]);
    }
    const pattern = weakPattern().rows.filter((r) => r.fs.length >= 2);
    if (pattern.length) lis.push(['Pattern', go(pattern.slice(0, 3).map((r) => shortSys(r.sy.name) + ' (' + r.fs.length + ' forms)').join(', ') + ' keep coming up weak', () => openSystem(pattern[0].sy), pattern[0].sy.id)]);
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

  function drawTrend() {
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
  function activityByDay() {
    const act = new Map();
    const get = (d) => { if (!act.has(d)) act.set(d, { q: 0, src: {}, tests: [], cms: [], sys: [], arts: [] }); return act.get(d); };
    state.log.forEach((e) => { const a = get(e.date); a.q += e.q; a.src[e.src] = (a.src[e.src] || 0) + e.q; });
    allTests().forEach((f) => { const it = item(f.id), s3 = scaledOf(f), p = pctOf(f); if (it.status > 0 && it.date) get(it.date).tests.push(f.full + (s3 != null ? ' · ' + s3 : p != null ? ' · ' + fmtPct(p) : '')); });
    SUBJ.flatMap((s) => cmsForms(s, true)).forEach((f) => { const it = item(f.id), p = pctOf(f); if (it.status > 0 && it.date) get(it.date).cms.push(f.full + (p != null ? ' · ' + fmtPct(p) : '')); });
    allSystems().forEach((sy) => { const it = sysItem(sy.id); if (it.day) get(it.day).sys.push(sy.name + ' (' + SYS_ST[it.status].toLowerCase() + ')'); });
    allArticles().forEach((ar) => { const it = artItem(ar.id); if (it.reads && it.date) get(it.date).arts.push(ar.name); });
    return act;
  }
  const dayText = (ds, a) => {
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
  function renderHeat(box) {
    const weeks = 20, t = dayNum(today());
    const start = t - weekday(t) - (weeks - 1) * 7;
    const act = activityByDay();
    const cells = [], months = [];
    const tot = { days: 0, q: 0, tests: 0, cms: 0, sys: 0 };
    let prevMonth = null, lastActive = null;
    for (let w = 0; w < weeks; w++) {
      const mon = new Date((start + w * 7) * 864e5).getUTCMonth();
      // label each month at its first week; skip a leading partial month that would collide with the next label
      const nextMon = new Date((start + (w + 2) * 7) * 864e5).getUTCMonth();
      if (mon !== prevMonth) {
        if (w > 0 || nextMon === mon) months.push(h('span', { style: 'grid-column:' + (w + 1) + '/span 3', text: new Date((start + w * 7) * 864e5).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) }));
        prevMonth = mon;
      }
      for (let d = 0; d < 7; d++) {
        const n = start + w * 7 + d;
        if (n > t) { cells.push(h('i', { class: 'hc fut' })); continue; }
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
    const detail = h('p', { class: 'heat-detail', 'aria-live': 'polite', text: shown ? dayText(shown, act.get(shown)) : 'Nothing logged in the last 20 weeks yet.' });
    const cols = 'grid-template-columns:repeat(' + weeks + ',minmax(0,1fr))';
    const grid = h('div', { class: 'heat', style: cols, role: 'img', 'aria-label': 'Activity over the last ' + weeks + ' weeks: ' + plural(tot.days, 'active day') + ', ' + tot.q + ' qbank questions, ' +
      plural(tot.tests, 'self-assessment') + ', ' + plural(tot.cms, 'CMS form') + ', ' + plural(tot.sys, 'system update') }, cells);
    grid.addEventListener('click', (e) => {
      const c = e.target.closest('.hc[data-day]'); if (!c) return;
      ui.heatDay = c.dataset.day;
      grid.querySelectorAll('.hc.sel').forEach((x) => x.classList.remove('sel'));
      c.classList.add('sel');
      detail.textContent = dayText(ui.heatDay, act.get(ui.heatDay));
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
        h('span', null, h('i', { class: 'hc m-sys' }), 'System update')),
      h('p', { class: 'heat-sum', text: [plural(tot.days, 'active day'), fmtN(tot.q) + ' questions', plural(tot.tests, 'assessment'), plural(tot.cms, 'CMS form'), plural(tot.sys, 'system update')].join(' · ') }));
  }

  function statusPill(st, labels) {
    return h('span', { class: 'status st' + st }, h('i'), labels[st]);
  }

  // ---------- assessments tab ----------
  function renderTests() {
    $('tests').replaceChildren(...GROUPS.map((g) => {
      const all = testForms(g, true), forms = all.filter((f) => !f.removed);
      const nHidden = all.length - forms.length;
      const done = forms.filter(taken).length;
      const a3 = avg(forms.map(scaledOf).filter(nn)), ap = avg(forms.map(pctOf).filter(nn));
      const rows = forms.map((f) => {
        const it = item(f.id), s3 = scaledOf(f), p = pctOf(f);
        const main = g.scaled ? s3 : p;
        return h('button', { class: 'row', 'data-open': f.id, onclick: () => openForm(f),
          'aria-label': f.full + ', ' + FORM_ST[it.status] + (s3 != null ? ', score ' + s3 : '') + (p != null ? ', ' + fmtPct(p) + ' correct' : '') },
          h('span', { class: 'nm' }, f.label, f.old ? h('span', { class: 'old', text: 'older' }) : null),
          h('span', { style: 'min-width:0' }, statusPill(it.status, FORM_ST),
            it.weak.length || it.notes ? h('span', { class: 'notes-p' }, it.weak.length ? h('b', { class: 'weak-l', text: 'Weak: ' + weakNames(it.weak) }) : null, it.weak.length && it.notes ? ' · ' : '', it.notes || '') : null),
          h('span', { class: 'sc' + (main == null && p == null ? ' none' : '') },
            g.scaled ? h('b', { class: band('score', s3), text: s3 != null ? String(s3) : '—' }) : h('b', { text: p != null ? fmtPct(p) : '—' }),
            g.scaled && p != null ? h('small', { text: fmtPct(p) }) : null),
          h('span', { class: 'dt', text: fmtDate(it.date) }));
      });
      let add;
      if (ui.addingFor === g.key) {
        const inp = h('input', { type: 'number', min: String(g.min), max: String(g.max), step: '1', placeholder: g.addHint, 'aria-label': 'New ' + g.short + ' ' + g.addHint.toLowerCase() });
        const submit = () => {
          const n = parseInt(inp.value, 10);
          if (!(n >= g.min && n <= g.max)) { inp.focus(); inp.select(); return; }
          ui.addingFor = null; toast(addForm('test', g, n)); render();
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { ui.addingFor = null; render(); } });
        add = h('div', { class: 'add-row' }, inp, h('button', { onclick: submit }, 'Add'), h('button', { class: 'ghost', onclick: () => { ui.addingFor = null; render(); } }, 'Cancel'));
        if (ui.focusAdd) { ui.focusAdd = false; setTimeout(() => inp.focus(), 0); }
      } else {
        add = h('button', { class: 'add-link', onclick: () => { ui.addingFor = g.key; ui.focusAdd = true; render(); } }, g.key === 'f120' ? '+ Add a release' : '+ Add form');
      }
      return h('div', { class: 'group' },
        h('div', { class: 'subj-head' }, h('h3', { text: g.name }),
          h('span', { class: 'stat' }, done + '/' + forms.length + ' done',
            a3 != null ? h('span', { class: band('score', a3), text: ' · avg ' + Math.round(a3) }) : null,
            ap != null ? ' · avg ' + fmtPct(ap) : null),
          nHidden ? h('button', { class: 'linkish', onclick: () => {
            const undo = snapshot();
            const ids = new Set(all.filter((f) => f.removed).map((f) => f.id));
            state.removed = state.removed.filter((id) => !ids.has(id)); save(); render();
            toast(plural(ids.size, 'form') + ' restored', undo);
          } }, nHidden + ' hidden · restore') : null),
        h('p', { class: 'sub', text: g.desc }),
        h('div', { class: 'rows' }, rows, add));
    }));
  }

  // ---------- CMS tab ----------
  function renderCms() {
    $('cms-subj').replaceChildren(
      h('button', { class: 'pill', 'aria-pressed': ui.subj === 'all' ? 'true' : 'false', onclick: () => { ui.subj = 'all'; render(); } }, 'All subjects'),
      ...SUBJ.map((s) => h('button', { class: 'pill', 'aria-pressed': ui.subj === s.key ? 'true' : 'false', onclick: () => { ui.subj = s.key; render(); } }, s.name)));
    document.querySelectorAll('[data-st]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.st === ui.st ? 'true' : 'false'));
    $('show-old').checked = !!state.prefs.showOld;
    const eb = $('edit-forms');
    eb.setAttribute('aria-pressed', ui.editForms ? 'true' : 'false');
    eb.textContent = ui.editForms ? 'Done editing' : 'Edit list';

    const subs = SUBJ.filter((s) => ui.subj === 'all' || ui.subj === s.key);
    const bar = ui.editForms ? h('div', { class: 'editbar' },
      h('span', { text: 'Tap × to remove a form, ↺ to bring it back. Your scores are kept.' }),
      h('button', { class: 'btn primary', onclick: () => { ui.editForms = false; render(); } }, 'Done')) : null;
    $('cms-list').replaceChildren(...[bar].filter(Boolean), ...subs.map((s) => {
      const visibleAll = cmsForms(s, state.prefs.showOld);
      const nRemoved = cmsForms(s, true, true).filter((f) => f.removed).length;
      const forms = ui.editForms ? cmsForms(s, state.prefs.showOld, true)
        : visibleAll.filter((f) => ui.st === 'all' || (ui.st === 'todo' ? item(f.id).status === 0 : item(f.id).status > 0));
      const done = visibleAll.filter(taken).length;
      const a = avg(visibleAll.map(pctOf).filter(nn));
      const chips = forms.map((f) => {
        const it = item(f.id), v = pctOf(f);
        if (ui.editForms) {
          return h('button', { class: 'chip editing ' + (f.removed ? 'removed' : 's' + it.status), 'aria-label': (f.removed ? 'Restore ' : 'Remove ') + s.name + ' ' + f.label,
            onclick: () => {
              const undo = f.extra ? snapshot() : null;
              toggleRemove(f);
              if (undo) toast(s.name + ' ' + f.label + ' removed', undo);
            } },
            h('span', { class: 'del', 'aria-hidden': 'true', text: f.removed ? '↺' : '×' }),
            h('span', { class: 'nm' }, f.label, f.old ? h('span', { class: 'old', text: 'older' }) : null),
            h('span', { class: 'sc none', text: f.removed ? 'Removed' : v != null ? fmtPct(v) : FORM_ST[it.status] }),
            h('span', { class: 'steps', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
        }
        return h('button', { class: 'chip s' + it.status, 'data-open': f.id, onclick: () => openForm(f), 'aria-label': s.name + ' ' + f.label + ', ' + FORM_ST[it.status] + (v != null ? ', ' + fmtPct(v) : '') },
          h('span', { class: 'nm' }, f.label, f.old ? h('span', { class: 'old', text: 'older' }) : null),
          v != null ? h('span', { class: 'sc ' + band('cms', v), text: fmtPct(v) }) : h('span', { class: 'sc none', text: FORM_ST[it.status] }),
          h('span', { class: 'steps', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
      });
      if (ui.addingFor === s.key) {
        const inp = h('input', { type: 'number', min: '1', max: '99', placeholder: 'Form #', 'aria-label': 'New ' + s.name + ' form number' });
        const add = () => {
          const n = parseInt(inp.value, 10);
          if (!(n >= 1 && n <= 99)) { inp.focus(); return; }
          ui.addingFor = null; toast(addForm('cms', s, n)); render();
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { ui.addingFor = null; render(); } });
        chips.push(h('div', { class: 'add-form' }, inp, h('button', { onclick: add }, 'Add')));
        if (ui.focusAdd) { ui.focusAdd = false; setTimeout(() => inp.focus(), 0); }
      } else if (ui.st !== 'done' && !ui.editForms) {
        chips.push(h('button', { class: 'add-chip', onclick: () => { ui.addingFor = s.key; ui.focusAdd = true; render(); } }, '+ Add form'));
      }
      return h('div', { class: 'subject', id: 'cms-' + s.key },
        h('div', { class: 'subj-head' }, h('h3', { text: s.name }),
          h('span', { class: 'stat' }, done + '/' + visibleAll.length + ' done', a != null ? h('span', { class: band('cms', a), text: ' · avg ' + fmtPct(a) }) : null),
          nRemoved && !ui.editForms ? h('button', { class: 'linkish', onclick: () => { ui.editForms = true; render(); } }, nRemoved + ' removed · restore') : null),
        chips.length ? h('div', { class: 'chips' }, chips) : h('p', { class: 'sub', text: 'Nothing here for this filter.' }));
    }));
  }
  document.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { ui.st = b.dataset.st; render(); }));
  $('edit-forms').addEventListener('click', () => { ui.editForms = !ui.editForms; ui.addingFor = null; render(); });
  $('show-old').addEventListener('change', (e) => { state.prefs.showOld = e.target.checked; save(); render(); });

  // ---------- systems tab ----------
  // Status, confidence and resource ticks count as working on a system that day (shown on the calendar).
  function setSys(id, patch) {
    state.systems[id] = Object.assign({}, sysItem(id), patch, { day: today() });
    save(); render();
  }
  function tagBtn(id, t, after) {
    const on = sysItem(id).tags.includes(t);
    return h('button', { class: 'tag' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', title: on ? t + ' done' : 'Mark ' + t + ' done',
      onclick: () => {
        const cur = sysItem(id).tags;
        setSys(id, { tags: on ? cur.filter((x) => x !== t) : cur.concat(t) });
        if (after) after();
      } }, (on ? '✓ ' : '') + t);
  }
  function sortedSystems() {
    const list = allSystems().slice(), m = state.prefs.sysSort;
    const uw = (s) => { const v = num(sysItem(s.id).uw); return v == null ? 999 : v; };
    if (m === 'conf') list.sort((a, b) => (sysItem(a.id).conf || 6) - (sysItem(b.id).conf || 6));
    if (m === 'status') list.sort((a, b) => sysItem(a.id).status - sysItem(b.id).status);
    if (m === 'uw') list.sort((a, b) => uw(a) - uw(b));
    if (m === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  function renderSystems() {
    $('sys-sort').value = state.prefs.sysSort;
    const inp = h('input', { type: 'text', placeholder: 'Add a system or topic (e.g. Vascular surgery)', id: 'add-sys', maxlength: '60', 'aria-label': 'New system name' });
    const add = () => {
      const name = inp.value.trim(); if (!name) return;
      state.extraSystems.push({ id: 'sys-x' + uid(), name });
      save(); render();
      setTimeout(() => $('add-sys')?.focus(), 0);
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    const weakIn = new Map(weakPattern().rows.map((r) => [r.sy.id, r.fs]));
    $('sys-rows').replaceChildren(...sortedSystems().map((sy) => {
      const it = sysItem(sy.id), uw = num(it.uw);
      return h('div', { class: 'sys' },
        h('div', { class: 'sys-main' },
          h('button', { class: 'nm', 'data-open': sy.id, onclick: () => openSystem(sy) }, sy.name, it.notes ? h('small', { text: it.notes }) : null),
          h('div', { class: 'tags' }, TAGS.filter((t) => t === 'Sketchy' || it.tags.includes(t)).map((t) => tagBtn(sy.id, t)),
            uw != null ? h('span', { class: 'tag uw ' + band('cms', uw), title: 'UWorld % correct', text: 'UW ' + fmtPct(uw) }) : null,
            weakIn.get(sy.id) ? h('span', { class: 'tag weak-tag' + (weakIn.get(sy.id).length >= 2 ? ' rec' : ''), title: 'Marked weak on ' + weakIn.get(sy.id).map((f) => f.full).join(', '),
              text: 'Weak in ' + plural(weakIn.get(sy.id).length, 'form') }) : null)),
        h('span', { class: 'conf', role: 'group', 'aria-label': 'Confidence for ' + sy.name },
          [1, 2, 3, 4, 5].map((n) => h('button', { class: it.conf >= n ? 'on' : '', 'aria-label': 'Confidence ' + n, 'aria-pressed': it.conf === n ? 'true' : 'false', title: 'Confidence ' + n + '/5', onclick: () => setSys(sy.id, { conf: it.conf === n ? 0 : n }) }))),
        h('span', { class: 'seg', role: 'group', 'aria-label': 'Status for ' + sy.name },
          SYS_ST.map((l, i) => h('button', { class: 'v' + i, 'aria-pressed': it.status === i ? 'true' : 'false', onclick: () => setSys(sy.id, { status: i }) }, l))));
    }), h('div', { class: 'add-sys' }, inp, h('button', { class: 'btn', onclick: add }, 'Add')));
  }
  $('sys-sort').addEventListener('change', (e) => { state.prefs.sysSort = e.target.value; save(); render(); });

  // ---------- AMBOSS articles tab ----------
  function setReads(id, n) {
    const cur = artItem(id);
    state.articles[id] = Object.assign({}, cur, { reads: n, date: n > cur.reads ? today() : n ? cur.date : '' });
    save(); render(); refreshSheet();
  }
  const extIcon = () => { const a = h('span', { 'aria-hidden': 'true' }); a.innerHTML = svgIcon('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'); return a; };
  function passBoxes(ar, label) {
    const it = artItem(ar.id);
    return h('span', { class: 'passes', role: 'group', 'aria-label': label || 'Read-throughs of ' + ar.name },
      Array.from({ length: PASSES }, (_, i) => h('button', { class: 'pass' + (it.reads > i ? ' on' : ''), 'aria-pressed': it.reads > i ? 'true' : 'false',
        'aria-label': 'Read ' + (i + 1) + ' of ' + PASSES, title: it.reads > i ? 'Read ' + (i + 1) + ' — tap to untick' : 'Mark read-through ' + (i + 1),
        onclick: () => setReads(ar.id, it.reads === i + 1 ? i : i + 1) })));
  }
  // Inline form for a new article; the AMBOSS link is optional (without one the title opens an AMBOSS search).
  function addArticleRow(sec) {
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
  function orderedSections() {
    const secs = artSections(), order = state.prefs.artOrder;
    const pos = (id, i) => { const k = order.indexOf(id); return k < 0 ? 1e4 + i : k; };
    return secs.map((sec, i) => [pos(sec.id, i), sec]).sort((x, y) => x[0] - y[0]).map(([, sec]) => sec);
  }
  function moveSection(id, to) {
    const ids = orderedSections().map((x) => x.id), i = ids.indexOf(id);
    const j = to === 'top' ? 0 : to === 'end' ? ids.length - 1 : Math.max(0, Math.min(ids.length - 1, i + to));
    if (i === j) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    state.prefs.artOrder = ids;
    save(); render();
  }
  const SORTS = {
    least: (a, b) => artItem(a.id).reads - artItem(b.id).reads,
    most: (a, b) => artItem(b.id).reads - artItem(a.id).reads,
    recent: (a, b) => (artItem(b.id).date || '').localeCompare(artItem(a.id).date || ''),
    az: (a, b) => a.name.localeCompare(b.name),
  };
  const sortArts = (list) => (SORTS[state.prefs.artSort] ? list.slice().sort(SORTS[state.prefs.artSort]) : list);
  function toggleCollapsed(id, open) {
    const set = new Set(state.prefs.artCollapsed);
    if (open == null ? set.has(id) : open) set.delete(id); else set.add(id);
    state.prefs.artCollapsed = [...set];
    save(); render();
  }

  // Progress at a glance: totals, how many articles sit at each read-through count, and every section's bar.
  function renderArtSummary(box, compact) {
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
      const n = sec.articles.length, r = sec.articles.filter((a) => artItem(a.id).reads > 0).length;
      return h('button', { class: 'sbar', onclick: () => jump(sec), 'aria-label': sec.name + ': ' + r + ' of ' + n + ' read' },
        h('span', { class: 'lbl', text: sec.name.replace(/^High-Yield /, ''), title: sec.name }),
        h('span', { class: 'segbar', 'aria-hidden': 'true' }, h('span', { style: 'width:' + (n ? r / n * 100 : 0) + '%;background:var(--s2)' })),
        h('span', { class: 'val', text: r + '/' + n }));
    }));
    if (compact) {
      box.replaceChildren(h('p', { class: 'art-mini-h' }, h('b', { text: read + '/' + arts.length }), ' read · ' + plural(passes, 'read-through') + (finished ? ' · ' + finished + ' done 5×' : '')), bars,
        h('button', { class: 'btn', style: 'margin-top:12px', onclick: () => showTab('articles', true) }, 'Open articles'));
      return;
    }
    const tones = ['var(--s0)', 'var(--s1)', 'color-mix(in srgb,var(--s1) 45%,var(--s2))', 'var(--s2)', 'color-mix(in srgb,var(--s2) 50%,var(--s3))', 'var(--s3)'];
    box.replaceChildren(h('div', { class: 'card art-sum' },
      h('div', { class: 'art-stats' },
        h('div', null, h('div', { class: 'eyebrow', text: 'Read' }), h('div', { class: 'big' }, String(read), h('small', { text: 'of ' + arts.length })),
          h('div', { class: 'meter' }, h('b', { style: 'width:' + (arts.length ? read / arts.length * 100 : 0) + '%' }))),
        h('div', null, h('div', { class: 'eyebrow', text: 'Read-throughs' }), h('div', { class: 'big' }, String(passes), h('small', { text: 'of ' + arts.length * PASSES })),
          h('div', { class: 'meter' }, h('b', { style: 'width:' + (arts.length ? passes / (arts.length * PASSES) * 100 : 0) + '%' }))),
        h('div', null, h('div', { class: 'eyebrow', text: 'Done 5×' }), h('div', { class: 'big' }, String(finished), h('small', { text: 'articles' })),
          h('div', { class: 'dist', role: 'img', 'aria-label': dist.map((c, i) => c + ' at ' + i).join(', ') + ' read-throughs' },
            dist.map((c, i) => (c ? h('span', { style: 'flex:' + c + ';background:' + tones[i], title: c + ' article' + (c === 1 ? '' : 's') + ' read ' + i + '×' }) : null))),
          h('div', { class: 'dist-l', 'aria-hidden': 'true' }, dist.map((c, i) => h('span', null, h('i', { style: 'background:' + tones[i] }), i + '×'))))),
      bars));
  }

  function artCard(ar) {
    const it = artItem(ar.id);
    const link = h('a', { class: 'xs ext', href: artUrl(ar), target: '_blank', rel: 'noopener noreferrer', title: ar.url ? 'Open in AMBOSS' : 'Search AMBOSS for this article', 'aria-label': 'Open ' + ar.name + ' in AMBOSS' });
    link.append(extIcon());
    return h('div', { class: 'acard r' + it.reads + (it.reads >= PASSES ? ' done' : '') },
      h('button', { class: 'ac-nm', 'data-open': ar.id, onclick: () => openArticle(ar), title: ar.name }, ar.name),
      h('div', { class: 'ac-meta' }, ar.builtIn ? null : h('span', { class: 'old', text: 'added' }), it.date ? h('span', { text: fmtDate(it.date) }) : null, it.notes ? h('span', { class: 'ac-note', text: '✎', title: it.notes }) : null),
      h('div', { class: 'ac-foot' }, passBoxes(ar), link));
  }
  function artRow(ar) {
    const it = artItem(ar.id);
    const link = h('a', { class: 'xs ext', href: artUrl(ar), target: '_blank', rel: 'noopener noreferrer', title: ar.url ? 'Open in AMBOSS' : 'Search AMBOSS for this article', 'aria-label': 'Open ' + ar.name + ' in AMBOSS' });
    link.append(extIcon());
    return h('div', { class: 'art' + (it.reads >= PASSES ? ' done' : '') },
      h('button', { class: 'nm', 'data-open': ar.id, onclick: () => openArticle(ar) },
        h('span', null, ar.name, ar.builtIn ? null : h('span', { class: 'old', text: 'added' })),
        it.notes || it.date ? h('small', { text: [it.date ? 'last read ' + fmtDate(it.date) : '', it.notes].filter(Boolean).join(' · ') }) : null),
      passBoxes(ar), link);
  }

  function renderArticles() {
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
  function newSectionRow() {
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

  function openArticle(ar) {
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

  // ---------- qbank tab ----------
  function renderQbank() {
    const qb = qbStats();
    $('qb-banks').replaceChildren(...qb.banks.map((b) => {
      const big = b.done != null && (b.baseQ || b.loggedQ) ? fmtN(b.done) : b.pctDone != null ? fmtPct(b.pctDone) : '—';
      const note = [b.pctDone != null && b.done != null && b.bank ? fmtPct(b.pctDone) + ' done' : '', b.acc != null ? fmtPct(b.acc) + ' correct' : '',
        b.left != null && b.started ? fmtN(b.left) + ' left' : '', b.loggedQ ? fmtN(b.loggedQ) + ' logged here' : '',
        b.baseQ == null ? 'add the bank size to count questions' : ''].filter(Boolean).join(' · ');
      return h('button', { class: 'tile qbc', 'data-open': 'qb-' + b.qb.id, onclick: () => openQbank(b.qb), 'aria-label': b.qb.name + ': edit progress' },
        h('span', { class: 'eyebrow qbc-h' }, b.qb.name, h('span', { class: 'qbc-edit', text: 'Edit' })),
        h('span', { class: 'big' }, big, b.bank && b.done != null && (b.baseQ || b.loggedQ) ? h('small', { text: '/ ' + fmtN(b.bank) }) : null),
        h('span', { class: 'meter' }, h('b', { style: 'width:' + Math.round(b.pctDone || 0) + '%' })),
        h('span', { class: 'note', text: note || 'Tap to enter your progress so far' }));
    }), h('button', { class: 'add-chip qbc-add', 'data-open': 'qb-new', onclick: () => openQbank(null) }, '+ Add a qbank'));
    // keep the session form's qbank list in step with your qbanks
    const sel = $('lg-src'), keep = sel.value, opts = state.qbanks.map((q) => q.name).concat('Other');
    if ([...sel.options].map((o) => o.value).join('|') !== opts.join('|')) {
      sel.replaceChildren(...opts.map((n) => h('option', { value: n, text: n })));
      sel.value = opts.includes(keep) ? keep : opts[0];
    }
    $('qb-tiles').replaceChildren(
      tile('Accuracy', qb.acc != null ? fmtPct(qb.acc) : '—', '', qb.acc != null ? qb.acc / 100 : null, 'All qbanks, weighted by questions'),
      tile('Last 7 days', fmtK(qb.week), 'questions', null, qb.week ? '~' + Math.round(qb.week / 7) + ' a day' : 'Nothing logged this week'),
      tile('Streak', String(qb.streak), qb.streak === 1 ? 'day' : 'days', null, 'Longest ' + plural(qb.best, 'day') + ' · ' + plural(qb.sessions, 'session')),
    );
    renderWeeks($('qb-weeks'));
    const list = state.log.slice().sort((a, b) => b.date.localeCompare(a.date));
    const shown = ui.logAll ? list : list.slice(0, 25);
    const rows = shown.map((e) => h('div', { class: 'lrow' },
      h('span', { class: 'd', text: fmtDate(e.date) }),
      h('span', null, h('span', { class: 'tag', text: e.src })),
      h('span', { class: 'q', text: e.q + ' q' }),
      h('span', { class: 'p ' + (num(e.pct) != null ? band('cms', num(e.pct)) : 'muted'), text: num(e.pct) != null ? fmtPct(num(e.pct)) : '—' }),
      h('span', { class: 'nt', text: e.note, title: e.note || null }),
      h('button', { class: 'xs', 'aria-label': 'Delete session on ' + fmtDate(e.date), title: 'Delete', onclick: () => {
        const undo = snapshot();
        state.log = state.log.filter((x) => x.id !== e.id); save(); render();
        toast('Session deleted', undo);
      } }, '×')));
    if (list.length > shown.length) rows.push(h('button', { class: 'add-link', onclick: () => { ui.logAll = true; render(); } }, 'Show all ' + list.length + ' sessions'));
    $('qb-list').replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty-row', text: 'No sessions yet. Log your first block above.' })]));
  }
  function renderWeeks(box) {
    const n = 12, t = dayNum(today()), start = t - weekday(t) - (n - 1) * 7;
    const wk = Array.from({ length: n }, () => ({ q: 0, cq: 0, c: 0 }));
    state.log.forEach((e) => {
      const d = dayNum(e.date); if (d < start || d > t) return;
      const w = wk[Math.floor((d - start) / 7)], p = num(e.pct);
      w.q += e.q; if (p != null) { w.cq += e.q; w.c += e.q * p; }
    });
    const max = Math.max(1, ...wk.map((w) => w.q));
    box.replaceChildren(h('div', { class: 'wbars', role: 'img', 'aria-label': 'Questions per week: ' + wk.map((w) => w.q).join(', ') },
      wk.map((w, i) => {
        const ws = fromDay(start + i * 7);
        return h('div', { class: 'wb' + (i === n - 1 ? ' cur' : ''), title: 'Week of ' + fmtDate(ws) + ' · ' + w.q + ' questions' + (w.cq ? ' · ' + fmtPct(w.c / w.cq) + ' correct' : '') },
          h('span', { class: 'wv', text: w.q ? fmtK(w.q) : '' }),
          h('span', { class: 'wc' }, h('i', { style: 'height:' + (w.q / max * 100) + '%' })),
          h('span', { class: 'wl', text: (n - 1 - i) % 3 === 0 ? new Date(ws + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '' }));
      })));
  }
  (function setupLogForm() {
    const f = $('log-form'), date = $('lg-date'), q = $('lg-q'), pct = $('lg-pct'), src = $('lg-src'), note = $('lg-note'), err = $('lg-err');
    date.value = today();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const qn = Number(q.value), pn = pct.value === '' ? null : Number(pct.value);
      const problem = !isDate(date.value) ? 'Pick a date.' : !(Number.isInteger(qn) && qn >= 1 && qn <= 1000) ? 'Enter how many questions (1–1000).'
        : pn != null && !(pn >= 0 && pn <= 100) ? '% correct must be between 0 and 100.' : pct.validity.badInput ? '% correct must be a number.' : '';
      err.textContent = problem;
      if (problem) return;
      const undo = snapshot();
      state.log.push({ id: uid(), date: date.value, q: qn, pct: pn == null ? '' : String(pn), src: src.value, note: note.value.trim().slice(0, 200) });
      save(); render();
      q.value = ''; pct.value = ''; note.value = ''; q.focus();
      toast('Logged ' + qn + ' ' + src.value + ' questions', undo);
    });
  })();

  // Edit a qbank's size and the progress you'd made before logging sessions here (null = add a new one).
  function openQbank(qb) {
    const isNew = !qb, builtIn = qb && QBANKS.some((d) => d.id === qb.id);
    const draft = qb ? null : { id: 'qb-x' + uid(), name: '', bank: '', done: '', unit: 'q', acc: '', t: 0 };
    const cur = () => (isNew ? draft : state.qbanks.find((x) => x.id === qb.id) || draft);
    const patch = (p) => {
      if (isNew) { Object.assign(draft, p); return; }
      state.qbanks = state.qbanks.map((x) => (x.id === qb.id ? Object.assign({}, x, p) : x));
      save(); render(); drawSummary();
    };
    const nameIn = h('input', { type: 'text', id: 'qb-name', maxlength: '40', placeholder: 'e.g. Kaplan', value: cur().name });
    const nameErr = h('span', { class: 'err', text: 'Give it a name that isn’t already used' });
    const nameField = h('div', { class: 'field' }, h('label', { for: 'qb-name', text: 'Qbank name' }), nameIn, nameErr);
    nameIn.addEventListener('input', () => {
      const v = nameIn.value.trim(), clash = state.qbanks.some((x) => x.id !== cur().id && x.name.toLowerCase() === v.toLowerCase()) || /^other$/i.test(v);
      nameField.classList.toggle('bad', !v || clash);
      if (v && !clash && !isNew) {
        // sessions refer to a qbank by name, so rename them too
        const old = cur().name;
        state.log = state.log.map((e) => (e.src === old ? Object.assign({}, e, { src: v }) : e));
        patch({ name: v });
      } else if (isNew) patch({ name: v });
    });
    const bank = numField('qb-bank', 'Questions in the bank', { inputmode: 'numeric', step: '1', placeholder: 'e.g. 3509', value: cur().bank }, 1, 50000, true, (raw) => patch({ bank: raw }));
    const unitSel = h('select', { id: 'qb-unit', 'aria-label': 'Done so far is counted in' },
      h('option', { value: 'q', text: 'questions' }), h('option', { value: 'pct', text: '% of the bank' }));
    unitSel.value = cur().unit;
    const done = numField('qb-done', 'Done so far', { inputmode: 'decimal', step: 'any', placeholder: cur().unit === 'pct' ? 'e.g. 94' : 'e.g. 930', value: cur().done },
      0, 50000, false, (raw) => patch({ done: raw }));
    done.field.append(unitSel);
    unitSel.addEventListener('change', () => { patch({ unit: unitSel.value }); done.inp.placeholder = unitSel.value === 'pct' ? 'e.g. 94' : 'e.g. 930'; });
    const acc = numField('qb-acc', '% correct so far', { inputmode: 'decimal', step: 'any', placeholder: 'e.g. 65', value: cur().acc }, 0, 100, false, (raw) => patch({ acc: raw }));
    const summary = h('p', { class: 'hint' });
    const drawSummary = () => {
      const b = bankStats(cur());
      summary.textContent = b.started
        ? [b.done != null ? fmtN(b.done) + (b.bank ? ' of ' + fmtN(b.bank) : '') + ' done' : fmtPct(b.pctDone) + ' done', b.pctDone != null && b.bank ? fmtPct(b.pctDone) : '',
          b.acc != null ? fmtPct(b.acc) + ' correct' : '', b.loggedQ ? 'includes ' + fmtN(b.loggedQ) + ' logged in sessions' : ''].filter(Boolean).join(' · ')
        : 'Nothing entered yet.';
    };
    drawSummary();
    const actions = [
      isNew ? h('button', { class: 'btn primary', onclick: () => {
        const v = draft.name.trim();
        if (!v || state.qbanks.some((x) => x.name.toLowerCase() === v.toLowerCase()) || /^other$/i.test(v)) { nameField.classList.add('bad'); nameIn.focus(); return; }
        state.qbanks.push(Object.assign({}, draft, { name: v }));
        save(); closeSheet(); toast(v + ' added');
      } }, 'Add qbank') : h('button', { class: 'btn primary', onclick: closeSheet }, 'Done'),
      !isNew && !builtIn ? h('button', { class: 'btn ghost danger', onclick: () => {
        const undo = snapshot();
        state.qbanks = state.qbanks.filter((x) => x.id !== qb.id);
        save(); closeSheet(); toast(qb.name + ' removed (its sessions are kept)', undo);
      } }, 'Remove qbank') : null,
    ];
    openSheet(isNew ? 'qb-new' : 'qb-' + qb.id, isNew ? 'Add a qbank' : qb.name, [
      sheetHead('Qbank', isNew ? 'Add a qbank' : qb.name),
      builtIn ? null : nameField,
      h('div', { class: 'two' }, bank.field, acc.field),
      h('div', { class: 'two' }, done.field, h('div')),
      h('p', { class: 'hint', text: 'Enter where you are now — from the qbank’s own stats page. Sessions you log on this tab are added on top. “% of the bank” needs the bank size to count questions.' }),
      summary,
      h('div', { class: 'actions' }, actions),
    ], () => {
      const a = document.activeElement;
      if (a !== bank.inp) bank.inp.value = cur().bank;
      if (a !== done.inp) done.inp.value = cur().done;
      if (a !== acc.inp) acc.inp.value = cur().acc;
      unitSel.value = cur().unit;
      drawSummary();
    }, builtIn ? '#qb-bank' : '#qb-name');
  }

  // ---------- sheets (editor panels) ----------
  const root = $('sheet-root');
  let sheetOpen = null;
  function openSheet(key, label, kids, refresh, focus) {
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, kids);
    root.replaceChildren(h('div', { class: 'scrim', onclick: closeSheet }), sheet);
    ['hdr', 'main'].forEach((id) => $(id).setAttribute('inert', ''));
    sheetOpen = { key, refresh };
    setTimeout(() => (sheet.querySelector(focus || '.x') || sheet).focus(), 0);
  }
  function closeSheet() {
    if (!sheetOpen) return;
    const key = sheetOpen.key;
    sheetOpen = null;
    root.replaceChildren();
    ['hdr', 'main'].forEach((id) => $(id).removeAttribute('inert'));
    render();
    // return focus to whatever opened the panel
    const back = [...document.querySelectorAll('[data-open="' + CSS.escape(key) + '"]')].find((el) => el.getClientRects().length);
    if (back) back.focus();
  }
  const refreshSheet = () => { if (sheetOpen && sheetOpen.refresh) sheetOpen.refresh(); if (settingsRefresh) settingsRefresh(); };
  const sheetHead = (eyebrow, title) => h('div', { class: 'sheet-head' },
    h('div', null, h('div', { class: 'eyebrow', text: eyebrow }), h('h2', { text: title })),
    h('button', { class: 'x', 'aria-label': 'Close', onclick: closeSheet }, '×'));

  // Number input that only reports valid values; shows an inline error otherwise.
  function numField(id, label, attrs, lo, hi, intOnly, onValid) {
    const inp = h('input', Object.assign({ type: 'number', id, min: String(lo), max: String(hi) }, attrs));
    const err = h('span', { class: 'err', id: id + '-err', text: 'Enter ' + (intOnly ? 'a whole number ' : 'a number ') + lo + '–' + hi });
    const field = h('div', { class: 'field' }, h('label', { for: id, text: label }), inp, err);
    inp.setAttribute('aria-describedby', id + '-err');
    inp.addEventListener('input', () => {
      const raw = inp.value.trim(), v = num(raw);
      const ok = !inp.validity.badInput && (raw === '' || (v != null && v >= lo && v <= hi && (!intOnly || Number.isInteger(v))));
      field.classList.toggle('bad', !ok);
      inp.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (ok) onValid(raw);
    });
    return { field, inp };
  }

  function openForm(f) {
    const isCms = f.kind === 'cms', scaled = !isCms && f.g.scaled, qs = isCms ? 50 : f.g.qs;
    const pctKey = isCms ? 'score' : 'pct';
    const cur = () => item(f.id);
    const patch = (p) => { state.items[f.id] = Object.assign({}, cur(), p); save(); render(); };
    const dateIn = h('input', { type: 'date', id: 'ed-date', value: cur().date });
    dateIn.addEventListener('change', () => patch({ date: isDate(dateIn.value) }));
    const markTaken = (p) => {
      if (!(cur().status > 0)) { p.status = 1; if (!cur().date) { p.date = today(); dateIn.value = p.date; } }
      return p;
    };
    const stepper = h('div', { class: 'stepper', role: 'group', 'aria-label': 'Status' });
    const drawStep = () => stepper.replaceChildren(...FORM_ST.map((l, i) =>
      h('button', { 'aria-pressed': cur().status === i ? 'true' : 'false', onclick: () => {
        const p = { status: i }; if (i > 0 && !cur().date) { p.date = today(); dateIn.value = p.date; }
        patch(p); drawStep();
      } }, h('i', { text: i === 0 ? '○' : '●'.repeat(i) }), l)));
    const conv = h('p', { class: 'hint' });
    const drawConv = () => {
      const p = num(cur()[pctKey]);
      conv.textContent = qs + ' questions' + (p != null && p >= 0 && p <= 100 ? ' · ' + fmtPct(p) + ' ≈ ' + Math.round(p / 100 * qs) + '/' + qs + ' correct'
        : scaled ? ' · enter the 3-digit score and % correct' : ' · enter % correct');
    };
    const score = scaled ? numField('ed-score', '3-digit score', { inputmode: 'numeric', step: '1', placeholder: 'e.g. 248', value: cur().score }, 1, 300, true,
      (raw) => { const p = { score: raw }; if (raw !== '') markTaken(p); patch(p); drawStep(); }) : null;
    const pct = numField('ed-pct', '% correct', { inputmode: 'decimal', step: 'any', placeholder: scaled ? 'e.g. 72' : 'e.g. 82', value: cur()[pctKey] }, 0, 100, false,
      (raw) => { const p = { [pctKey]: raw }; if (raw !== '') markTaken(p); patch(p); drawStep(); drawConv(); });
    const notesIn = h('textarea', { id: 'ed-notes', placeholder: 'Weak areas, recurring mistakes, topics to read…' });
    notesIn.value = cur().notes;
    notesIn.addEventListener('input', () => patch({ notes: notesIn.value }));
    drawStep(); drawConv();

    const dateField = h('div', { class: 'field' }, h('label', { for: 'ed-date', text: 'Date taken' }), dateIn);
    const weakBox = isCms ? null : h('div', { class: 'tags weak-pick', role: 'group', 'aria-label': 'Weak systems in this form' });
    const drawWeak = () => weakBox && weakBox.replaceChildren(...allSystems().map((sy) => {
      const on = cur().weak.includes(sy.id);
      return h('button', { class: 'tag' + (on ? ' on weak-on' : ''), 'aria-pressed': on ? 'true' : 'false', title: sy.name, onclick: () => {
        const w = cur().weak.filter((x) => x !== sy.id);
        patch({ weak: on ? w : w.concat(sy.id) });
        drawWeak();
      } }, (on ? '✓ ' : '') + shortSys(sy.name));
    }));
    drawWeak();
    const clearBtn = h('button', { class: 'btn ghost danger', onclick: () => {
      const undo = snapshot();
      delete state.items[f.id]; save(); closeSheet();
      toast(f.full + ' cleared', undo);
    } }, 'Clear entry');
    const rmBtn = h('button', { class: 'btn ghost danger', onclick: () => {
      const undo = snapshot();
      if (!f.removed) toggleRemove(f);
      closeSheet();
      toast(f.full + (isCms ? ' removed' : ' hidden'), undo);
    } }, isCms ? 'Remove form' : 'Hide form');
    openSheet(f.id, f.full, [
      sheetHead(isCms ? 'CMS · ' + f.subj.name : f.g.name, f.label + (f.old ? ' (older)' : '')),
      h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Status' }), stepper),
      scaled ? h('div', { class: 'two' }, score.field, pct.field) : h('div', { class: 'two' }, pct.field, dateField),
      scaled ? h('div', { class: 'two' }, dateField, h('div')) : null,
      conv,
      weakBox ? h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Weak systems in this form' }), weakBox,
        h('p', { class: 'hint', text: 'Tap the systems you missed most. Systems that keep coming up across forms show on the overview.' })) : null,
      h('div', { class: 'field' }, h('label', { for: 'ed-notes', text: 'Notes' }), notesIn),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'Done'), clearBtn, rmBtn),
    ], () => {
      const a = document.activeElement;
      if (score && a !== score.inp) score.inp.value = cur().score;
      if (a !== pct.inp) pct.inp.value = cur()[pctKey];
      if (a !== dateIn) dateIn.value = cur().date;
      if (a !== notesIn) notesIn.value = cur().notes;
      drawStep(); drawConv(); drawWeak();
    }, scaled ? '#ed-score' : '#ed-pct');
  }

  function openSystem(sy) {
    const cur = () => sysItem(sy.id);
    const patch = (p) => { state.systems[sy.id] = Object.assign({}, cur(), p); save(); render(); };
    const notesIn = h('textarea', { id: 'ed-sys-notes', placeholder: 'High-yield gaps, resources to revisit…' });
    notesIn.value = cur().notes;
    notesIn.addEventListener('input', () => patch({ notes: notesIn.value }));
    const uw = numField('ed-uw', 'UWorld % correct', { inputmode: 'decimal', step: 'any', placeholder: 'e.g. 68', value: cur().uw }, 0, 100, false, (raw) => patch({ uw: raw }));
    const tagBox = h('div', { class: 'tags', role: 'group', 'aria-label': 'Resources done' });
    const drawTags = () => tagBox.replaceChildren(...TAGS.map((t) => tagBtn(sy.id, t, drawTags)));
    drawTags();
    const isExtra = state.extraSystems.some((x) => x.id === sy.id);
    const rm = isExtra ? h('button', { class: 'btn ghost danger', onclick: () => {
      const undo = snapshot();
      state.extraSystems = state.extraSystems.filter((x) => x.id !== sy.id); delete state.systems[sy.id]; save(); closeSheet();
      toast(sy.name + ' removed', undo);
    } }, 'Remove system') : null;
    openSheet(sy.id, sy.name, [
      sheetHead('System · ' + SYS_ST[cur().status] + (cur().conf ? ' · confidence ' + cur().conf + '/5' : ''), sy.name),
      h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Resources done' }), tagBox),
      h('div', { class: 'two' }, uw.field, h('div')),
      h('div', { class: 'field' }, h('label', { for: 'ed-sys-notes', text: 'Notes' }), notesIn),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'Done'), rm),
    ], () => {
      if (document.activeElement !== notesIn) notesIn.value = cur().notes;
      if (document.activeElement !== uw.inp) uw.inp.value = cur().uw;
      drawTags();
    }, '#ed-sys-notes');
  }

  // ---------- Exam Simulator import ----------
  // Reads the Step Exam Simulator's progress backup (a .zip of <form>_progress_save.json files plus
  // progress_metadata.json, or those JSON files picked directly) and fills in the matching tracker forms.
  // It only adds: empty fields are filled, status is raised to at least "Taken", and nothing is
  // overwritten unless you ask. Custom question sets can become qbank sessions.
  const SIM_SUBJ = { IM: 'med', MED: 'med', SURG: 'surg', PEDS: 'peds', OBGYN: 'obgyn', PSYCH: 'psych', NEURO: 'neuro', FM: 'fm', EM: 'em' };

  // Minimal zip reader: central directory + stored/deflate entries (what the simulator writes).
  async function readZip(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let end = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('That file isn’t a zip archive.');
    const count = dv.getUint16(end + 10, true);
    const entries = [];
    for (let i = 0, q = dv.getUint32(end + 16, true); i < count; i++) {
      if (dv.getUint32(q, true) !== 0x02014b50) throw new Error('The zip archive looks damaged.');
      const nameLen = dv.getUint16(q + 28, true);
      entries.push({ name: new TextDecoder().decode(buf.subarray(q + 46, q + 46 + nameLen)), method: dv.getUint16(q + 10, true),
        size: dv.getUint32(q + 20, true), at: dv.getUint32(q + 42, true) });
      q += 46 + nameLen + dv.getUint16(q + 30, true) + dv.getUint16(q + 32, true);
    }
    const read = async (en) => {
      const start = en.at + 30 + dv.getUint16(en.at + 26, true) + dv.getUint16(en.at + 28, true);
      const data = buf.subarray(start, start + en.size);
      if (en.method === 0) return new TextDecoder().decode(data);
      if (en.method !== 8) throw new Error('Unsupported compression in ' + en.name + '.');
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t open zip files. Unzip the backup and pick the .json files inside instead.');
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    };
    return { entries, read };
  }

  async function readSimFiles(files) {
    const out = { docs: {}, scores: {}, suspended: new Set(), names: [] };
    const take = (name, text) => {
      let j = null;
      try { j = JSON.parse(text); } catch (e) { return; }
      const type = j && typeof j.fileType === 'string' ? j.fileType : '';
      if (type === 'StepExamSimulatorProgressMetadata') arr(j.forms).forEach((f) => { if (f && typeof f.formId === 'string') out.scores[f.formId] = num(f.threeDigitScore); });
      else if (/^StepExamSimulator.*ProgressBundle$/.test(type)) out.docs[str(j.formSlot, 60) || name] = j;
    };
    const suspendedId = (name) => (/([^/]+)_suspended_test\.json$/i.exec(name) || [])[1];
    for (const f of files) {
      out.names.push(f.name);
      if (/\.zip$/i.test(f.name) || /zip/.test(f.type)) {
        const z = await readZip(f);
        for (const en of z.entries) {
          if (!/\.json$/i.test(en.name) || /QBANK_MODE/i.test(en.name)) continue;
          const sid = suspendedId(en.name);
          if (sid) { out.suspended.add(sid); continue; }
          take(en.name, await z.read(en));
        }
      } else {
        const sid = suspendedId(f.name);
        if (sid) out.suspended.add(sid); else take(f.name, await f.text());
      }
    }
    return out;
  }

  // First finished attempt (first-pass performance); falls back to the current session.
  function simResult(doc) {
    const atts = arr(obj(doc.bundle).attempts).filter((a) => a && a.session);
    const att = atts.find((a) => a.type === 'initial' && a.completedAt) || atts.find((a) => a.completedAt);
    const ses = obj(att ? att.session : doc.session);
    const res = arr(ses.results).filter((r) => r && Number(r.total) > 0);
    const total = sum(res.map((r) => Number(r.total))), correct = sum(res.map((r) => Number(r.correct) || 0));
    const blocks = arr(ses.blocks).length;
    const done = total > 0 && (!!ses.completedAt || (blocks > 0 && res.length >= blocks));
    const when = ses.completedAt || (res.length ? res[res.length - 1].completedAt : '') || ses.startedAt || '';
    const d = new Date(when);
    return { total, correct, done, partial: !done && res.length > 0, attempt: str(ses.attemptId || (att && att.attemptId), 60),
      date: isNaN(d) ? '' : new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10),
      title: str(ses.libraryFormName || ses.title || doc.formSlot, 80).replace(/\s+—\s+All Questions$/, ''), retakes: atts.filter((a) => a.type && a.type !== 'initial').length };
  }
  function simTarget(id, title) {
    let m;
    if ((m = /^N-?0*(\d{1,2})$/i.exec(id))) return { kind: 'test', g: GROUPS[0], n: +m[1] };
    if ((m = /^UWSA-?0*(\d)$/i.exec(id))) return { kind: 'test', g: GROUPS[1], n: +m[1] };
    if ((m = /^C-([A-Za-z]+)-0*(\d{1,2})$/.exec(id)) && SIM_SUBJ[m[1].toUpperCase()]) return { kind: 'cms', s: SUBJ.find((x) => x.key === SIM_SUBJ[m[1].toUpperCase()]), n: +m[2] };
    if (/free\s*-?\s*120|^f-?120/i.test(id + ' ' + title) && (m = /(20[1-4]\d)/.exec(id + ' ' + title))) return { kind: 'test', g: GROUPS[2], n: +m[1] };
    return null;
  }
  function simPlan(src) {
    const rows = [];
    for (const id of new Set([...Object.keys(src.docs), ...src.suspended])) {
      const r = src.docs[id] ? simResult(src.docs[id]) : null;
      const row = { id, r, title: r ? r.title : id, score3: src.scores[id] != null && src.scores[id] >= 1 && src.scores[id] <= 300 ? Math.round(src.scores[id]) : null };
      const tgt = simTarget(id, row.title);
      if (!r || !r.done) Object.assign(row, { kind: 'skip', why: r && r.partial ? 'In progress' : 'Not finished', order: 3 });
      else if (tgt) {
        const fid = tgt.kind === 'cms' ? 'cms-' + tgt.s.key + '-' + tgt.n : tgt.g.key + '-' + tgt.n;
        const name = tgt.kind === 'cms' ? tgt.s.name + ' Form ' + tgt.n : tgt.g.full(tgt.n);
        Object.assign(row, { kind: 'form', tgt, fid, name, order: tgt.kind === 'cms' ? 1 + SUBJ.indexOf(tgt.s) / 100 : GROUPS.indexOf(tgt.g) / 100 });
      } else Object.assign(row, { kind: 'qbank', logId: ('sim-' + slug(id).slice(0, 24) + '-' + slug(r.attempt).slice(-12)).replace(/-+$/, ''), order: 2 });
      rows.push(row);
    }
    return rows.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, undefined, { numeric: true }));
  }
  // What importing one form row would change, given the current tracker state.
  function simChange(row, overwrite) {
    const { tgt, fid, r } = row, isCms = tgt.kind === 'cms', grp = isCms ? tgt.s : tgt.g;
    const cur = item(fid), pctKey = isCms ? 'score' : 'pct';
    const patch = {}, conflicts = [];
    const want = (k, v, label, fmt) => {
      if (v == null || v === '') return;
      if (cur[k] === '') patch[k] = v;
      else if (k === 'date' ? cur[k] !== v : num(cur[k]) !== num(v)) { conflicts.push(label + ': yours ' + fmt(cur[k]) + ', simulator ' + fmt(v)); if (overwrite) patch[k] = v; }
    };
    if (cur.status < 1) patch.status = 1;
    want(pctKey, String(Math.round(r.correct / r.total * 1000) / 10), '% correct', (v) => fmtPct(num(v)));
    if (!isCms && grp.scaled) want('score', row.score3 != null ? String(row.score3) : '', 'score', String);
    want('date', r.date, 'date', fmtDate);
    if (!cur.notes) patch.notes = 'Exam Simulator: ' + r.correct + '/' + r.total + ' correct' + (r.retakes ? ' (first attempt; ' + plural(r.retakes, 'retake') + ' not counted)' : '');
    const listed = isCms ? tgt.n <= grp.latest || (state.extraForms[grp.key] || []).includes(tgt.n) : grp.base.includes(tgt.n) || (state.extraAssess[grp.key] || []).includes(tgt.n);
    const hidden = state.removed.includes(fid);
    const fresh = !cur.status && !cur.score && !cur.pct && !cur.date;
    const changed = Object.keys(patch).some((k) => k !== 'notes') || (!!patch.notes && Object.keys(patch).length > 1) || !listed || hidden;
    return { patch, conflicts, listed, hidden, changed, fresh };
  }
  function simLogEntry(row) {
    return { id: row.logId, date: row.r.date || today(), q: Math.min(5000, row.r.total), pct: String(Math.round(row.r.correct / row.r.total * 1000) / 10), src: 'Other', note: ('Exam Simulator · ' + row.title).slice(0, 200), t: 0 };
  }
  function applySim(rows, opts) {
    let nForms = 0, nLog = 0;
    for (const row of rows) {
      if (row.kind === 'form') {
        const c = simChange(row, opts.overwrite);
        if (!c.changed) continue;
        const { tgt, fid } = row;
        if (!c.listed) {
          const list = tgt.kind === 'cms' ? state.extraForms : state.extraAssess, key = tgt.kind === 'cms' ? tgt.s.key : tgt.g.key;
          list[key] = [...new Set([...(list[key] || []), tgt.n])].sort((a, b) => a - b);
        }
        if (c.hidden) state.removed = state.removed.filter((x) => x !== fid);
        state.items[fid] = Object.assign({}, item(fid), c.patch);
        nForms++;
      } else if (row.kind === 'qbank' && opts.qbank && !state.log.some((e) => e.id === row.logId)) {
        state.log.push(simLogEntry(row));
        nLog++;
      }
    }
    return { nForms, nLog };
  }

  async function importSimulator(files) {
    if (!files || !files.length) return;
    let src;
    try { src = await readSimFiles([...files]); }
    catch (e) { toast(e.message || 'Couldn’t read that file.'); return; }
    const rows = simPlan(src);
    if (!rows.length) { toast('No Exam Simulator progress found in that file.'); return; }
    openSimSheet(rows, src.names.join(', '));
  }
  $('sim-import').addEventListener('change', () => { const inp = $('sim-import'), files = [...(inp.files || [])]; inp.value = ''; importSimulator(files); });
  $('sim-btn').addEventListener('click', () => $('sim-import').click());

  function openSimSheet(rows, fileName) {
    const opts = { overwrite: false, qbank: true };
    const forms = rows.filter((r) => r.kind === 'form'), sets = rows.filter((r) => r.kind === 'qbank'), skipped = rows.filter((r) => r.kind === 'skip');
    const list = h('div', { class: 'sim-list' });
    const go = h('button', { class: 'btn primary' });
    const resultText = (row) => [row.r.correct + '/' + row.r.total, fmtPct(row.r.correct / row.r.total * 100), row.score3, fmtDate(row.r.date)].filter(Boolean).join(' · ');
    const simRow = (name, sub, res, badge, cls, extra) => h('div', { class: 'sim-row' },
      h('div', { class: 'sim-nm' }, h('b', { text: name }), sub ? h('small', { text: sub }) : null, extra ? h('small', { class: 'sc-warn', text: extra }) : null),
      h('span', { class: 'sim-res', text: res }),
      h('span', { class: 'sim-badge ' + cls, text: badge }));
    const draw = () => {
      let count = 0;
      const formRows = forms.map((row) => {
        const c = simChange(row, opts.overwrite);
        if (c.changed) count++;
        const badge = !c.changed ? (c.conflicts.length ? 'Kept yours' : 'Up to date') : c.fresh ? (!c.listed ? 'New form' : 'New') : 'Update';
        const extra = c.conflicts.length ? c.conflicts.join(' · ') : !c.listed ? 'Adds ' + row.name + ' to your list' : c.hidden ? 'Unhides this form' : '';
        return simRow(row.name, row.title !== row.name ? row.title : '', resultText(row), badge, c.changed ? (c.fresh ? 'new' : 'upd') : c.conflicts.length ? 'warn' : 'same', extra);
      });
      const setRows = sets.map((row) => {
        const has = state.log.some((e) => e.id === row.logId);
        if (opts.qbank && !has) count++;
        return simRow(row.title, row.id, resultText(row), has ? 'Logged' : opts.qbank ? 'Qbank' : 'Skipped', has ? 'same' : opts.qbank ? 'new' : 'same');
      });
      const skipRows = skipped.map((row) => simRow(row.title, row.id, '', row.why, 'same'));
      list.replaceChildren(...[
        forms.length ? h('h3', { text: 'Assessments & CMS forms (' + forms.length + ')' }) : null, ...formRows,
        sets.length ? h('h3', { text: 'Custom question sets (' + sets.length + ')' }) : null, ...setRows,
        skipped.length ? h('h3', { text: 'Not imported (' + skipped.length + ')' }) : null, ...skipRows].filter(Boolean));
      go.disabled = !count;
      go.textContent = count ? 'Import ' + plural(count, 'change') : 'Nothing new to import';
    };
    const check = (label, key, hint) => {
      const inp = h('input', { type: 'checkbox' });
      inp.checked = opts[key];
      inp.addEventListener('change', () => { opts[key] = inp.checked; draw(); });
      return h('label', { class: 'switch sim-opt' }, inp, h('span', null, label, hint ? h('small', { class: 'muted', text: ' ' + hint }) : null));
    };
    go.addEventListener('click', () => {
      const undo = snapshot();
      const { nForms, nLog } = applySim(rows, opts);
      save(); closeSheet();
      toast('Imported ' + plural(nForms, 'form') + (nLog ? ' and ' + plural(nLog, 'qbank session') : '') + ' from the Exam Simulator', undo);
    });
    draw();
    openSheet('sim-import', 'Import from Exam Simulator', [
      sheetHead('Exam Simulator', 'Import progress'),
      h('p', { class: 'hint', text: 'From ' + fileName + '. Finished forms fill in your tracker; empty fields are filled and nothing you entered is replaced unless you choose to. Scores use your first attempt.' }),
      h('div', { class: 'sim-opts' },
        check('Replace my values where they differ', 'overwrite'),
        sets.length ? check('Log custom question sets as qbank sessions', 'qbank', '(“Other” qbank)') : null),
      list,
      h('div', { class: 'actions' }, go, h('button', { class: 'btn ghost', onclick: closeSheet }, 'Cancel')),
    ], draw);
  }

  // ---------- settings, backup ----------
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportJson() {
    state.prefs.lastBackup = new Date().toISOString();
    flush();
    download('ck-tracker-backup-' + today() + '.json', JSON.stringify(Object.assign({ app: 'ck-tracker', exported: state.prefs.lastBackup }, state), null, 2), 'application/json');
    render(); refreshSheet();
    toast('Backup downloaded');
  }
  function exportCsv() {
    const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['type', 'group', 'name', 'status', 'score_3digit', 'percent_correct', 'questions', 'date', 'notes', 'weak_systems']];
    GROUPS.forEach((g) => testForms(g, true).forEach((f) => {
      const it = item(f.id);
      rows.push(['assessment', g.short, f.label, FORM_ST[it.status], g.scaled ? it.score : '', it.pct, g.qs, it.date, it.notes, weakNames(it.weak)]);
    }));
    SUBJ.forEach((s) => cmsForms(s, true, true).forEach((f) => {
      const it = item(f.id);
      if (!f.removed || it.status) rows.push(['cms', s.name, f.label, FORM_ST[it.status], '', it.score, 50, it.date, it.notes]);
    }));
    allSystems().forEach((sy) => {
      const it = sysItem(sy.id);
      rows.push(['system', '', sy.name, SYS_ST[it.status] + (it.conf ? ' · confidence ' + it.conf + '/5' : ''), '', it.uw, '', '', [it.tags.join(' / '), it.notes].filter(Boolean).join(' · ')]);
    });
    state.qbanks.map(bankStats).forEach((b) => rows.push(['qbank-total', b.qb.name, b.bank ? 'bank of ' + b.bank : '', '', '', b.acc != null ? Math.round(b.acc * 10) / 10 : '',
      b.done != null ? b.done : '', '', b.pctDone != null ? Math.round(b.pctDone) + '% done' : '']));
    state.log.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => rows.push(['qbank', e.src, '', '', '', e.pct, e.q, e.date, e.note]));
    orderedSections().forEach((sec) => sec.articles.forEach((ar) => {
      const it = artItem(ar.id);
      rows.push(['article', sec.name, ar.name, it.reads + '/' + PASSES + ' read-throughs', '', '', '', it.date, it.notes]);
    }));
    download('ck-tracker-' + today() + '.csv', '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv');
    toast('CSV downloaded');
  }
  $('import').addEventListener('change', () => {
    const inp = $('import'), file = inp.files && inp.files[0];
    if (!file) return;
    if (/\.zip$/i.test(file.name) || /zip/.test(file.type)) { inp.value = ''; importSimulator([file]); return; }
    const r = new FileReader();
    r.onload = () => {
      inp.value = '';
      let data = null;
      try { data = JSON.parse(r.result); } catch (e) {}
      if (data && /^StepExamSimulator/.test(data.fileType || '')) { importSimulator([file]); return; }
      if (!data || typeof data !== 'object' || !('items' in data)) { toast('That file isn’t a tracker backup.'); return; }
      const undo = snapshot();
      const theme = state.prefs.theme;
      state = norm(data);
      state.prefs.theme = theme;
      stampAll(state, Date.now());
      applyTheme(); save(); render(); refreshSheet();
      toast(cloud() && cloud().status().connected ? 'Backup restored — it replaces the copy in your Google account too' : 'Backup restored', undo);
    };
    r.readAsText(file);
  });

  // ---------- settings page ----------
  // Built once each time you open it; live parts redraw through settingsRefresh so typing isn't interrupted.
  let settingsRefresh = null;
  function openSettings(focus) {
    if (ui.tab !== 'settings') ui.prevTab = ui.tab;
    ui.settingsFocus = focus || '';
    showTab('settings', true);
  }
  function buildSettings() {
    const p = () => state.prefs;
    const setPref = (k, v) => { state.prefs[k] = v; save(); render(); };
    const card = (id, title, sub, ...kids) => h('section', { class: 'card set-card', id, 'aria-labelledby': id + '-h' },
      h('h3', { id: id + '-h', text: title }), sub ? h('p', { class: 'sub', text: sub }) : null, ...kids);

    // plan
    const examIn = h('input', { type: 'date', id: 'st-exam', value: p().examDate });
    examIn.addEventListener('change', () => setPref('examDate', isDate(examIn.value)));
    const target = numField('st-target', 'Target score', { inputmode: 'numeric', step: '1', placeholder: 'e.g. 255', value: p().target }, 1, 300, true, (raw) => setPref('target', raw));
    const planNote = h('p', { class: 'hint' });
    const drawPlan = () => {
      const ex = p().examDate, dl = ex ? daysUntil(ex) : null;
      planNote.textContent = ex ? (dl > 0 ? plural(dl, 'day') + ' to go · ' : dl === 0 ? 'Test day is today · ' : 'Test date has passed · ') + 'drives the countdown, pace and score projection.'
        : 'Set it to get a countdown, a pace for your remaining assessments and qbanks, and a projected score.';
    };

    // Google
    const gBox = h('div', { class: 'set-body', id: 'st-google', tabindex: '-1' });
    const drawGoogle = () => {
      const c = cloud() && cloud().status();
      if (!c) { gBox.replaceChildren(h('p', { class: 'hint', text: 'Google sync couldn’t load. Reload the page to try again.' })); return; }
      const busy = c.state === 'syncing' || c.state === 'connecting';
      const detail = [c.account ? 'Account: ' + c.account : '', c.shared ? 'using your ThunderShadow sign-in' : '',
        c.lastSync ? 'last synced ' + new Date(c.lastSync).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '', c.pending ? 'changes waiting to sync' : ''].filter(Boolean).join(' · ');
      gBox.replaceChildren(...[
        h('p', { class: 'gstat g-' + c.state, text: c.message || (c.connected ? 'Signed in.' : 'Sign in with Google to keep your progress in your Google account and pick it up on any device.') }),
        c.connected && detail ? h('p', { class: 'hint', text: detail.charAt(0).toUpperCase() + detail.slice(1) }) : null,
        h('div', { class: 'btnrow' },
          c.connected
            ? h('button', { class: 'btn primary', disabled: busy, onclick: () => cloud().syncNow({ manual: true }).then(() => toast('Synced with Google')).catch((e) => toast(e.message)) }, busy ? 'Syncing…' : 'Sync now')
            : h('button', { class: 'btn primary', id: 'st-gconnect', disabled: busy || !c.canSignIn, onclick: signIn }, 'Sign in with Google'),
          c.connected ? h('button', { class: 'btn ghost', onclick: () => cloud().disconnect().then(() => toast('Signed out of Google sync')) }, 'Sign out') : null),
        h('details', { class: 'set-more' }, h('summary', { text: 'When does it sync?' }),
          h('ul', null,
            h('li', { text: 'About 10 seconds after you stop editing (at most a minute after your first change), and right away when you leave the app.' }),
            h('li', { text: 'When you open the app, and when you come back to it (at most every 5 minutes), it checks for changes from your other devices — a quick file check, with nothing downloaded unless something changed.' }),
            h('li', { text: 'The sign-in service (the Cloudflare Worker) is only contacted to sign in or out and about once an hour while you’re using the app, when Google’s access pass expires.' }),
            h('li', { text: 'If Google can’t be reached it waits longer between tries (30 seconds up to 15 minutes). Nothing is lost: everything stays saved on this device.' }))),
        h('p', { class: 'hint', text: 'Stored in a private app folder in your Google Drive (it doesn’t show up in your Drive files), kept apart from ThunderShadow’s data.' }),
        !c.connected && !c.canSignIn ? h('p', { class: 'hint', text: 'Google sign-in works on the published site: ' + c.returnUrl }) : null].filter(Boolean));
    };

    // appearance
    const theme = h('div', { class: 'seg mode', role: 'group', 'aria-label': 'Theme' });
    const drawTheme = () => theme.replaceChildren(...[['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) =>
      h('button', { 'aria-pressed': p().theme === k ? 'true' : 'false', onclick: () => { state.prefs.theme = k; applyTheme(); save(); drawTheme(); } }, l)));
    const artView = h('div', { class: 'seg mode', role: 'group', 'aria-label': 'Articles layout' });
    const drawArtView = () => artView.replaceChildren(...[['grid', 'Grid'], ['list', 'List']].map(([k, l]) =>
      h('button', { 'aria-pressed': p().artView === k ? 'true' : 'false', onclick: () => { state.prefs.artView = k; save(); drawArtView(); } }, l)));

    // qbanks
    const qbList = h('div', { class: 'set-list' });
    const drawQb = () => qbList.replaceChildren(...qbStats().banks.map((b) => h('div', { class: 'set-row' },
      h('div', null, h('b', { text: b.qb.name }), h('small', { text: [b.bank ? fmtN(b.bank) + ' questions' : 'bank size not set', b.pctDone != null ? fmtPct(b.pctDone) + ' done' : '', b.acc != null ? fmtPct(b.acc) + ' correct' : ''].filter(Boolean).join(' · ') })),
      h('button', { class: 'btn', 'data-open': 'qb-' + b.qb.id, onclick: () => openQbank(b.qb) }, 'Edit'))),
      h('div', { class: 'btnrow' }, h('button', { class: 'btn ghost', 'data-open': 'qb-new', onclick: () => openQbank(null) }, '+ Add a qbank')));

    // backup
    const backupNote = h('p', { class: 'hint' });
    const drawBackup = () => {
      const lb = p().lastBackup;
      backupNote.textContent = (lb ? 'Last backup ' + fmtDate(lb.slice(0, 10)) + '. ' : 'No backup file yet. ') + 'Backups are JSON files you can import on any device. CSV opens in Excel or Sheets.';
    };
    const persistNote = h('p', { class: 'hint' });
    const persistBtn = h('button', { class: 'btn', hidden: true, onclick: async () => {
      try { await navigator.storage.persist(); } catch (e) {}
      checkPersist();
    } }, 'Protect from clearing');
    const checkPersist = async () => {
      if (!navigator.storage || !navigator.storage.persisted) { persistNote.textContent = 'Your browser decides how long site data is kept — sign in with Google or export backups.'; return; }
      const ok = await navigator.storage.persisted().catch(() => false);
      persistNote.textContent = ok ? 'This browser has agreed to keep your data unless you clear it yourself.' : 'The browser may clear site data when space runs low. Ask it to keep your data, and sign in with Google or export backups.';
      persistBtn.hidden = ok;
    };
    checkPersist();

    // danger zone
    let armTimer = null;
    const resetBtn = h('button', { class: 'btn ghost danger', onclick: () => {
      if (!resetBtn.dataset.arm) {
        resetBtn.dataset.arm = '1'; resetBtn.textContent = 'Tap again to erase everything';
        armTimer = setTimeout(() => { delete resetBtn.dataset.arm; resetBtn.textContent = 'Erase all data'; }, 4000);
        return;
      }
      clearTimeout(armTimer);
      delete resetBtn.dataset.arm; resetBtn.textContent = 'Erase all data';
      const undo = snapshot();
      const theme = state.prefs.theme;
      state = blank(); state.prefs.theme = theme;
      stampAll(state, Date.now());
      save(); render(); refreshSheet();
      toast('All data erased', undo);
    } }, 'Erase all data');

    const keys = [['1 – 6', 'Switch tabs'], [',', 'Open settings'], ['t', 'Light / dark'], ['Esc', 'Close a panel, or leave settings'], ['← →', 'Move between tabs (when a tab is focused)']];
    const SECTIONS = [
      ['set-plan', 'Plan'], ['set-sync', 'Google sync'], ['set-look', 'Appearance'], ['set-qbanks', 'Qbanks'],
      ['set-data', 'Backup & import'], ['set-keys', 'Shortcuts'], ['set-danger', 'Erase data'],
    ];
    const nav = h('nav', { class: 'set-nav', 'aria-label': 'Settings sections' }, SECTIONS.map(([id, label]) =>
      h('a', { href: '#settings', 'data-sec': id, onclick: (e) => { e.preventDefault(); const el = $(id); el.scrollIntoView({ block: 'start', behavior: 'smooth' }); el.focus({ preventScroll: true }); } }, label)));

    $('settings-body').replaceChildren(nav, h('div', { class: 'set-main' },
      card('set-plan', 'Plan', 'Your test date and the score you’re aiming for.',
        h('div', { class: 'two' }, h('div', { class: 'field' }, h('label', { for: 'st-exam', text: 'Test date' }), examIn), target.field), planNote),
      card('set-sync', 'Google sync', null, gBox),
      card('set-look', 'Appearance', 'Saved on this device only.',
        h('div', { class: 'set-row' }, h('div', null, h('b', { text: 'Theme' }), h('small', { text: 'Or press t, or use the button in the header.' })), theme),
        h('div', { class: 'set-row' }, h('div', null, h('b', { text: 'AMBOSS articles layout' }), h('small', { text: 'Grid fits more articles on screen.' })), artView)),
      card('set-qbanks', 'Qbanks', 'Bank sizes and the progress you’d made before logging sessions here.', qbList),
      card('set-data', 'Backup & import', null, backupNote,
        h('div', { class: 'btnrow' },
          h('button', { class: 'btn primary', id: 'st-export', onclick: exportJson }, 'Export backup'),
          h('button', { class: 'btn', onclick: exportCsv }, 'Export CSV'),
          h('button', { class: 'btn', onclick: () => $('import').click() }, 'Import backup')),
        h('div', { class: 'btnrow' }, h('button', { class: 'btn', 'data-open': 'sim-import', onclick: () => $('sim-import').click() }, 'Import from Exam Simulator')),
        h('p', { class: 'hint', text: 'Exam Simulator import reads its progress backup (.zip) and fills in finished NBME, UWSA and CMS forms. You see what changes before anything is saved.' }),
        persistNote, h('div', { class: 'btnrow' }, persistBtn)),
      card('set-keys', 'Keyboard shortcuts', null, h('dl', { class: 'keys' }, keys.flatMap(([k, d]) => [h('dt', null, h('kbd', { text: k })), h('dd', { text: d })]))),
      card('set-danger', 'Erase data', 'Erases every score, note, session and article tick in this browser — and in your Google account if you’re signed in. You can undo right after.',
        h('div', { class: 'btnrow' }, resetBtn)),
      h('p', { class: 'hint set-about' }, 'Thunder tracker · your data stays in this browser and, if you sign in, your own Google Drive. ',
        h('a', { href: 'https://github.com/dawnsommer/thundertracker', target: '_blank', rel: 'noopener noreferrer', text: 'Source on GitHub' }))));
    // make the section cards focus targets for the nav
    SECTIONS.forEach(([id]) => $(id).setAttribute('tabindex', '-1'));

    settingsRefresh = () => {
      const a = document.activeElement;
      if (a !== examIn) examIn.value = p().examDate;
      if (a !== target.inp) target.inp.value = p().target;
      drawPlan(); drawGoogle(); drawTheme(); drawArtView(); drawQb(); drawBackup();
    };
    settingsRefresh();
    const f = ui.settingsFocus; ui.settingsFocus = '';
    setTimeout(() => {
      const el = f ? document.querySelector(f) : null;
      if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } else $('settings-h').focus();
    }, 0);
  }
  function signIn() {
    if (!cloud()) return;
    Promise.resolve(cloud().connect()).then(() => { if (cloud().status().connected) toast('Signed in with Google'); }).catch((e) => toast(e.message));
  }
  const leaveSettings = () => showTab(ui.prevTab && ui.prevTab !== 'settings' ? ui.prevTab : 'overview', true);
  $('open-settings').addEventListener('click', () => (ui.tab === 'settings' ? leaveSettings() : openSettings()));
  $('settings-back').addEventListener('click', leaveSettings);
  $('foot-settings').addEventListener('click', () => openSettings());

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetOpen) { closeSheet(); return; }
    if (e.key === 'Escape' && ui.tab === 'settings' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { leaveSettings(); return; }
    if (sheetOpen || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key >= '1' && e.key <= String(TABS.length)) { showTab(TABS[Number(e.key) - 1], true); }
    else if (e.key === ',') { e.preventDefault(); if (ui.tab !== 'settings') openSettings(); }
    else if (e.key === 't') cycleTheme();
  });

  // ---------- boot ----------
  state = load();
  saved = clone(state);
  applyTheme();
  renderNotice();
  setSave(storageOk ? '' : 'off', storageOk ? 'Saved on this device' : 'Not saved — storage blocked');
  const hash = location.hash.slice(1);
  showTab(VIEWS.includes(hash) ? hash : 'overview');
  if (cloud()) {
    cloud().subscribe(() => { paintStatus(); refreshSheet(); });
    cloud().init({
      flush: () => { if (saveTimer) flush(); },
      getState: () => clone(state),
      norm, merge, same,
      // Merge again with the live state so edits made while the sync was in flight are kept.
      applyRemote: (next) => {
        if (saveTimer) flush();
        const m = merge(state, next);
        if (same(m, state)) return;
        state = m;
        persistQuiet(); applyTheme(); render(); refreshSheet();
      },
    });
    if (cloud().justConnected()) toast('Signed in with Google — syncing your progress');
  }
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (ui.tab === 'overview') drawTrend(); }, 150); });
  // re-render after midnight so countdowns and "today" stay right
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (!$('lg-date').value) $('lg-date').value = today(); render(); } });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
