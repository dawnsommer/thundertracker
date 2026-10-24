// BlockFlow's clocks: the block timer (A) and the total exam timer (B), worked out from timestamps and
// banked time, never by counting ticks, so a background tab, sleep or a reload can't make them drift.
// Pure: no DOM, no storage, every function takes `now`. The page (js/blockflow.js) owns the one session.
//
// A clock is { acc, since }: time banked, plus, while running, the moment it last started.
// Phases: focus (block running) → end (block over; total still runs until you choose) → break (total
// paused, timer A counts the break down) → over (break over; total stays paused) → focus … → done.

const MIN = 60000;
const clock = (now) => ({ acc: 0, since: now == null ? null : now });
const run = (c, now) => { if (c.since == null) c.since = now; };
const stop = (c, now) => { if (c.since != null) { c.acc += Math.max(0, now - c.since); c.since = null; } };
export const elapsed = (c, now) => c.acc + (c.since != null ? Math.max(0, now - c.since) : 0);
const int = (x, lo, hi, d) => { const n = Math.round(Number(x)); return Number.isFinite(n) && x !== '' && x != null ? Math.min(hi, Math.max(lo, n)) : d; };

export const NBME = { q: 200, per: 20, pace: 90 }; // 10 blocks of 20 · 30 min each · 300 min
export const NBME_SECTIONS = [50, 100, 150];   // where the real NBME's four 50-question sections end

// Split the questions into blocks. Custom: q questions at `pace` s each, `per` to a block; a total-time
// override (minutes) is shared out in proportion to each block's questions.
export function plan(cfg) {
  const nbme = cfg.mode !== 'custom';
  const q = nbme ? NBME.q : int(cfg.q, 1, 1000, 40);
  const per = nbme ? NBME.per : int(cfg.per, 1, q, Math.min(20, q));
  const pace = nbme ? NBME.pace : int(cfg.pace, 5, 900, 90);
  const over = nbme ? null : int(cfg.total, 1, 1440, null);
  const total = over ? over * MIN : q * pace * 1000;
  const segs = [];
  let used = 0;
  for (let q0 = 1; q0 <= q; q0 += per) {
    const q1 = Math.min(q, q0 + per - 1), n = q1 - q0 + 1;
    const dur = q1 === q ? total - used : over ? Math.round((total * n) / q / 1000) * 1000 : n * pace * 1000;
    segs.push({ q0, q1, dur });
    used += dur;
  }
  return { mode: nbme ? 'nbme' : 'custom', q, segs, total };
}

export function start(cfg, now) {
  const p = plan(cfg);
  return { v: 1, mode: p.mode, q: p.q, segs: p.segs, total: p.total, seg: 0, phase: 'focus', paused: false,
    a: clock(now), b: clock(now), brk: null, brkUsed: 0, breaks: 0, fired: {}, started: now, ended: null,
    name: String(cfg.name || '').trim().slice(0, 60), blk: [], bAt: 0, qd: 0 };
}
const last = (s) => s.seg === s.segs.length - 1;
export const segLeft = (s, now) => s.segs[s.seg].dur - elapsed(s.a, now);
export const totLeft = (s, now) => s.total - elapsed(s.b, now);
export const brkLeft = (s, now) => (s.brk ? s.brk.dur - elapsed(s.brk.c, now) : 0);

// Events still to come while the clocks run as they are now: [{ key, type, at }]. Keys are unique per
// session, so an alert recorded in `fired` (and saved) never plays twice, even across a reload.
// o: { warn (ms before a block ends, 0 = off) }
export function pending(s, o = {}) {
  const ev = [];
  if (s.phase === 'focus' && s.a.since != null) {
    const end = s.a.since + s.segs[s.seg].dur - s.a.acc;
    if (o.warn > 0 && o.warn < s.segs[s.seg].dur && !s.fired['w' + s.seg]) ev.push({ key: 'w' + s.seg, type: 'warn', at: end - o.warn });
    ev.push({ key: 's' + s.seg, type: last(s) ? 'lastEnd' : 'segEnd', at: end });
  }
  if (s.b.since != null && !s.fired.t) ev.push({ key: 't', type: 'totalEnd', at: s.b.since + s.total - s.b.acc });
  if (s.phase === 'break' && s.brk.c.since != null) ev.push({ key: 'b' + s.breaks + '.' + s.brk.n, type: 'breakEnd', at: s.brk.c.since + s.brk.dur - s.brk.c.acc });
  return ev.sort((x, y) => x.at - y.at);
}

