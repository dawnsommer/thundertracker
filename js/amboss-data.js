// AMBOSS tracker data: read from the user's own AMBOSS tracker page (dawnsommer.github.io/amboss-tracker/,
// rebuilt and pushed by their local MogiAmboss tool) and the numbers the AMBOSS tab and the overview card show.
// Pure: no DOM, no imports, so Node tests it (tests/amboss-data.test.mjs). Nothing here is saved or synced:
// the page is the source, fetched again when it's older than a few minutes.

const S_ = (x, max = 2000) => (typeof x === 'string' ? x.slice(0, max) : typeof x === 'number' && Number.isFinite(x) ? String(x) : '');
const N_ = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const A_ = (x) => (Array.isArray(x) ? x : []);
const O_ = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const dict = (x) => Object.fromEntries(Object.entries(O_(x)).filter(([k, v]) => typeof v === 'string' && k.length <= 40).map(([k, v]) => [k, v.slice(0, 120)]));
const ERAS = ['legacy', 'current'];

// The page carries its data on one line: `const D = {...};`. Returns the cleaned data, or null if it isn't there.
export function parseDashboard(html) {
  const m = /^\s*const D = (\{.*\});?\s*$/m.exec(String(html || ''));
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[1]); } catch (e) { return null; }
  return normDashboard(d);
}

export function normDashboard(d) {
  d = O_(d);
  if (!Array.isArray(d.scores) && !Array.isArray(d.questions)) return null;
  const era = (x) => (ERAS.includes(x) ? x : 'legacy');
  const questions = A_(d.questions).filter((q) => q && typeof q === 'object').slice(0, 20000).map((q) => ({
    id: S_(q.id, 40), set: S_(q.set, 40), era: era(q.era), status: ['I', 'U', '?'].includes(q.status) ? q.status : '?',
    qtype: S_(q.qtype, 60), subject: S_(q.subject, 40), system: S_(q.system, 40), topic: S_(q.topic, 200), error: S_(q.error, 4),
    call: S_(q.call), hinge: S_(q.hinge), trap: S_(q.trap), selected: S_(q.selected, 400) }));
  const scores = A_(d.scores).filter((s) => s && N_(s.pct) != null).slice(0, 5000).map((s) => ({
    seq: N_(s.seq) ?? S_(s.seq, 20), date: /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : '', pct: N_(s.pct), n_q: N_(s.n_q) || 20,
    targeted: s.targeted === true, doc: S_(s.doc, 40), era: era(s.era), note: S_(s.note, 200),
    systems: A_(s.systems).map((x) => S_(x, 40)).filter(Boolean), batch_stable: N_(s.batch_stable) }));
  const batches = A_(d.batches).filter((b) => b && typeof b === 'object').map((b) => ({
    set: S_(b.set, 40), era: era(b.era), I: N_(b.I) || 0, U: N_(b.U) || 0, reviewed: N_(b.reviewed) || 0,
    n_q: N_(b.n_q), pct: N_(b.pct), stable_pct: N_(b.stable_pct) }));
  const sets = A_(d.sets).map((x) => S_(x, 40)).filter(Boolean);
  for (const q of questions) if (q.set && !sets.includes(q.set)) sets.push(q.set);
  return {
    questions, scores, batches, sets,
    timeline: A_(d.timeline).filter((r) => r && typeof r === 'object').map((r) => ({ at: S_(r.at_block, 20), system: S_(r.system, 40), action: S_(r.action, 10) })),
    sysEst: A_(d.sys_est).filter((r) => r && N_(r.acc) != null).map((r) => ({ system: S_(r.system, 40), seen: N_(r.seen) || 0, I: N_(r.I) || 0, U: N_(r.U) || 0, acc: N_(r.acc) })),
    unplaced: N_(d.sys_unplaced) || 0,
    errors: dict(d.errors), systems: dict(d.systems), subjects: dict(d.subjects),
    statuses: Object.assign({ I: 'Incorrect', U: 'Unstable', '?': 'Unknown' }, dict(d.statuses)),
    built: S_(d.built, 40),
  };
}

