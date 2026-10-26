// BlockFlow: an NBME / AMBOSS exam timer with exactly two clocks. Timer A counts each 20-question block
// down (and the break, when you take one); timer B counts the total answering time and pauses during
// breaks. The clock maths is in timer-engine.js; this module holds the one live session, saves it,
// plays the chimes and draws it in the page and, optionally, a Picture-in-Picture window. Both views
// read the same session, so there is only ever one timer.
// Settings (thundertracker:blockflow) and the live session (thundertracker:blockflow-session) stay in this
// browser. The history of finished sessions (thundertracker:blockflow-history) also syncs with Google, as its
// own Drive file (thundertracker-blockflow.json), separate from the tracker's data.

import { $, fmtDate, h, svgIcon } from './util.js?v=22';
import { toast, ui } from './store.js?v=22';
import { showTab } from './shell.js?v=22';
import { openSheet, sheetHead, sheetOpen } from './sheets.js?v=22';
import * as T from './timer-engine.js?v=22';

const CKEY = 'thundertracker:blockflow', SKEY = 'thundertracker:blockflow-session', HKEY = 'thundertracker:blockflow-history', MIN = 60000;
const DEF = { mode: 'nbme', q: 40, pace: 90, per: 20, total: '', brk: 5, ext: 5, planned: [], auto: false, warn: 0, sound: true, vol: 70, notify: false, display: 'page' };
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

export const cfg = Object.assign({}, DEF, read(CKEY) || {});
const saveCfg = () => write(CKEY, cfg);
const loadSession = () => { const s = read(SKEY); return T.valid(s) ? s : null; };
export let S = loadSession();           // the one session, or null
let recovered = !!(S && S.phase !== 'done'); // it was running before this page loaded
const persist = () => write(SKEY, S);
const now = () => Date.now();
const opts = () => ({ warn: cfg.warn * MIN, auto: cfg.auto, planned: cfg.planned, breakMs: cfg.brk * MIN });
const pipOk = () => 'documentPictureInPicture' in window;
export const live = () => !!(S && S.phase !== 'done');

// ---- history: one record per finished session, merged record by record (timer-engine.js)
let hist = T.normHistory(read(HKEY)), nameNext = '';
const cloud = () => window.CKCloud || null; // not store.js's: this runs while store.js is still loading
const saveHist = () => { write(HKEY, hist); if (cloud()) cloud().markDocDirty('blockflow'); drawHistory(); };
if (cloud()) cloud().addDoc({ name: 'blockflow', file: 'thundertracker-blockflow.json', get: () => JSON.parse(JSON.stringify(hist)),
  norm: T.normHistory, merge: T.mergeHistory, same: T.sameHistory, empty: (x) => !Object.keys(x.sessions).length && !Object.keys(x.del).length,
  apply: (m) => { hist = m; write(HKEY, hist); drawHistory(); } });
// a finished session goes into the history once (sessions under a minute of answering are left out)
function keep() {
  if (!S || S.phase !== 'done' || S.saved) return;
  if (T.elapsed(S.b, S.ended) >= MIN) { const r = T.record(S, T.nextN(hist)); hist.sessions[r.id] = r; S.saved = r.id; saveHist(); }
  else S.saved = '-';
  persist();
}

