// The AMBOSS tracker numbers (js/amboss-data.js) on their own, from a synthetic page.
import * as A from '../js/amboss-data.js?v=test';
import { makeAmbossData, makeAmbossPage } from './fixtures/amboss-page.mjs';
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };

const D = A.parseDashboard(makeAmbossPage());
ok(D && D.scores.length === 12 && D.questions.length === 36 && D.sets.length === 6 && D.built === '2026-11-01 09:30', 'reads the `const D = {...};` line of the page');
ok(A.parseDashboard('<html>nothing here</html>') === null && A.parseDashboard('const D = {broken;') === null && A.parseDashboard('const D = {"x":1};') === null, 'a page without usable data gives null');
const odd = A.normDashboard({ scores: [{ pct: 'x' }, { pct: 70, era: 'weird', systems: 'no' }], questions: [null, { status: 'Z', topic: 5 }] });
ok(odd.scores.length === 1 && odd.scores[0].era === 'legacy' && odd.scores[0].n_q === 20 && odd.scores[0].systems.length === 0 && odd.questions[0].status === '?' && odd.questions[0].topic === '5', 'odd values are cleaned up');

// pcts of the fixture: 80 70 75 65 85 70 60 75 80 70 85 90
const k = A.kpis(D, 'current');
ok(Math.abs(k.last3 - (70 + 85 + 90) / 3) < 1e-9, 'last 3 blocks: weighted average');
ok(Math.abs(k.delta - ((70 + 85 + 90) / 3 - (60 + 75 + 80) / 3)) < 1e-9, 'change against the 3 before');
ok(Math.abs(k.last10 - (75 + 65 + 85 + 70 + 60 + 75 + 80 + 70 + 85 + 90) / 10) < 1e-9 && k.blocks === 12 && k.questions === 240, 'last 10 blocks, blocks and questions done');
ok(k.lastBatch && k.lastBatch.set === 'S6' && k.reviewed === 18 && k.I === 12 && k.U === 6, 'latest batch with a stable %, reviewed in the current era (I and U)');
ok(A.kpis(D, 'all').reviewed === 36 && A.kpis(D, 'legacy').reviewed === 18, 'era scope');
ok(k.topErr && D.errors[k.topErr.key] === k.topErr.name && k.topErr.share > 0, 'top miss reason');
ok(A.blockAvg([{ pct: 50, n_q: 10 }, { pct: 100, n_q: 30 }]) === 87.5 && A.blockAvg([]) === null, 'averages weigh blocks by their questions');

const s = A.series(D);
ok(s.roll[0] === null && s.roll[1] === null && Math.abs(s.roll[2] - 75) < 1e-9 && s.legacy === 6, 'last-3 line starts at block 3; 6 legacy blocks');
ok(JSON.stringify(s.adds) === '{"0":["CVS"],"3":["Biostat"]}', 'systems added at blocks 1 and 4');

const f = A.focus(D, 'all');
ok(f.length === 7 && f[0].score >= f[6].score && f.every((o) => o.topic), 'focus: 7 topics, highest weight first');
ok(f.find((o) => o.topic === 'Fake topic alpha') && f[0].topic === 'Fake topic alpha' && f[0].I === 6, 'a topic missed in several sets is grouped');
const w = A.why(D, 'current');
ok(w.sets.join() === 'S4,S5,S6' && w.recent.n === 18 && Object.values(w.recent.by).reduce((a, b) => a + b, 0) === 18 && A.TIPS[w.top], 'why: last 3 review sets, a tip for the top reason');
const ht = A.heat(D, 'all');
ok(ht.sets.length === 6 && ht.rows.length && ht.rows[0].sel && ht.rows.every((r) => r.cells.length === 6) && ['more', 'fewer', 'steady'].includes(ht.rows[0].trend), 'heat: selected systems first, a trend per row');
ok(A.groups(D, 'all', 'subject').reduce((t, g) => t + g.n, 0) === 36, 'subject groups add up');
ok(A.sysEstimates(D).every((r) => r.seen >= 8) && A.sysEstimates(D)[0].acc <= A.sysEstimates(D).at(-1).acc, 'system estimates: seen 8+, weakest first');
ok(A.doneBatches(D).length === 3 && A.doneBatches(D)[0].set === 'S6', 'current batches, newest first');
ok(A.browse(D, 'all', { q: 'alpha' }).length === 6 && A.browse(D, 'current', { status: 'U' }).length === 6 && A.browse(D, 'all', { set: 'S1' })[0].id === 'S1-06', 'question search and filters, newest first');
ok(A.plain('a $10 / 20 = 50\\%$ b') === 'a 10 / 20 = 50% b', 'LaTeX bits shown as plain text');
ok(A.selected(D).join() === 'CVS,Pulm,Repro,Psych,Biostat' && A.selected(A.normDashboard(makeAmbossData({ blocks: 0 }))).join() === 'CVS,Biostat', 'selection: last block, else the timeline');