// accuracy over blocks, weighted by their question counts
export const blockAvg = (a) => {
  const n = a.reduce((t, b) => t + b.n_q, 0);
  return n ? a.reduce((t, b) => t + b.pct * b.n_q, 0) / n : null;
};
export const hasCurrent = (D) => D.questions.some((q) => q.era === 'current') || D.scores.some((s) => s.era === 'current');
export const scopeQ = (D, era) => D.questions.filter((q) => era === 'all' || q.era === era);
const scopeSets = (D, Q) => D.sets.filter((s) => Q.some((q) => q.set === s));
const countBy = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});

// the systems you're doing now: the last block's selection, else the ones the timeline added
export function selected(D) {
  const S = D.scores;
  if (S.length && S[S.length - 1].systems.length) return S[S.length - 1].systems;
  return [...new Set(D.timeline.filter((r) => r.action !== 'remove').map((r) => r.system))];
}

// What to do about the commonest miss reason (from the AMBOSS tracker page)
export const TIPS = {
  K: 'Content gap: read the AMBOSS article for these topics and card the key facts.',
  T: 'Trap bait: before choosing, name the distractor detail in the stem and why it’s tempting.',
  S: 'Sequencing: is the patient stable? What must come before what (diagnostic vs therapeutic)?',
  D: 'Detail or cutoff: drill the numbers (thresholds, timings, doses) as flashcards.',
  R: 'Reasoning: re-read the last line before answering; for biostats, draw the 2×2 first.',
};

// Headline numbers (whole history, like the page): last 3 and last 10 blocks, the change against the
// 3 before, stable % of the latest batch, questions done; and for the chosen era, what was reviewed.
export function kpis(D, era) {
  const S = D.scores, l3 = S.slice(-3), p3 = S.slice(-6, -3);
  const last3 = blockAvg(l3), prev3 = blockAvg(p3);
  const withStable = D.batches.filter((b) => b.stable_pct != null);
  const Q = scopeQ(D, era), errs = countBy(Q.filter((q) => q.error), (q) => q.error);
  const top = Object.entries(errs).sort((a, b) => b[1] - a[1])[0];
  return {
    last3, delta: last3 != null && prev3 != null ? last3 - prev3 : null, last10: blockAvg(S.slice(-10)),
    blocks: S.length, questions: S.reduce((t, s) => t + s.n_q, 0),
    lastBatch: withStable[withStable.length - 1] || null,
    reviewed: Q.length, I: Q.filter((q) => q.status === 'I').length, U: Q.filter((q) => q.status === 'U').length,
    topErr: top ? { key: top[0], name: D.errors[top[0]] || top[0], n: top[1], share: Q.length ? top[1] / Q.length : 0 } : null,
  };
}

// Block accuracy for the chart: each block, the last-3 average, the batch's stable %, where the legacy era ends
// and where a system was added.
export function series(D) {
  const S = D.scores;
  const roll = S.map((_, i) => (i < 2 ? null : blockAvg(S.slice(i - 2, i + 1))));
  const adds = {};
  for (const r of D.timeline) if (r.action !== 'remove') {
    const i = S.findIndex((s) => String(s.seq) === r.at);
    if (i >= 0) (adds[i] = adds[i] || []).push(r.system);
  }
  return { blocks: S, roll, stable: S.map((s) => s.batch_stable), legacy: S.filter((s) => s.era === 'legacy').length, adds };
}

// Topics to look at next: recent review sets and repeats weigh more (each set back counts 0.75×; unstable 0.6×).
export function focus(D, era, n = 7) {
  const Q = scopeQ(D, era), sets = scopeSets(D, Q), rank = Object.fromEntries(sets.map((s, i) => [s, sets.length - 1 - i]));
  const t = {};
  for (const q of Q) {
    if (!q.topic) continue;
    const k = q.system + '|' + q.topic;
    const o = t[k] = t[k] || { system: q.system, topic: q.topic, score: 0, I: 0, U: 0, last: q.set };
    o.score += Math.pow(0.75, rank[q.set] ?? 0) * (q.status === 'U' ? 0.6 : 1);
    if (q.status === 'I' || q.status === 'U') o[q.status]++;
    if ((rank[q.set] ?? 99) < (rank[o.last] ?? 99)) o.last = q.set;
  }
  return Object.values(t).sort((a, b) => b.score - a.score).slice(0, n);
}