// ---- sounds: Web Audio, made here (no files). Upcoming alerts are scheduled on the audio clock, which
// keeps time in a background tab where timers are slowed down; tick() still catches anything missed.
let ac = null, master = null, sched = {};
function audio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ac = new AC(); } catch (e) { return null; }
    master = ac.createGain(); master.connect(ac.destination);
    ac.addEventListener('statechange', schedule);
    setVol();
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}
const setVol = () => { if (master) master.gain.value = cfg.sound ? (cfg.vol / 100) ** 2 : 0; };
// [Hz, start s, length s, wave, level]: a bell for a block's end, a rising run for a break's end,
// a pulsing alarm when the total runs out, one soft tick for the warning
const SOUNDS = {
  segEnd: [[659.25, 0, 1.8, 'sine', 1], [987.77, 0.2, 2, 'sine', 0.75], [1975.5, 0.2, 0.8, 'sine', 0.12]],
  breakEnd: [[523.25, 0, 0.45, 'triangle', 0.9], [659.25, 0.15, 0.45, 'triangle', 0.9], [783.99, 0.3, 0.45, 'triangle', 0.9], [1046.5, 0.45, 1.3, 'triangle', 0.8]],
  totalEnd: [0, 1, 2, 3, 6, 7, 8, 9].map((i) => [440, i * 0.2, 0.16, 'square', 0.3]),
  warn: [[1174.7, 0, 0.5, 'sine', 0.55]],
};
SOUNDS.lastEnd = SOUNDS.segEnd;
function play(type, delay = 0) {
  const c = audio();
  if (!c || c.state !== 'running') return null;
  const bus = c.createGain(), t0 = c.currentTime + delay;
  bus.connect(master);
  for (const [f, off, len, wave, g] of SOUNDS[type]) {
    const o = c.createOscillator(), e = c.createGain(), t = t0 + off;
    o.type = wave; o.frequency.value = f;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g * 0.5, t + 0.012); e.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(e).connect(bus); o.start(t); o.stop(t + len + 0.05);
  }
  return { bus, at: t0 };
}
const cancel = (k) => { if (sched[k]) { try { sched[k].bus.disconnect(); } catch (e) {} delete sched[k]; } };
// Only one open tab of the app sounds the alerts (the one holding the lock); the others just show.
let leader = !(navigator.locks && navigator.locks.request);
if (!leader) navigator.locks.request('thundertracker:blockflow', () => { leader = true; schedule(); return new Promise(() => {}); }).catch(() => { leader = true; });
function schedule() {
  Object.keys(sched).forEach(cancel);
  if (!leader || !live() || !ac || ac.state !== 'running') return;
  const t = now();
  for (const e of T.pending(S, opts())) if (e.at > t && e.at - t < 12 * 3600e3) { const p = play(e.type, (e.at - t) / 1000); if (p) sched[e.key] = p; }
}
const MSG = {
  warn: () => cfg.warn + ' min left in block ' + (S.seg + 1),
  segEnd: () => 'Block ' + (S.seg + 1) + ' is over (Q' + S.segs[S.seg].q0 + '–' + S.segs[S.seg].q1 + '). Continue or take a break.',
  lastEnd: () => 'The last block’s time is up.',
  breakEnd: () => 'Break’s over. Start the next block when you’re ready.',
  totalEnd: () => 'Total time is up.',
};
// Alerts for what just happened. Anything over a minute old (the page was closed, or the computer
// slept through it) is caught up silently; of several at once, only the latest sounds.
function alertFor(evs) {
  const t = now(), fresh = evs.filter((e) => t - e.at < MIN);
  if (!fresh.length || !leader) return;
  const e = fresh.find((x) => x.type === 'totalEnd') || fresh[fresh.length - 1];
  fresh.forEach((x) => { if (x !== e) cancel(x.key); });
  const s = sched[e.key];
  if (!(s && ac.currentTime >= s.at - 0.3)) { cancel(e.key); play(e.type); }
  delete sched[e.key];
  if (cfg.notify && window.Notification && Notification.permission === 'granted' && document.visibilityState === 'hidden' && !pip) {
    try { new Notification('BlockFlow', { body: MSG[e.type](), tag: 'thundertracker-blockflow', icon: 'icons/icon-192.png' }); } catch (err) {}
  }
}

// ---- the controller: every change goes through act(), which saves and redraws
function act(fn, ...args) {
  if (!S) return;
  if (fn(S, now(), ...args)) { persist(); keep(); changed(); }
}
function changed() { schedule(); draw(); }
function loop() {
  if (live()) {
    const ev = T.tick(S, now(), opts());
    if (ev.length) { persist(); alertFor(ev); changed(); }
  }
  draw(); paint();
}
setInterval(loop, 250);
document.addEventListener('visibilitychange', loop);
// another tab started, paused or ended the session
window.addEventListener('storage', (e) => {
  if (e.key === SKEY) { S = loadSession(); recovered = false; changed(); }
  if (e.key === HKEY) { hist = T.normHistory(read(HKEY)); drawHistory(); }
  if (e.key === CKEY) { Object.assign(cfg, DEF, read(CKEY) || {}); setVol(); built = ''; changed(); }
});
// browsers start audio only after a tap or key press
const unlock = () => { if (cfg.sound && (live() || ui.tab === 'timer')) { audio(); if (ac && ac.state === 'running' && !Object.keys(sched).length) schedule(); } };
document.addEventListener('pointerdown', unlock, true);
document.addEventListener('keydown', unlock, true);

