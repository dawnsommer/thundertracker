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
  const SRC = ['UWorld', 'AMBOSS', 'Other'];

  const FORM_ST = ['Not taken', 'Taken', 'Reviewed', 'Anki made'];
  const SYS_ST = ['Not started', 'Learning', 'Qbank done', 'Revised'];
  const TABS = ['overview', 'nbme', 'cms', 'systems', 'qbank'];
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

  // ---------- sanitising (old saves and imported files) ----------
  const ID_RE = /^[a-z0-9-]{1,48}$/i;
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const arr = (x) => (Array.isArray(x) ? x : []);
  const str = (x, max = 4000) => (typeof x === 'string' ? x.slice(0, max) : typeof x === 'number' && Number.isFinite(x) ? String(x) : '');
  const int = (x, lo, hi) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
  const isDate = (x) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(new Date(x + 'T00:00:00')) ? x : '');
  const inRange = (x, lo, hi) => { const v = num(x); return v != null && v >= lo && v <= hi ? String(v) : ''; };
  const ints = (a, lo, hi) => [...new Set(arr(a).map(Number).filter((n) => Number.isInteger(n) && n >= lo && n <= hi))].sort((x, y) => x - y);

  function normItem(x) {
    x = obj(x);
    return { status: int(x.status, 0, 3), score: str(x.score, 12), pct: str(x.pct, 12), date: isDate(x.date), notes: str(x.notes) };
  }
  function normSys(x) {
    x = obj(x);
    return { status: int(x.status, 0, 3), conf: int(x.conf, 0, 5), notes: str(x.notes), uw: str(x.uw, 12),
      tags: [...new Set(arr(x.tags).filter((t) => typeof t === 'string').map((t) => t.slice(0, 30)))] };
  }
  function normLog(x) {
    x = obj(x);
    const date = isDate(x.date), q = int(x.q, 0, 5000);
    if (!date || !q) return null;
    return { id: typeof x.id === 'string' && ID_RE.test(x.id) ? x.id : uid(), date, q, pct: inRange(x.pct, 0, 100),
      src: SRC.includes(x.src) ? x.src : 'UWorld', note: str(x.note, 200) };
  }
  function migrate(sys) {
    for (const old in MERGE) {
      if (!sys[old]) continue;
      const a = sys[old], to = MERGE[old], b = sys[to] || normSys(null);
      sys[to] = {
        status: Math.max(a.status, b.status), conf: Math.max(a.conf, b.conf), uw: b.uw || a.uw,
        notes: [b.notes, a.notes].filter(Boolean).join('\n'),
        tags: [...new Set([...b.tags, ...a.tags])],
      };
      delete sys[old];
    }
    return sys;
  }

  const blank = () => ({ v: 2, items: {}, systems: {}, extraForms: {}, extraAssess: {}, extraSystems: [], removed: [], log: [],
    prefs: { showOld: false, theme: 'system', examDate: '', target: '', bank: '', chart: 'score', sysSort: 'default', lastBackup: '' } });

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
    return {
      v: 2, items, systems: migrate(sys), extraForms, extraAssess,
      extraSystems: arr(s.extraSystems).filter((x) => x && typeof x.id === 'string' && ID_RE.test(x.id) && typeof x.name === 'string' && x.name.trim())
        .map((x) => ({ id: x.id, name: x.name.trim().slice(0, 60) })),
      removed: [...new Set(arr(s.removed).filter((x) => typeof x === 'string' && ID_RE.test(x)))],
      log: arr(s.log).map(normLog).filter(Boolean),
      prefs: {
        showOld: !!p.showOld,
        theme: ['light', 'dark'].includes(p.theme) ? p.theme : b.theme,
        examDate: isDate(p.examDate),
        target: inRange(p.target, 1, 300),
        bank: inRange(p.bank, 1, 20000),
        chart: p.chart === 'pct' ? 'pct' : b.chart,
        sysSort: ['conf', 'status', 'uw', 'az'].includes(p.sysSort) ? p.sysSort : b.sysSort,
        lastBackup: typeof p.lastBackup === 'string' ? p.lastBackup.slice(0, 40) : '',
      },
    };
  }

  // ---------- state + storage ----------
  let state = blank();
  const ui = { tab: 'overview', subj: 'all', st: 'all', addingFor: null, focusAdd: false, editForms: false, logAll: false };
  let saveTimer = null, storageOk = true, storageMsg = '';

  const item = (id) => state.items[id] || { status: 0, score: '', pct: '', date: '', notes: '' };
  const sysItem = (id) => state.systems[id] || normSys(null);

  const setSave = (cls, text) => { $('save').className = 'save ' + cls; $('save-t').textContent = text; };

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
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageOk = true;
      setSave('', 'Saved on this device');
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
    applyTheme(); render(); refreshSheet();
  });

  // Undo: capture the whole state before a destructive change.
  function snapshot() {
    const snap = JSON.stringify(state);
    return () => { state = norm(JSON.parse(snap)); applyTheme(); save(); render(); refreshSheet(); };
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
  }

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

  function qbStats() {
    const log = state.log, t = dayNum(today());
    const total = sum(log.map((e) => e.q));
    const scored = log.filter((e) => num(e.pct) != null);
    const sq = sum(scored.map((e) => e.q));
    const acc = sq ? sum(scored.map((e) => e.q * num(e.pct))) / sq : null;
    const recent = log.filter((e) => { const d = t - dayNum(e.date); return d >= 0 && d < 7; });
    const days = new Set(log.map((e) => dayNum(e.date)));
    let streak = 0, d = days.has(t) ? t : t - 1;
    while (days.has(d)) { streak++; d--; }
    let best = 0, run = 0, prev = null;
    [...days].sort((a, b) => a - b).forEach((x) => { run = prev === x - 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; });
    const bySrc = {};
    log.forEach((e) => (bySrc[e.src] = (bySrc[e.src] || 0) + e.q));
    return { total, acc, week: sum(recent.map((e) => e.q)), streak, best, bySrc, uw: bySrc.UWorld || 0, bank: num(state.prefs.bank), sessions: log.length };
  }
  const isEmpty = () => !Object.keys(state.items).length && !Object.keys(state.systems).length && !state.log.length && !state.prefs.examDate;

  // ---------- tabs ----------
  function showTab(t, push) {
    if (!TABS.includes(t)) t = 'overview';
    ui.tab = t;
    document.querySelectorAll('.tab').forEach((b) => {
      const on = b.dataset.tab === t;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('section.view').forEach((s) => (s.hidden = s.id !== 'view-' + t));
    if (push && location.hash !== '#' + t) try { history.pushState(null, '', '#' + t); } catch (e) {}
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
      h('p', { text: 'Everything you log stays in this browser — no account, nothing sent anywhere. Set your test date first, then tap any form to log it.' }),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn primary', 'data-open': 'settings', onclick: () => openSettings('#st-exam') }, 'Set test date & target'),
        h('button', { class: 'btn', onclick: () => $('import').click() }, 'Import a backup'),
        h('button', { class: 'btn ghost', onclick: () => showTab('nbme', true) }, 'Log an NBME')),
      h('p', { class: 'hint', text: 'Used an earlier version of this tracker? Import its backup file and your forms, systems and notes carry over.' })));

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
      tile(qb.bank ? 'UWorld qbank' : 'Qbank', fmtK(qb.bank ? qb.uw : qb.total), qb.bank ? 'of ' + fmtK(qb.bank) : 'questions', qb.bank ? qb.uw / qb.bank : null,
        qb.total ? (qb.acc != null ? fmtPct(qb.acc) + ' correct · ' : '') + qb.week + ' this week' : h('button', { class: 'linkish', onclick: () => showTab('qbank', true) }, 'Log your first session')),
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
    if (qb.bank && dl != null && dl > 0) {
      const rest = qb.bank - qb.uw;
      lis.push(['Qbank', rest > 0 ? fmtK(rest) + ' UWorld questions left · ~' + Math.ceil(rest / dl) + '/day to finish by test day' : 'UWorld bank finished — nice.']);
    }
    const unrev = tests.concat(cms).filter((f) => item(f.id).status === 1);
    if (unrev.length) lis.push(['Review', go(plural(unrev.length, 'taken form') + ' still need review: ' + unrev.slice(0, 4).map((f) => f.full).join(', ') + (unrev.length > 4 ? '…' : ''), () => openForm(unrev[0]), unrev[0].id)]);
    const weak = SUBJ.map((s) => ({ s, a: avg(cmsForms(s, state.prefs.showOld).map(pctOf).filter(nn)) }))
      .filter((x) => x.a != null).sort((a, b) => a.a - b.a)[0];
    if (weak) lis.push(['Weakest', go(weak.s.name + ' CMS average is ' + fmtPct(weak.a), () => { ui.subj = weak.s.key; showTab('cms', true); })]);
    const lowSys = allSystems().filter((s) => sysItem(s.id).conf > 0).sort((a, b) => sysItem(a.id).conf - sysItem(b.id).conf)[0];
    if (lowSys) lis.push(['Low conf.', go(lowSys.name + ' (' + sysItem(lowSys.id).conf + '/5)', () => openSystem(lowSys), lowSys.id)]);
    const notStarted = allSystems().filter((s) => sysItem(s.id).status === 0);
    if (notStarted.length) lis.push(['Systems', notStarted.length + ' not started yet, e.g. ' + notStarted.slice(0, 3).map((s) => s.name).join(', ')]);
    if (!isEmpty()) {
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

  // Activity calendar: questions logged per day, exam days ringed.
  function renderHeat(box) {
    const weeks = 20, t = dayNum(today());
    const start = t - weekday(t) - (weeks - 1) * 7;
    const act = new Map();
    const get = (d) => { if (!act.has(d)) act.set(d, { q: 0, ex: [] }); return act.get(d); };
    state.log.forEach((e) => (get(e.date).q += e.q));
    allTests().concat(SUBJ.flatMap((s) => cmsForms(s, true))).forEach((f) => { const it = item(f.id); if (it.status > 0 && it.date) get(it.date).ex.push(f.full); });
    const cells = [], months = [];
    let prevMonth = null, activeDays = 0, totalQ = 0;
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
        const a = act.get(fromDay(n)), q = a ? a.q : 0;
        if (a) { activeDays++; totalQ += q; }
        const lv = q === 0 ? 0 : q < 40 ? 1 : q < 80 ? 2 : q < 160 ? 3 : 4;
        cells.push(h('i', { class: 'hc l' + lv + (a && a.ex.length ? ' ex' : '') + (n === t ? ' today' : ''),
          title: fmtDate(fromDay(n)) + ' · ' + (q ? q + ' questions' : 'no questions') + (a && a.ex.length ? ' · ' + a.ex.join(', ') : '') }));
      }
    }
    const cols = 'grid-template-columns:repeat(' + weeks + ',1fr)';
    box.replaceChildren(
      h('div', { class: 'heat-m', style: cols, 'aria-hidden': 'true' }, months),
      h('div', { class: 'heat', style: cols, role: 'img', 'aria-label': 'Activity over the last ' + weeks + ' weeks: ' + plural(activeDays, 'active day') + ', ' + totalQ + ' questions' }, cells),
      h('div', { class: 'heat-legend', 'aria-hidden': 'true' },
        h('span', null, 'Less', [0, 1, 2, 3, 4].map((l) => h('i', { class: 'hc l' + l })), 'More'),
        h('span', null, h('i', { class: 'hc ex' }), 'Exam day')));
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
          h('span', { style: 'min-width:0' }, statusPill(it.status, FORM_ST), it.notes ? h('span', { class: 'notes-p', text: it.notes }) : null),
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
  function setSys(id, patch) {
    state.systems[id] = Object.assign({}, sysItem(id), patch);
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
    $('sys-rows').replaceChildren(...sortedSystems().map((sy) => {
      const it = sysItem(sy.id), uw = num(it.uw);
      return h('div', { class: 'sys' },
        h('div', { class: 'sys-main' },
          h('button', { class: 'nm', 'data-open': sy.id, onclick: () => openSystem(sy) }, sy.name, it.notes ? h('small', { text: it.notes }) : null),
          h('div', { class: 'tags' }, TAGS.filter((t) => t === 'Sketchy' || it.tags.includes(t)).map((t) => tagBtn(sy.id, t)),
            uw != null ? h('span', { class: 'tag uw ' + band('cms', uw), title: 'UWorld % correct', text: 'UW ' + fmtPct(uw) }) : null)),
        h('span', { class: 'conf', role: 'group', 'aria-label': 'Confidence for ' + sy.name },
          [1, 2, 3, 4, 5].map((n) => h('button', { class: it.conf >= n ? 'on' : '', 'aria-label': 'Confidence ' + n, 'aria-pressed': it.conf === n ? 'true' : 'false', title: 'Confidence ' + n + '/5', onclick: () => setSys(sy.id, { conf: it.conf === n ? 0 : n }) }))),
        h('span', { class: 'seg', role: 'group', 'aria-label': 'Status for ' + sy.name },
          SYS_ST.map((l, i) => h('button', { class: 'v' + i, 'aria-pressed': it.status === i ? 'true' : 'false', onclick: () => setSys(sy.id, { status: i }) }, l))));
    }), h('div', { class: 'add-sys' }, inp, h('button', { class: 'btn', onclick: add }, 'Add')));
  }
  $('sys-sort').addEventListener('change', (e) => { state.prefs.sysSort = e.target.value; save(); render(); });

  // ---------- qbank tab ----------
  function renderQbank() {
    const qb = qbStats();
    const others = Object.entries(qb.bySrc).filter(([k]) => k !== 'UWorld').map(([k, v]) => k + ' ' + fmtK(v)).join(' · ');
    $('qb-tiles').replaceChildren(
      tile('UWorld done', fmtK(qb.uw), qb.bank ? 'of ' + fmtK(qb.bank) : 'questions', qb.bank ? qb.uw / qb.bank : null,
        qb.bank ? fmtPct(qb.uw / qb.bank * 100) + ' of the bank' + (others ? ' · ' + others : '') : h('button', { class: 'linkish', 'data-open': 'settings', onclick: () => openSettings('#st-bank') }, 'Set your bank size to track completion')),
      tile('Accuracy', qb.acc != null ? fmtPct(qb.acc) : '—', '', qb.acc != null ? qb.acc / 100 : null, 'Weighted by questions · all qbanks'),
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
    const back = document.querySelector('[data-open="' + CSS.escape(key) + '"]');
    if (back) back.focus();
  }
  const refreshSheet = () => { if (sheetOpen && sheetOpen.refresh) sheetOpen.refresh(); };
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
      h('div', { class: 'field' }, h('label', { for: 'ed-notes', text: 'Notes' }), notesIn),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'Done'), clearBtn, rmBtn),
    ], () => {
      const a = document.activeElement;
      if (score && a !== score.inp) score.inp.value = cur().score;
      if (a !== pct.inp) pct.inp.value = cur()[pctKey];
      if (a !== dateIn) dateIn.value = cur().date;
      if (a !== notesIn) notesIn.value = cur().notes;
      drawStep(); drawConv();
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
    const rows = [['type', 'group', 'name', 'status', 'score_3digit', 'percent_correct', 'questions', 'date', 'notes']];
    GROUPS.forEach((g) => testForms(g, true).forEach((f) => {
      const it = item(f.id);
      rows.push(['assessment', g.short, f.label, FORM_ST[it.status], g.scaled ? it.score : '', it.pct, g.qs, it.date, it.notes]);
    }));
    SUBJ.forEach((s) => cmsForms(s, true, true).forEach((f) => {
      const it = item(f.id);
      if (!f.removed || it.status) rows.push(['cms', s.name, f.label, FORM_ST[it.status], '', it.score, 50, it.date, it.notes]);
    }));
    allSystems().forEach((sy) => {
      const it = sysItem(sy.id);
      rows.push(['system', '', sy.name, SYS_ST[it.status] + (it.conf ? ' · confidence ' + it.conf + '/5' : ''), '', it.uw, '', '', [it.tags.join(' / '), it.notes].filter(Boolean).join(' · ')]);
    });
    state.log.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => rows.push(['qbank', e.src, '', '', '', e.pct, e.q, e.date, e.note]));
    download('ck-tracker-' + today() + '.csv', '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv');
    toast('CSV downloaded');
  }
  $('import').addEventListener('change', () => {
    const inp = $('import'), file = inp.files && inp.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      inp.value = '';
      let data = null;
      try { data = JSON.parse(r.result); } catch (e) {}
      if (!data || typeof data !== 'object' || !('items' in data)) { toast('That file isn’t a tracker backup.'); return; }
      const undo = snapshot();
      state = norm(data);
      applyTheme(); save(); render(); refreshSheet();
      toast('Backup restored', undo);
    };
    r.readAsText(file);
  });

  function openSettings(focus) {
    const p = () => state.prefs;
    const setPref = (k, v) => { state.prefs[k] = v; save(); render(); };
    const examIn = h('input', { type: 'date', id: 'st-exam', value: p().examDate, min: today() });
    examIn.addEventListener('change', () => setPref('examDate', isDate(examIn.value)));
    const target = numField('st-target', 'Target score', { inputmode: 'numeric', step: '1', placeholder: 'e.g. 255', value: p().target }, 1, 300, true, (raw) => setPref('target', raw));
    const bank = numField('st-bank', 'UWorld bank size', { inputmode: 'numeric', step: '1', placeholder: 'e.g. 3800', value: p().bank }, 1, 20000, true, (raw) => setPref('bank', raw));
    const theme = h('div', { class: 'seg mode', role: 'group', 'aria-label': 'Theme' });
    const drawTheme = () => theme.replaceChildren(...[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) =>
      h('button', { 'aria-pressed': p().theme === k ? 'true' : 'false', onclick: () => { state.prefs.theme = k; applyTheme(); save(); drawTheme(); } }, l)));
    drawTheme();
    const backupNote = h('p', { class: 'hint' });
    const drawBackup = () => {
      const lb = p().lastBackup;
      backupNote.textContent = lb ? 'Last backup ' + fmtDate(lb.slice(0, 10)) + '. ' : 'No backup yet. ';
      backupNote.textContent += 'Backups are JSON files you can import on any device. CSV opens in Excel or Sheets.';
    };
    drawBackup();
    const persistNote = h('p', { class: 'hint' });
    const persistBtn = h('button', { class: 'btn', hidden: true, onclick: async () => {
      try { await navigator.storage.persist(); } catch (e) {}
      checkPersist();
    } }, 'Protect from clearing');
    const checkPersist = async () => {
      if (!navigator.storage || !navigator.storage.persisted) { persistNote.textContent = 'Your browser decides how long site data is kept — export backups regularly.'; return; }
      const ok = await navigator.storage.persisted().catch(() => false);
      persistNote.textContent = ok ? 'This browser has agreed to keep your data unless you clear it yourself.' : 'The browser may clear site data when space runs low. Ask it to keep your data, and export backups regularly.';
      persistBtn.hidden = ok;
    };
    checkPersist();
    let armTimer = null;
    const resetBtn = h('button', { class: 'btn ghost danger', onclick: () => {
      if (!resetBtn.dataset.arm) {
        resetBtn.dataset.arm = '1'; resetBtn.textContent = 'Tap again to erase everything';
        armTimer = setTimeout(() => { delete resetBtn.dataset.arm; resetBtn.textContent = 'Erase all data'; }, 4000);
        return;
      }
      clearTimeout(armTimer);
      const undo = snapshot();
      const theme = state.prefs.theme;
      state = blank(); state.prefs.theme = theme;
      save(); closeSheet();
      toast('All data erased', undo);
    } }, 'Erase all data');

    openSheet('settings', 'Settings', [
      sheetHead('Settings', 'Plan & backup'),
      h('div', { class: 'two' }, h('div', { class: 'field' }, h('label', { for: 'st-exam', text: 'Test date' }), examIn), target.field),
      h('div', { class: 'two' }, bank.field, h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Theme' }), theme)),
      h('p', { class: 'hint', text: 'The test date drives the countdown, pace and score projection. The target adds a line to the score chart.' }),
      h('div', { class: 'sect' },
        h('h3', { text: 'Backup' }), backupNote,
        h('div', { class: 'btnrow' },
          h('button', { class: 'btn primary', id: 'st-export', onclick: exportJson }, 'Export backup'),
          h('button', { class: 'btn', onclick: exportCsv }, 'Export CSV'),
          h('button', { class: 'btn', onclick: () => $('import').click() }, 'Import backup')),
        persistNote, h('div', { class: 'btnrow' }, persistBtn)),
      h('div', { class: 'sect' },
        h('h3', { text: 'Danger zone' }),
        h('p', { class: 'hint', text: 'Erases every score, note and session in this browser. You can undo right after.' }),
        h('div', { class: 'btnrow' }, resetBtn)),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'Done')),
    ], () => {
      const a = document.activeElement;
      if (a !== examIn) examIn.value = p().examDate;
      if (a !== target.inp) target.inp.value = p().target;
      if (a !== bank.inp) bank.inp.value = p().bank;
      drawTheme(); drawBackup();
    }, focus);
  }
  $('open-settings').addEventListener('click', () => openSettings());
  $('foot-settings').addEventListener('click', () => openSettings());

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetOpen) { closeSheet(); return; }
    if (sheetOpen || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key >= '1' && e.key <= String(TABS.length)) { showTab(TABS[Number(e.key) - 1], true); }
    else if (e.key === ',') { e.preventDefault(); openSettings(); }
  });

  // ---------- boot ----------
  state = load();
  applyTheme();
  renderNotice();
  setSave(storageOk ? '' : 'off', storageOk ? 'Saved on this device' : 'Not saved — storage blocked');
  const hash = location.hash.slice(1);
  showTab(TABS.includes(hash) ? hash : 'overview');
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (ui.tab === 'overview') drawTrend(); }, 150); });
  // re-render after midnight so countdowns and "today" stay right
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (!$('lg-date').value) $('lg-date').value = today(); render(); } });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
