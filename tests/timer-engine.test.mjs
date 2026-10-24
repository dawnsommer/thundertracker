// BlockFlow's clock engine (js/timer-engine.js) on its own: plans, the phase machine, both clocks.
import * as T from '../js/timer-engine.js?v=test';
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const M = 60000, t0 = 1_000_000;

// plans
const n = T.plan({ mode: 'nbme' });
ok(n.q === 200 && n.segs.length === 10 && n.segs.every((g) => g.dur === 30 * M) && n.total === 300 * M, 'NBME: 200 questions, 10 blocks of 30 min, 300 min');
ok(n.segs.map((g) => g.q0 + '-' + g.q1).join(' ') === '1-20 21-40 41-60 61-80 81-100 101-120 121-140 141-160 161-180 181-200', 'NBME block ranges Q1–20 … Q181–200');
const c = T.plan({ mode: 'custom', q: 45, pace: 90, per: 20 });
ok(c.segs.map((g) => g.dur / 1000).join() === '1800,1800,450' && c.total === 4050e3, '45 questions at 90 s: 30, 30 and 7:30 (67:30 in all)');
const o = T.plan({ mode: 'custom', q: 45, pace: 90, per: 20, total: 60 });
ok(o.segs.map((g) => g.dur / 1000).join() === '1600,1600,400' && o.segs.reduce((a, g) => a + g.dur, 0) === 60 * M, 'a total-time override is shared out by questions and adds up exactly');
ok(T.plan({ mode: 'custom', q: 7, pace: 60, per: 20 }).segs.length === 1 && T.plan({ mode: 'custom', q: '', pace: '', per: '' }).q === 40, 'one short block; empty fields fall back to defaults');
ok(T.fmt(30 * M) === '30:00' && T.fmt(1) === '0:01' && T.fmt(0) === '0:00' && T.fmt(-42e3) === '+0:42' && T.fmt(300 * M, true) === '5:00:00' && T.fmt(29 * M + 59500) === '30:00', 'formatting rounds a countdown up, shows time over as +');

// a block, run to its end
let s = T.start({ mode: 'nbme' }, t0);
ok(T.valid(s) && s.phase === 'focus' && T.segLeft(s, t0) === 30 * M && T.totLeft(s, t0) === 300 * M, 'start: block 1, both clocks full');
ok(T.tick(s, t0 + 29 * M).length === 0 && T.segLeft(s, t0 + 29 * M) === M, 'nothing fires before the end; derived from timestamps');
let ev = T.tick(s, t0 + 30 * M + 5000);
ok(ev.length === 1 && ev[0].type === 'segEnd' && ev[0].at === t0 + 30 * M && s.phase === 'end', 'block end fires once, dated when it was due');
ok(T.segLeft(s, t0 + 40 * M) === 0 && T.totLeft(s, t0 + 40 * M) === 260 * M, 'after the end timer A stays at 0:00 and the total keeps running');
ok(T.tick(s, t0 + 41 * M).length === 0, 'no second alert');

// continue without a break
ok(T.next(s, t0 + 31 * M) && s.seg === 1 && s.phase === 'focus' && T.segLeft(s, t0 + 31 * M) === 30 * M && T.totLeft(s, t0 + 31 * M) === 269 * M, 'Continue: block 2 starts full, total carries on');

// finish early, then a break
ok(T.endBlock(s, t0 + 51 * M) && s.phase === 'end' && T.qsDone(s) === 40, 'finish block early: block over, 40 questions done');
ok(T.tick(s, t0 + 62 * M).length === 0, 'an early-finished block doesn’t chime later');
ok(T.takeBreak(s, t0 + 52 * M, 5 * M) && s.phase === 'break', 'Take break');
const atBreak = T.totLeft(s, t0 + 52 * M);
ok(T.totLeft(s, t0 + 56 * M) === atBreak && T.brkLeft(s, t0 + 56 * M) === M, 'the total pauses; timer A counts the break down');
ev = T.tick(s, t0 + 57 * M + 1);
ok(ev.length === 1 && ev[0].type === 'breakEnd' && s.phase === 'over', 'break end fires');
ok(T.totLeft(s, t0 + 70 * M) === atBreak && T.brkLeft(s, t0 + 70 * M) === -13 * M, 'after the break the total stays paused; time over is counted on A');
ok(T.extend(s, t0 + 70 * M, 5 * M) && s.phase === 'break' && T.brkLeft(s, t0 + 70 * M) === 5 * M, 'Extend break: 5 more minutes from now');
ev = T.tick(s, t0 + 75 * M + 1);
ok(ev.length === 1 && ev[0].type === 'breakEnd' && ev[0].key !== 'b1.0', 'the extended break ends with its own alert');
ok(T.next(s, t0 + 76 * M) && s.seg === 2 && T.totLeft(s, t0 + 76 * M) === atBreak && s.brkUsed === 24 * M && !s.brk, 'Start next block: total resumes where it stopped; break time banked');