// Miss reasons: counts per error type in the last 3 review sets and in the whole scope.
export function why(D, era) {
  const Q = scopeQ(D, era), sets = scopeSets(D, Q).slice(-3), recent = Q.filter((q) => sets.includes(q.set));
  const mix = (a) => ({ n: a.length, tagged: a.filter((q) => q.error).length, by: countBy(a.filter((q) => q.error), (q) => q.error) });
  const r = mix(recent), all = mix(Q);
  const top = Object.entries((recent.length ? r : all).by).sort((a, b) => b[1] - a[1])[0];
  return { keys: Object.keys(D.errors), recent: r, all, sets, top: top ? top[0] : null };
}

// Systems × the last 10 review sets: reviewed questions (incorrect + unstable) per cell, and whether the
// last 3 sets have more or fewer than the ones before.
export function heat(D, era) {
  const Q = scopeQ(D, era), sets = scopeSets(D, Q).slice(-10), inSets = Q.filter((q) => sets.includes(q.set));
  const sel = selected(D), sysN = countBy(inSets, (q) => q.system);
  const rows = [...sel.filter((s) => sysN[s]), ...Object.keys(sysN).filter((s) => !sel.includes(s)).sort((a, b) => sysN[b] - sysN[a])];
  const cell = {};
  let max = 1;
  for (const q of inSets) {
    const c = cell[q.system + '|' + q.set] = cell[q.system + '|' + q.set] || { I: 0, U: 0, n: 0 };
    if (q.status === 'I' || q.status === 'U') c[q.status]++;
    c.n++; max = Math.max(max, c.n);
  }
  const r3 = sets.slice(-3), e3 = sets.slice(0, -3);
  const per = (s, list) => list.reduce((t, b) => t + (cell[s + '|' + b] ? cell[s + '|' + b].n : 0), 0) / (list.length || 1);
  return {
    sets, max,
    rows: rows.map((s) => {
      const rr = per(s, r3), er = per(s, e3);
      return { system: s, sel: sel.includes(s), total: sysN[s], cells: sets.map((b) => cell[s + '|' + b] || null),
        trend: !e3.length ? '' : rr > er * 1.2 ? 'more' : rr < er * 0.8 ? 'fewer' : 'steady' };
    }),
  };
}

// incorrect and unstable counts grouped by a key (subject, question type), biggest first
export function groups(D, era, key, n = 8) {
  const g = {};
  for (const q of scopeQ(D, era)) {
    const k = q[key] || '—', o = g[k] = g[k] || { key: k, I: 0, U: 0, n: 0 };
    if (q.status === 'I' || q.status === 'U') o[q.status]++;
    o.n++;
  }
  return Object.values(g).sort((a, b) => b.n - a.n).slice(0, n);
}

// estimated accuracy per system (from the page's own estimate), weakest first; only systems seen 8+ times
export const sysEstimates = (D) => D.sysEst.filter((r) => r.seen >= 8).sort((a, b) => a.acc - b.acc);
export const doneBatches = (D) => D.batches.filter((b) => b.era === 'current' && b.n_q).slice(-8).reverse();

// the question browser: newest first
export function browse(D, era, f) {
  const t = (f.q || '').trim().toLowerCase();
  return scopeQ(D, era).filter((q) => (!f.system || q.system === f.system) && (!f.status || q.status === f.status) &&
    (!f.error || q.error === f.error) && (!f.set || q.set === f.set) &&
    (!t || (q.topic + ' ' + q.call + ' ' + q.trap + ' ' + q.hinge).toLowerCase().includes(t))).reverse();
}
export const filterOptions = (D, era) => {
  const Q = scopeQ(D, era);
  return { systems: [...new Set(Q.map((q) => q.system).filter(Boolean))].sort(), sets: scopeSets(D, Q).slice().reverse() };
};

// the page writes a little LaTeX ($69 / 460 = 15.0\%$); show it as plain text
export const plain = (s) => String(s || '').replace(/\\%/g, '%').replace(/\$([^$]*)\$/g, '$1').replace(/\\(times|cdot)/g, '×');