function begin() {
  audio();
  S = T.start(Object.assign({}, cfg, { name: nameNext }), now()); recovered = false; nameNext = '';
  persist();
  if (cfg.display === 'pip' && pipOk()) openPip(); // inside the Start click, as the browser requires
  changed();
}
function discard() { S = null; recovered = false; persist(); closePip(); changed(); }

// ---- Picture-in-Picture (Chrome's Document Picture-in-Picture): the same session, a small view
let pip = null, pipKey = '';
async function openPip() {
  if (!pipOk()) { toast('Picture-in-picture needs desktop Chrome or Edge. The timer stays on this page.'); return; }
  if (pip) { pip.focus(); return; }
  let w;
  try { w = await window.documentPictureInPicture.requestWindow({ width: 340, height: 270 }); }
  catch (e) { toast('Couldn’t open picture-in-picture. The timer stays on this page.'); return; }
  document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => { const c = w.document.createElement('link'); c.rel = 'stylesheet'; c.href = l.href; w.document.head.append(c); });
  w.document.title = 'BlockFlow';
  w.document.body.className = 'bf-pip';
  w.document.addEventListener('pointerdown', unlock, true);
  w.addEventListener('pagehide', () => { if (pip === w) { pip = null; pipKey = ''; draw(true); } });
  pip = w; pipKey = '';
  draw(true);
}
function closePip() { if (pip) { const w = pip; pip = null; pipKey = ''; w.close(); } }