// manual pause
ok(T.pause(s, t0 + 80 * M) && !T.pause(s, t0 + 81 * M), 'pause (twice is a no-op)');
ok(T.segLeft(s, t0 + 200 * M) === 26 * M && T.tick(s, t0 + 999 * M).length === 0, 'paused: both clocks hold, nothing fires');
ok(T.resume(s, t0 + 200 * M) && T.segLeft(s, t0 + 201 * M) === 25 * M && !T.resume(s, t0 + 201 * M), 'resume carries on from where it was');
// pause during a break keeps the total paused afterwards
T.endBlock(s, t0 + 202 * M); T.takeBreak(s, t0 + 202 * M, 5 * M); T.pause(s, t0 + 203 * M); T.resume(s, t0 + 300 * M);
ok(s.phase === 'break' && s.b.since == null && T.brkLeft(s, t0 + 300 * M) === 4 * M, 'pause and resume in a break: the total stays paused, the break holds');
ok(!T.takeBreak(s, t0 + 300 * M, M) && !T.endBlock(s, t0 + 300 * M), 'actions that don’t fit the phase are refused');

// sleep through several events: each applied in order at its own time
s = T.start({ mode: 'nbme' }, t0);
ev = T.tick(s, t0 + 3 * 3600e3, { warn: 2 * M });
ok(ev.map((e) => e.type).join() === 'warn,segEnd' && s.phase === 'end', 'after sleep: warning and block end, once each; the next block waits for you');
ok(T.totLeft(s, t0 + 3 * 3600e3) === 120 * M, 'the total kept running the whole time (it only pauses for a break)');

// automatic mode: planned break after block 1, straight on after block 2
s = T.start({ mode: 'nbme' }, t0);
const auto = { auto: true, planned: [1], breakMs: 5 * M };
ev = T.tick(s, t0 + 30 * M + 1000, auto);
ok(s.phase === 'break' && s.brk.c.since === t0 + 30 * M && T.totLeft(s, t0 + 31 * M) === 270 * M, 'auto: planned break starts at the block’s end, total paused from then');
T.tick(s, t0 + 40 * M, auto);
ok(s.phase === 'over' && s.seg === 0, 'auto never starts the next block after a break');
T.next(s, t0 + 40 * M);
T.tick(s, t0 + 70 * M + 1, auto);
ok(s.seg === 2 && s.phase === 'focus' && T.segLeft(s, t0 + 70 * M + 1) === 30 * M - 1, 'auto: no break planned, the next block starts on time');

// total expiry and overtime
s = T.start({ mode: 'custom', q: 2, pace: 60, per: 1, total: 1 }, t0);
T.tick(s, t0 + 30e3); T.next(s, t0 + 30e3);
ev = T.tick(s, t0 + 61e3);
ok(ev.map((e) => e.type).join() === 'lastEnd,totalEnd', 'last block and total expiry');
ok(T.totLeft(s, t0 + 90e3) === -30e3 && T.tick(s, t0 + 99e3).length === 0, 'overtime counts on (negative), alert fired only once');
ok(!T.next(s, t0 + 91e3) || s.phase === 'done', 'Continue after the last block finishes the exam');
ok(s.phase === 'done' && T.elapsed(s.b, t0 + 999e3) === 91e3 && T.qsDone(s) === 2, 'done: answering time frozen');

// saved sessions are checked
ok(T.valid(JSON.parse(JSON.stringify(s))) && !T.valid({ v: 1 }) && !T.valid(null) && !T.valid(Object.assign({}, s, { seg: 9 })), 'valid() accepts a saved session and rejects broken ones');