// Catch the session up to `now`, one event at a time in order (after sleep, several may be due).
// Each is applied at the moment it was due, not when we noticed. Returns the events, oldest first.
// o: { warn, auto (at a block's end, take a planned break or go straight on), planned (block numbers
// followed by a break), breakMs }
export function tick(s, now, o = {}) {
  const out = [];
  for (let guard = 0; guard < 500; guard++) {
    const e = pending(s, o)[0];
    if (!e || e.at > now) break;
    s.fired[e.key] = 1;
    out.push(e);
    if (e.type === 'segEnd' || e.type === 'lastEnd') {
      s.a.acc = s.segs[s.seg].dur; s.a.since = null; s.phase = 'end';
      if (o.auto && e.type === 'segEnd') {
        if ((o.planned || []).includes(s.seg + 1)) takeBreak(s, e.at, o.breakMs); else next(s, e.at);
      }
    }
    if (e.type === 'breakEnd') s.phase = 'over'; // the break clock keeps counting (shown as time over)
  }
  return out;
}

export function pause(s, now) {
  if (s.paused || s.phase === 'done') return false;
  stop(s.a, now); stop(s.b, now); if (s.brk) stop(s.brk.c, now);
  s.paused = true;
  return true;
}
export function resume(s, now) {
  if (!s.paused) return false;
  s.paused = false;
  if (s.phase === 'focus') { run(s.a, now); run(s.b, now); }
  if (s.phase === 'end') run(s.b, now);
  if (s.phase === 'break' || s.phase === 'over') run(s.brk.c, now);
  return true;
}
// Finish the block early: timer A stops; the total keeps running until you go on or take a break.
export function endBlock(s, now) {
  if (s.phase !== 'focus') return false;
  stop(s.a, now); s.fired['s' + s.seg] = 1; s.fired['w' + s.seg] = 1;
  s.phase = 'end';
  return true;
}
// The next block: from a block's end (Continue) or from a break (Start next block).
export function next(s, now) {
  if (!['end', 'break', 'over'].includes(s.phase)) return false;
  if (last(s)) return finish(s, now);
  endBreak(s, now); blockDone(s, now);
  s.seg++; s.a = clock(now); run(s.b, now);
  s.phase = 'focus'; s.paused = false;
  return true;
}
// Take a break: the total pauses and timer A counts the break down.
export function takeBreak(s, now, ms) {
  if (s.phase !== 'end' || last(s)) return false;
  stop(s.b, now);
  s.breaks++; s.brk = { dur: ms > 0 ? ms : 5 * MIN, c: clock(now), n: 0 };
  s.phase = 'break'; s.paused = false;
  return true;
}
// More break: during it, add time; once it's over, give `ms` from now. The total stays paused.
export function extend(s, now, ms) {
  if (s.phase !== 'break' && s.phase !== 'over') return false;
  const b = s.brk;
  b.dur = (s.phase === 'over' ? Math.max(b.dur, elapsed(b.c, now)) : b.dur) + ms;
  b.n++; s.phase = 'break';
  if (!s.paused) run(b.c, now);
  return true;
}
export function finish(s, now) {
  if (s.phase === 'done') return false;
  s.qd = qsDone(s);
  endBreak(s, now); stop(s.a, now); stop(s.b, now); blockDone(s, now);
  s.phase = 'done'; s.paused = false; s.ended = now;
  return true;
}
// a block's answering time is the total clock's time from its start to the next block (breaks excluded)
function blockDone(s, now) { if (!s.blk) return; const e = elapsed(s.b, now); s.blk[s.seg] = e - (s.bAt || 0); s.bAt = e; }
function endBreak(s, now) { if (s.brk) { stop(s.brk.c, now); s.brkUsed += s.brk.c.acc; s.brk = null; } }

// Questions behind you: every block before this one, plus this one once it's over.
export const qsDone = (s) => (s.phase === 'done' ? s.q : s.phase === 'focus' ? s.segs[s.seg].q0 - 1 : s.segs[s.seg].q1);