// ---- views
const ICON = {
  pip: svgIcon('<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="11" width="8" height="6" rx="1"/>'),
  sound: svgIcon('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  mute: svgIcon('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>'),
};
let built = '';
// Rebuild only when what's on screen changes shape (phase, block, pause, overtime); paint() updates the digits.
function viewKey(compact) {
  if (!S) return 'setup';
  const over = S.phase !== 'done' && T.totLeft(S, now()) < 0;
  return [compact ? 'pip' : 'page', S.started, S.phase, S.seg, S.paused, over, cfg.sound, !!pip, recovered, S.brk && S.brk.n].join('|');
}
export function draw(force) {
  if (force) built = '';
  const btn = $('open-timer');
  btn.classList.toggle('live', live());
  if (pip) {
    pip.document.documentElement.dataset.theme = document.documentElement.dataset.theme || '';
    const k = viewKey(true);
    if (k !== pipKey) { pipKey = k; pip.document.body.replaceChildren(S ? liveView(true) : h('p', { class: 'sub', text: 'No session running. Start one on the BlockFlow page.' })); }
  }
  if (ui.tab !== 'timer') return;
  const k = viewKey(false);
  if (k === built) return;
  built = k;
  $('bf-body').replaceChildren(h('div', { class: 'bf-main' }, S ? liveView(false) : setupView()), h('aside', { class: 'bf-side', id: 'bf-hist', 'aria-label': 'History' }));
  drawHistory(); paint();
}
export const renderTimer = () => draw();

function status() {
  if (S.phase === 'done') return ['done', 'Complete'];
  if (S.paused) return ['paused', 'Paused'];
  if ((S.phase === 'focus' || S.phase === 'end') && T.totLeft(S, now()) < 0) return ['overtime', 'Overtime'];
  return { focus: ['focus', 'Focus'], end: ['end', 'Block done'], break: ['break', 'Break'], over: ['over', 'Break over'] }[S.phase];
}
const onBreak = () => S.phase === 'break' || S.phase === 'over';
function paint() {
  if (!S) return;
  for (const root of [ui.tab === 'timer' && $('bf-body'), pip && pip.document.body]) {
    if (!root) continue;
    const t = now(), f = (n) => root.querySelector('[data-f="' + n + '"]');
    const a = onBreak() ? T.brkLeft(S, t) : S.phase === 'done' ? 0 : T.segLeft(S, t), b = T.totLeft(S, t);
    if (f('a')) f('a').textContent = S.phase === 'done' ? T.fmt(T.elapsed(S.b, t), true) : T.fmt(a);
    if (f('b')) f('b').textContent = S.phase === 'done' ? T.fmt(S.brkUsed) : T.fmt(b, true);
    const cur = f('cur');
    if (cur && S.phase === 'focus') cur.style.width = Math.min(100, (100 * T.elapsed(S.a, t)) / S.segs[S.seg].dur).toFixed(2) + '%';
  }
}

function liveView(compact) {
  const [st, stLabel] = status(), g = S.segs[S.seg], n = S.segs.length, done = S.phase === 'done';
  const btn = (label, fn, cls, extra) => h('button', Object.assign({ class: 'btn ' + (cls || ''), onclick: fn }, extra || {}), label);
  const lastBlock = S.seg === n - 1, planned = cfg.planned.includes(S.seg + 1), over = !done && T.totLeft(S, now()) < 0;
  const acts = [];
  if (done) {
    if (!compact) acts.push(btn('New session', discard, 'primary'), btn('Same again', begin));
  } else if (S.paused) {
    acts.push(btn('Resume', () => act(T.resume), 'primary'));
  } else {
    if (S.phase === 'focus') acts.push(btn('Pause', () => act(T.pause)), btn(lastBlock ? 'Finish last block' : 'Finish block early', () => act(T.endBlock)));
    if (S.phase === 'end' && !lastBlock) acts.push(btn('Continue to block ' + (S.seg + 2), () => act(T.next), planned ? '' : 'primary'),
      btn('Take break · ' + cfg.brk + ' min', () => act(T.takeBreak, cfg.brk * MIN), planned ? 'primary' : ''), btn('Pause', () => act(T.pause), 'ghost'));
    if (onBreak()) acts.push(btn('Start block ' + (S.seg + 2), () => act(T.next), S.phase === 'over' ? 'primary' : ''),
      btn((S.phase === 'over' ? 'Extend break' : 'More break') + ' +' + cfg.ext + ' min', () => act(T.extend, cfg.ext * MIN)), btn('Pause', () => act(T.pause), 'ghost'));
    if (S.phase === 'end' && lastBlock) acts.push(btn('Finish exam', () => act(T.finish), 'primary'), btn('Pause', () => act(T.pause), 'ghost'));
    if (over && !(S.phase === 'end' && lastBlock)) acts.push(btn('Finish exam', () => act(T.finish), 'primary'));
  }
  const rec = done && hist.sessions[S.saved];
  const where = done ? (rec ? T.histName(rec) + ' · ' : S.name ? S.name + ' · ' : '') + plural(S.qd || S.q, 'question') + ' · ' + plural(S.breaks, 'break')
    : 'Block ' + (S.seg + 1) + ' of ' + n + ' · Q' + g.q0 + '–' + g.q1;
  const aLabel = done ? 'Answering time' : onBreak() ? (S.phase === 'over' ? 'Break · over by' : 'Break') : 'Block ' + (S.seg + 1);
  const aSub = done ? 'of ' + T.fmt(S.total, true) + ' allowed' : onBreak() ? 'of ' + T.fmt(S.brk.dur) + ' · total paused' : S.phase === 'end' ? 'time’s up · total still running' : 'of ' + T.fmt(g.dur);
  const bLabel = done ? 'Breaks' : over ? 'Total · overtime' : 'Total left';
  const bSub = done ? '' : onBreak() || S.paused ? 'paused' : 'of ' + T.fmt(S.total, true);
  const clocks = h('div', { class: 'bf-clocks' + (S.paused ? ' is-paused' : '') },
    h('div', { class: 'bf-clock a ' + (onBreak() ? 'brk' : done ? 'fin' : '') }, h('span', { class: 'lab', text: aLabel }), h('span', { class: 't', 'data-f': 'a', role: 'timer' }), h('span', { class: 'hint', text: aSub })),
    h('div', { class: 'bf-clock b' + (over ? ' ot' : '') }, h('span', { class: 'lab', text: bLabel }), h('span', { class: 't', 'data-f': 'b', role: 'timer' }), bSub && h('span', { class: 'hint', text: bSub })));
  const cells = h('div', { class: 'bf-cells', 'aria-hidden': 'true' }, S.segs.map((x, i) => {
    const state = done || i < S.seg || (i === S.seg && S.phase !== 'focus') ? 'on' : i === S.seg ? 'cur' : '';
    return h('i', { class: state, style: 'flex:' + (x.q1 - x.q0 + 1) }, state === 'cur' ? h('b', { 'data-f': 'cur' }) : null);
  }), S.mode === 'nbme' && !compact ? T.NBME_SECTIONS.map((q) => h('u', { style: 'left:' + (100 * q) / S.q + '%', title: 'NBME section ends at Q' + q })) : null);
  const qd = T.qsDone(S);
  const prog = h('div', { class: 'bf-prog' }, cells, compact ? null : h('div', { class: 'bf-prog-l' },
    h('span', { class: 'num', text: qd + ' of ' + S.q + ' questions' }),
    S.mode === 'nbme' ? h('span', { class: 'hint' }, h('i', { class: 'bf-tick' }), 'NBME’s own sections end at Q50, Q100, Q150') : null));
  const head = h('div', { class: 'bf-head' }, h('span', { class: 'bf-st ' + st, text: stLabel }), h('span', { class: 'bf-where', text: where }),
    h('span', { class: 'bf-tools' },
      done ? null : h('button', { class: 'icon-btn sm', 'aria-pressed': cfg.sound ? 'false' : 'true', 'aria-label': cfg.sound ? 'Mute' : 'Unmute', title: cfg.sound ? 'Mute' : 'Unmute', onclick: () => { cfg.sound = !cfg.sound; saveCfg(); setVol(); if (cfg.sound) audio(); changed(); } }),
      compact || !pipOk() || done ? null : h('button', { class: 'icon-btn sm', id: 'bf-pip-btn', 'aria-pressed': pip ? 'true' : 'false', 'aria-label': pip ? 'Close the floating timer' : 'Open a floating timer (picture-in-picture)', title: pip ? 'Close the floating timer' : 'Float on top (picture-in-picture)', onclick: () => (pip ? closePip() : openPip()) })));
  const ib = head.querySelectorAll('.icon-btn');
  if (!done) ib[0].innerHTML = cfg.sound ? ICON.sound : ICON.mute;
  if (ib[1]) ib[1].innerHTML = ICON.pip;
  const kids = [head, clocks, prog, h('div', { class: 'btnrow bf-acts' }, acts)];
  if (!compact && !done) kids.push(h('div', { class: 'bf-foot' }, confirmBtn('End session', 'Tap again to end', () => act(T.finish))));
  if (!compact && recovered && !done) kids.unshift(h('div', { class: 'banner bf-rec' },
    h('span', { text: 'Session restored. It kept running while the page was closed, so the times are up to date.' }),
    h('span', { class: 'btnrow' }, S.paused ? null : h('button', { class: 'btn', onclick: () => { recovered = false; act(T.pause); } }, 'Pause'),
      h('button', { class: 'btn', onclick: () => { recovered = false; draw(true); } }, 'Keep going'), confirmBtn('Discard', 'Tap again to discard', discard))));
  return h('div', { class: 'bf-live' + (compact ? ' compact' : ''), 'data-phase': S.phase }, kids);
}
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
// a deliberate two-tap button for ending or discarding a session
function confirmBtn(label, sure, fn) {
  let armed = 0;
  const b = h('button', { class: 'btn ghost danger', onclick: () => {
    if (armed) { clearTimeout(armed); fn(); return; }
    b.textContent = sure; armed = setTimeout(() => { armed = 0; b.textContent = label; }, 3000);
  } }, label);
  return b;
}

// The setup: mode, what the plan comes to, the blocks (tap one to plan a break after it), the few
// options you change often; the rest under More. Typing never rebuilds the inputs: refresh() redraws around them.
function setupView() {
  const set = (k, v) => { cfg[k] = v; saveCfg(); refresh(); };
  const seg = (k, choices) => h('div', { class: 'seg mode', role: 'group', 'data-k': k }, choices.map(([v, label, dis]) =>
    h('button', { 'data-v': v, disabled: dis || null, onclick: () => set(k, v) }, label)));
  const num = (k, label, attrs) => h('label', { class: 'bf-num' }, h('span', { text: label }),
    h('input', Object.assign({ id: 'bf-' + k, type: 'number', inputmode: 'numeric', value: cfg[k], oninput: (e) => set(k, e.target.value === '' ? '' : Number(e.target.value)) }, attrs)));
  const row = (label, ...ctl) => h('div', { class: 'bf-mrow' }, h('span', { text: label }), h('span', { class: 'bf-mctl' }, ctl));
  const sum = h('div', { class: 'bf-sum', id: 'bf-sum' }), strip = h('div', { class: 'bf-strip', id: 'bf-breaks' });
  const note = h('span', { class: 'hint bf-note' });
  const soundBtn = h('button', { class: 'icon-btn sm', id: 'bf-sound', onclick: () => { set('sound', !cfg.sound); setVol(); if (cfg.sound) audio(); } });
  const vol = h('input', { type: 'range', min: 0, max: 100, value: cfg.vol, 'aria-label': 'Volume', class: 'bf-vol', oninput: (e) => { cfg.vol = Number(e.target.value); saveCfg(); setVol(); } });
  const test = (type, label) => h('button', { class: 'pill', onclick: () => { const c = audio(); if (c) c.resume().then(() => play(type)).catch(() => {}); } }, label);
  const notifyNote = h('span', { class: 'hint' });
  const notifyBox = h('input', { type: 'checkbox', id: 'bf-notify', checked: cfg.notify || null, onchange: async (e) => {
    if (e.target.checked && window.Notification && Notification.permission === 'default') await Notification.requestPermission().catch(() => {});
    set('notify', e.target.checked && !!window.Notification && Notification.permission === 'granted'); e.target.checked = cfg.notify;
  } });
  const startBtn = h('button', { class: 'btn primary bf-start', id: 'bf-start', onclick: begin });
  const root = h('div', { class: 'card bf-setup' },
    h('div', { class: 'bf-top' }, seg('mode', [['nbme', 'NBME'], ['custom', 'Custom']]), note),
    sum,
    h('div', { class: 'bf-custom', id: 'bf-custom' }, num('q', 'Questions', { min: 1, max: 1000 }), num('pace', 'Sec / question', { min: 5, max: 900 }),
      num('per', 'Per block', { min: 1, max: 1000 }), num('total', 'Total min', { min: 1, max: 1440, placeholder: 'auto' })),
    h('div', { class: 'bf-blocks' }, h('div', { class: 'bf-blocks-h' }, h('span', { class: 'lab', text: 'Blocks' }), h('span', { class: 'hint', text: 'Tap a block to plan a break after it' })), strip),
    h('div', { class: 'bf-opts' },
      h('label', { class: 'bf-inl' }, 'Break', h('input', { id: 'bf-brk', type: 'number', inputmode: 'numeric', min: 1, max: 120, value: cfg.brk, oninput: (e) => set('brk', Number(e.target.value) || 5) }), 'min'),
      h('span', { class: 'bf-inl' }, soundBtn, vol),
      seg('display', [['page', 'In page'], ['pip', 'Floating', !pipOk()]])),
    h('details', { class: 'bf-more', id: 'bf-adv' }, h('summary', { text: 'More' }),
      row('Extend a break by', h('label', { class: 'bf-inl' }, h('input', { id: 'bf-ext', type: 'number', inputmode: 'numeric', min: 1, max: 60, value: cfg.ext, oninput: (e) => set('ext', Number(e.target.value) || 5) }), 'min')),
      row('Warn before a block ends', h('select', { class: 'sel', id: 'bf-warn', onchange: (e) => set('warn', Number(e.target.value)) }, [0, 1, 2, 5].map((m) => h('option', { value: m, selected: cfg.warn === m || null }, m ? m + ' min' : 'Off')))),
      row('Start planned breaks and next blocks by themselves', h('input', { type: 'checkbox', id: 'bf-auto', class: 'bf-check', checked: cfg.auto || null, onchange: (e) => set('auto', e.target.checked), 'aria-label': 'Automatic' })),
      row('Notify when the page is in the background', notifyNote, notifyBox),
      row('Test sounds', test('segEnd', 'Block'), test('breakEnd', 'Break'), test('totalEnd', 'Time up'), test('warn', 'Warning'))),
    h('div', { class: 'bf-go' }, h('input', { id: 'bf-name', class: 'bf-name', type: 'text', maxlength: 60, value: nameNext, autocomplete: 'off',
      placeholder: 'Name (optional) · Session ' + String(T.nextN(hist)).padStart(2, '0'), 'aria-label': 'Session name (optional)',
      oninput: (e) => { nameNext = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') begin(); } }), startBtn));
  function refresh() {
    const p = T.plan(cfg), n = p.segs.length, nb = cfg.mode === 'nbme';
    root.querySelectorAll('[data-k] button').forEach((b) => b.setAttribute('aria-pressed', cfg[b.parentNode.dataset.k] === b.dataset.v ? 'true' : 'false'));
    root.querySelector('#bf-custom').hidden = nb;
    note.textContent = nb ? 'Blocks are pacing marks, not NBME’s 4 sections' : 'AMBOSS, UWorld or any qbank';
    const equal = p.segs.every((g) => g.dur === p.segs[0].dur);
    sum.replaceChildren(...[[p.q, 'questions'], [n, (n === 1 ? 'block' : 'blocks') + (equal ? ' of ' + T.fmt(p.segs[0].dur) : '')], [T.fmt(p.total, true), 'total']]
      .map(([v, l]) => h('div', null, h('b', { text: String(v) }), h('span', { text: l }))));
    if (cfg.planned.some((x) => x >= n)) { cfg.planned = cfg.planned.filter((x) => x < n); saveCfg(); }
    strip.classList.toggle('dense', n > 16);
    strip.replaceChildren(...p.segs.map((g, i) => {
      const on = cfg.planned.includes(i + 1), lastOne = i === n - 1, range = 'Q' + g.q0 + (g.q1 > g.q0 ? '–' + g.q1 : '') + ' · ' + T.fmt(g.dur);
      return h('button', { style: 'flex:' + (g.q1 - g.q0 + 1), 'data-b': i + 1, class: on ? 'brk' : '', disabled: lastOne || null, title: range,
        'aria-pressed': lastOne ? null : on ? 'true' : 'false', 'aria-label': 'Block ' + (i + 1) + ', ' + range + (lastOne ? '' : ', break after'),
        onclick: () => { cfg.planned = on ? cfg.planned.filter((x) => x !== i + 1) : cfg.planned.concat(i + 1).sort((x, y) => x - y); saveCfg(); refresh(); } }, String(i + 1));
    }));
    soundBtn.innerHTML = cfg.sound ? ICON.sound : ICON.mute;
    soundBtn.setAttribute('aria-pressed', cfg.sound ? 'false' : 'true');
    soundBtn.setAttribute('aria-label', cfg.sound ? 'Sound on: tap to mute' : 'Sound off: tap to turn on');
    vol.disabled = !cfg.sound;
    notifyNote.textContent = !window.Notification ? 'Not available here' : Notification.permission === 'denied' ? 'Blocked in site settings' : '';
    notifyBox.disabled = !window.Notification || Notification.permission === 'denied';
    startBtn.textContent = 'Start · ' + plural(p.q, 'question') + ' · ' + T.fmt(p.total, true);
  }
  refresh();
  return root;
}

// ---- history: the 3 latest sessions beside the timer; all of them in a side panel that scrolls on its own
// (so 100 sessions never make the page longer). Tap a name to rename, × deletes (with undo).
const PEEK = 3;
const histList = () => Object.values(hist.sessions).sort((a, b) => b.start - a.start);
const histKey = () => h('p', { class: 'hint bf-hkey' }, h('i'), 'time per block against its plan', h('i', { class: 'over' }), 'ran over');
function histRow(r) {
  const qs = r.qd || r.q, spq = qs ? Math.round(r.used / 1000 / qs) : 0;
  const name = h('button', { class: 'bf-hn', title: 'Rename', onclick: () => {
    const inp = h('input', { class: 'bf-hn-in', type: 'text', maxlength: 60, value: r.name, placeholder: 'Session ' + String(r.n).padStart(2, '0'), 'aria-label': 'Session name' });
    let done = false;
    const fin = (ok) => { if (done) return; done = true; const v = inp.value.trim().slice(0, 60); if (ok && v !== r.name) { r.name = v; r.t = Math.max(Date.now(), r.t + 1); saveHist(); } else drawHistory(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') fin(true); if (e.key === 'Escape') { e.stopPropagation(); fin(false); } });
    inp.addEventListener('blur', () => fin(true));
    name.replaceWith(inp); inp.focus(); inp.select();
  } }, T.histName(r));
  const bars = h('div', { class: 'bf-hbars', 'aria-hidden': 'true' }, r.plan.map((p, i) => {
    const u = r.blk[i] || 0, x = p ? u / p : 0;
    return h('i', { class: !u ? 'no' : x > 1.02 ? 'over' : '', title: 'Block ' + (i + 1) + ': ' + (u ? T.fmt(u) + ' of ' + T.fmt(p) : 'not reached') }, h('b', { style: 'height:' + Math.round(Math.min(1.3, x) / 1.3 * 100) + '%' }));
  }));
  return h('div', { class: 'bf-hrow', 'data-id': r.id },
    h('div', { class: 'bf-hmain' }, name, h('span', { class: 'bf-hdate', text: fmtDate(dayOf(r.start)) + (r.mode === 'custom' ? ' · custom' : '') })),
    h('div', { class: 'bf-hstat num' }, h('span', { text: qs + (qs < r.q ? '/' + r.q : '') + ' q · ' + spq + ' s/q' + (r.breaks ? ' · ' + plural(r.breaks, 'break') : '') }),
      h('span', { text: T.fmt(r.used, true) + ' / ' + T.fmt(r.total, true) })),
    bars,
    h('button', { class: 'xs bf-hx', 'aria-label': 'Delete ' + T.histName(r), title: 'Delete', onclick: () => {
      delete hist.sessions[r.id]; hist.del[r.id] = Math.max(Date.now(), r.t + 1); saveHist();
      toast('Deleted ' + T.histName(r), () => { r.t = Math.max(Date.now(), hist.del[r.id] + 1); hist.sessions[r.id] = r; saveHist(); });
    } }, '×'));
}
function drawHistory() {
  if (sheetOpen && sheetOpen.key === 'bf-hist') sheetOpen.refresh();
  const box = ui.tab === 'timer' && $('bf-hist');
  if (!box) return;
  const all = histList();
  const head = h('div', { class: 'bf-hhead' }, h('h3', { text: 'History' }), all.length ? h('span', { class: 'hint num', text: String(all.length) }) : null);
  if (!all.length) {
    box.replaceChildren(h('div', { class: 'card bf-hist' }, head, h('p', { class: 'hint bf-hempty', text: 'Finished sessions show up here with their date, pace and time per block. They sync with Google when you’re signed in.' })));
    return;
  }
  box.replaceChildren(h('div', { class: 'card bf-hist' }, head, all.slice(0, PEEK).map(histRow),
    all.length > PEEK ? h('button', { class: 'btn ghost bf-hall', 'data-open': 'bf-hist', onclick: openHistory }, 'All ' + all.length + ' sessions') : null, histKey()));
}
// the full list: search by name, grouped by month, newest first
const monthOf = ((f) => (ts) => f.format(new Date(ts)))(new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }));
function openHistory() {
  let q = '';
  const list = h('div', { class: 'bf-hlist' });
  const search = h('input', { type: 'search', class: 'sel bf-hsearch', placeholder: 'Search by name', 'aria-label': 'Search sessions by name', oninput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } });
  const count = h('p', { class: 'sub' });
  function draw() {
    const all = histList(), shown = q ? all.filter((r) => T.histName(r).toLowerCase().includes(q)) : all;
    count.textContent = plural(all.length, 'session') + (q ? ' · ' + shown.length + ' shown' : '');
    const kids = [];
    let month = '';
    for (const r of shown) {
      const m = monthOf(r.start);
      if (m !== month) { month = m; kids.push(h('div', { class: 'eyebrow bf-hmonth', text: m })); }
      kids.push(histRow(r));
    }
    list.replaceChildren(...(kids.length ? kids : [h('p', { class: 'hint', text: all.length ? 'No session matches “' + q + '”.' : 'No sessions yet.' })]));
  }
  draw();
  openSheet('bf-hist', 'Session history', [sheetHead('BlockFlow', 'History'), count, search, list, histKey()], draw, '.bf-hsearch');
}
const dayOf = (ts) => { const d = new Date(ts); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// ---- the page: opened from the timer icon in the header (#timer)
const leave = () => showTab(ui.prevTab && !['timer', 'settings'].includes(ui.prevTab) ? ui.prevTab : 'overview', true);
export function openTimer() { if (ui.tab !== 'timer' && ui.tab !== 'settings') ui.prevTab = ui.tab; showTab('timer', true); window.scrollTo(0, 0); }
$('open-timer').addEventListener('click', () => (ui.tab === 'timer' ? leave() : openTimer()));
// Space pauses and resumes while the BlockFlow page is open
document.addEventListener('keydown', (e) => {
  if (e.key !== ' ' || ui.tab !== 'timer' || !live() || /^(INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY)$/.test(e.target.tagName)) return;
  e.preventDefault();
  act(S.paused ? T.resume : T.pause);
});
if (recovered) {
  const t = h('div', { class: 'toast' }, h('span', { text: 'Your BlockFlow session is still running.' }), h('button', { onclick: () => { t.remove(); openTimer(); } }, 'Open'));
  setTimeout(() => { if (ui.tab !== 'timer') { $('toasts').replaceChildren(t); setTimeout(() => t.remove(), 8000); } }, 0);
}
setTimeout(loop, 0); // after every module has loaded (store.js and shell.js import this one)
// for tests: the live session and the engine
window.__blockflow = { get S() { return S; }, T, get pip() { return pip; }, sched: () => Object.keys(sched) };
