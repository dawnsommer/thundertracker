// The built-in score conversions (js/score-models.js) against the expected values published with them.
import { SCORE_MODELS, modelById, runModel, scoreAtPct } from '../js/score-models.js';
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };

// [form, model, input, expected]: input is { wrong } or { pct }; expected is a display score, { exact } or 'error'
const CASES = [
  ['nbme-6', 'excel', { wrong: 19 }, { exact: 247.3595 }], ['nbme-7', 'excel', { wrong: 26 }, { exact: 244.7208 }], ['nbme-8', 'excel', { wrong: 26 }, { exact: 239.3174 }],
  ['nbme-6', 'excel', { wrong: 92 }, 'error'], ['nbme-7', 'excel', { wrong: 92 }, 'error'], ['nbme-8', 'excel', { wrong: 92 }, 'error'],
  ['nbme-9', 'nbmescore', { wrong: 49 }, 245], ['nbme-10', 'nbmescore', { wrong: 49 }, 246], ['nbme-11', 'nbmescore', { wrong: 49 }, 247],
  ['nbme-12', 'nbmescore', { wrong: 49 }, 247], ['nbme-13', 'nbmescore', { wrong: 49 }, 246], ['nbme-14', 'nbmescore', { wrong: 49 }, 246],
  ['nbme-15', 'reddit-linear', { wrong: 40 }, 256], ['nbme-15', 'reddit-curve', { wrong: 40 }, 256], ['nbme-15', 'nbmescore', { wrong: 40 }, 257],
  ['nbme-16', 'nbmecalc', { wrong: 50 }, 244], ['nbme-16', 'nbmecalc', { wrong: 47 }, 248], ['nbme-16', 'nbmecalc', { pct: 80 }, 257], ['nbme-16', 'nbmecalc', { pct: 95 }, 'error'],
  ['uwsa-1', 'nbmescore', { wrong: 40 }, 246], ['uwsa-1', 'nbmescore', { pct: 72 }, 240], ['uwsa-1', 'nbmescore', { pct: 40 }, 'error'], ['uwsa-1', 'nbmecalculator', { wrong: 40 }, 250],
  ['uwsa-2', 'nbmescore', { wrong: 40 }, 246], ['uwsa-2', 'nbmecalculator', { wrong: 40 }, 237], ['uwsa-2', 'nbmescore', { wrong: 160 }, 144],
  ['f120-2021', 'supplied', { pct: 78 }, 257],
];
for (const [id, mid, inp, want] of CASES) {
  const m = modelById(id, mid), qs = SCORE_MODELS[id].qs;
  const r = inp.wrong != null ? (m.type === 'wrong' ? runModel(m, inp.wrong, qs) : runModel(m, 100 * (qs - inp.wrong) / qs, qs)) : scoreAtPct(m, inp.pct, qs);
  const pass = want === 'error' ? !!r.error : typeof want === 'object' ? Math.abs(r.value - want.exact) <= 1e-5 : r.score === want;
  ok(pass, id + ' ' + mid + ' ' + JSON.stringify(inp) + ' → ' + (r.error ? 'no score (' + r.error + ')' : r.score + ' (' + +r.value.toFixed(4) + ')'));
}
// starting from % correct gives the same result as the count (80% of 200 = 40 wrong, despite float error)
ok(scoreAtPct(modelById('nbme-15', 'nbmescore'), 80, 200).score === 257, 'NBME 15 at 80% = 40 wrong → 257');
// no conversion where none is published
ok(['uwsa-3', 'f120-2019', 'f120-2023'].every((id) => !SCORE_MODELS[id]), 'UWSA 3, Free 120 (2019, 2023): no built-in');
// the Excel calculator is only used for the retired forms: 6 and 8 have 184 questions, 7 has 176
ok(Object.entries(SCORE_MODELS).every(([id, fm]) => fm.models.some((m) => m.id === 'excel') === ['nbme-6', 'nbme-7', 'nbme-8'].includes(id)), 'Excel formulas only for NBME 6–8');
ok(SCORE_MODELS['nbme-6'].qs === 184 && SCORE_MODELS['nbme-7'].qs === 176 && SCORE_MODELS['nbme-8'].qs === 184, 'NBME 6 and 8: 184 questions, NBME 7: 176');
ok(Object.entries(SCORE_MODELS).every(([id, fm]) => /^nbme-[678]$/.test(id) || fm.qs === { nbme: 200, uwsa: 160, f120: 120 }[id.split('-')[0]]), 'other forms: NBME 200, UWSA 160, Free 120 120');
ok(Object.values(SCORE_MODELS).every((fm) => fm.models.every((m) => m.id === 'excel' || m.id === 'supplied' || /^https:\/\//.test(m.url))), 'every other model links its published source');