// A saved session, checked before use (it comes from storage).
export function valid(s) {
  const c = (x) => x && Number.isFinite(x.acc) && (x.since == null || Number.isFinite(x.since));
  return !!(s && s.v === 1 && Array.isArray(s.segs) && s.segs.length && s.segs.every((g) => g.dur > 0) && Number.isInteger(s.seg) && s.seg >= 0 && s.seg < s.segs.length &&
    ['focus', 'end', 'break', 'over', 'done'].includes(s.phase) && c(s.a) && c(s.b) && (s.brk == null || (c(s.brk.c) && s.brk.dur > 0)) &&
    ((s.phase !== 'break' && s.phase !== 'over') || s.brk) && s.fired && typeof s.fired === 'object' && s.total > 0);
}

// 1:05:09, 29:59, or with over=true the time past zero as +0:42
export function fmt(ms, withHours) {
  const neg = ms < 0, t = neg ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return (neg ? '+' : '') + (hh || withHours ? hh + ':' + p(mm) : mm) + ':' + p(ss);
}
// 1 h 7 min 30 s
export function fmtDur(ms) {
  const t = Math.round(ms / 1000), hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  return [hh && hh + ' h', mm && mm + ' min', ss && ss + ' s'].filter(Boolean).join(' ') || '0 min';
}

// ---- Session history (synced as its own Drive file): one record per finished session, merged record by
// record like the tracker's data: the newest `t` wins, a deletion leaves a tombstone in `del`.
export function record(s, n) {
  const used = elapsed(s.b, s.ended);
  return { id: s.started.toString(36) + Math.random().toString(36).slice(2, 6), n, name: s.name || '', mode: s.mode, start: s.started, end: s.ended,
    q: s.q, qd: s.qd, used, total: s.total, brk: s.brkUsed, breaks: s.breaks, blk: (s.blk || []).slice(0, s.segs.length),
    plan: s.segs.map((g) => g.dur), t: s.ended };
}
const fin = (x, lo = 0) => (Number.isFinite(Number(x)) && Number(x) >= lo ? Number(x) : 0);
export function normHistory(x) {
  const out = { v: 1, sessions: {}, del: {} };
  if (!x || typeof x !== 'object') return out;
  for (const [id, r] of Object.entries(x.sessions || {})) {
    if (!/^[a-z0-9]{4,24}$/.test(id) || !r || typeof r !== 'object' || !fin(r.start)) continue;
    const nums = (a) => (Array.isArray(a) ? a.slice(0, 1000).map((v) => fin(v)) : []);
    out.sessions[id] = { id, n: Math.round(fin(r.n)), name: typeof r.name === 'string' ? r.name.trim().slice(0, 60) : '', mode: r.mode === 'custom' ? 'custom' : 'nbme',
      start: fin(r.start), end: fin(r.end), q: Math.round(fin(r.q)), qd: Math.round(fin(r.qd)), used: fin(r.used), total: fin(r.total), brk: fin(r.brk),
      breaks: Math.round(fin(r.breaks)), blk: nums(r.blk), plan: nums(r.plan), t: fin(r.t) };
  }
  for (const [id, t] of Object.entries(x.del || {})) if (/^[a-z0-9]{4,24}$/.test(id) && fin(t)) out.del[id] = fin(t);
  for (const id in out.del) if (out.sessions[id] && out.sessions[id].t <= out.del[id]) delete out.sessions[id];
  return out;
}
export function mergeHistory(a, b) {
  const m = { v: 1, sessions: {}, del: Object.assign({}, a.del) };
  for (const [id, t] of Object.entries(b.del)) m.del[id] = Math.max(t, m.del[id] || 0);
  for (const src of [a, b]) for (const [id, r] of Object.entries(src.sessions)) if (!m.sessions[id] || r.t > m.sessions[id].t) m.sessions[id] = r;
  return normHistory(m);
}
// the next generic number (Session 01, 02 …)
export const nextN = (hist) => Object.values(hist.sessions).reduce((x, r) => Math.max(x, r.n), 0) + 1;
export const histName = (r) => r.name || 'Session ' + String(r.n).padStart(2, '0');
const canon = (x) => JSON.stringify([Object.keys(x.sessions).sort().map((k) => x.sessions[k]), Object.keys(x.del).sort().map((k) => [k, x.del[k]])]);
export const sameHistory = (a, b) => canon(a) === canon(b);
