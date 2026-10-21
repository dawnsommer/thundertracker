// Built-in 3-digit score conversions, per form. All are unofficial: NBME and UWorld don't publish how
// raw scores map to reported scores. Sources (reviewed Oct 2026):
//   NBME 6–8    a legacy Excel calculator (score from questions wrong; nothing past 91 wrong). Forms 6 and 8
//               have 184 questions, Form 7 has 176
//   NBME 9–15   NBMEScore.com's published per-form regressions; NBME 15 also has the r/Step2 author's fits
//   NBME 16     NBMEcalc's chart, made for the equated % correct (EPC) on the NBME report
//   UWSA 1      NBMEScore.com's %→score anchors (50, 55 and 85% are the site's own extrapolations);
//               NBMECalculator.com's table, approximated as a line
//   UWSA 2      NBMEScore.com's clamp(280 − 0.85 × wrong, 140, 300); NBMECalculator.com's table (≈ 1.08 per wrong)
//   Free 120 (2021)  y = 1.165 × % + 166.17, a formula you supplied
// UWSA 3 and the other Free 120 releases have none. A model never extrapolates past its range.
//
// Types:  wrong   score = b + a × wrong (+ q × wrong²), wrong = questions × (1 − %/100)
//         pct     score = b + a × % (on the 0–100 scale)
//         chart   straight lines between [%, score] points, nothing outside them

const NBS = 'NBMEScore.com';
const nbs = (slug) => 'https://nbmescore.com/' + slug + '/';
const reg = (b, a, slug) => ({ id: 'nbmescore', src: NBS + ' regression', short: 'NBMEScore', type: 'wrong', b, a, url: nbs(slug) });
const EXCEL = 'Legacy Excel calculator';
const excel = (b, a) => ({ id: 'excel', src: EXCEL, short: 'Excel', type: 'wrong', b, a, maxWrong: 91, decimals: true,
  note: 'For the retired forms (176–184 questions); gives no score past 91 wrong.' });
const NBME16 = [[50, 181], [52, 186], [54, 191], [56, 196], [58, 201], [60, 206], [62, 211], [64, 216], [66, 221], [68, 226], [70, 231],
  [72, 236], [74, 241], [76, 246], [78, 252], [80, 257], [82, 262], [84, 267], [86, 272], [88, 277], [90, 282]];
const R15 = 'https://www.reddit.com/r/Step2/comments/1hzvyza/nbme_15_three_digit_score_calculator/';

// Keyed by form id. The first model is the default; `qs` is the form's question count.
export const SCORE_MODELS = {
  'nbme-6': { qs: 184, models: [excel(293.52, -2.4295)] },
  'nbme-7': { qs: 176, models: [excel(283.7, -1.4992)] },
  'nbme-8': { qs: 184, models: [excel(295.48, -2.1601)] },
  'nbme-9': { qs: 200, models: [reg(298.45, -1.09, 'nbme-9-score-calculator-step-2')] },
  'nbme-10': { qs: 200, models: [reg(300.18, -1.1, 'nbme-10-score-conversion')] },
  'nbme-11': { qs: 200, models: [reg(299.5, -1.08, 'nbme-11-score-conversion')] },
  'nbme-12': { qs: 200, models: [reg(300.18, -1.09, 'nbme-12-score-conversion')] },
  'nbme-13': { qs: 200, models: [reg(298.8, -1.07, 'nbme-13-step-2-ck-score-conversion')] },
  'nbme-14': { qs: 200, models: [reg(299.2, -1.08, 'nbme-14-step-2-ck-score-conversion')] },
  'nbme-15': { qs: 200, models: [
    reg(300.5, -1.1, 'nbme-15-step-2-ck-score-conversion'),
    { id: 'reddit-linear', src: 'r/Step2 fit (straight line)', short: 'r/Step2 line', type: 'wrong', b: 301.1223, a: -1.1387, url: R15,
      note: 'Fitted to self-reported scores between 64% and 87% correct.' },
    { id: 'reddit-curve', src: 'r/Step2 fit (curve)', short: 'r/Step2 curve', type: 'wrong', b: 288.7849, a: -0.5766, q: -0.0059, url: R15,
      note: 'Fitted to self-reported scores between 64% and 87% correct.' },
  ] },
  'nbme-16': { qs: 200, models: [
    { id: 'nbmecalc', src: 'NBMEcalc chart', short: 'NBMEcalc', type: 'chart', points: NBME16, url: 'https://nbmecalc.com/nbme-16-score-conversion',
      note: 'Made for the equated % correct (EPC) on your NBME report. With a % you counted yourself it’s only a rough guide.' },
  ] },
  'uwsa-1': { qs: 160, models: [
    { id: 'nbmescore', src: NBS + ' anchors', short: 'NBMEScore', type: 'chart', url: nbs('uwsa1-step-2-score-conversion'),
      points: [[50, 204], [55, 210], [60, 215], [65, 225], [70, 236], [75, 246], [80, 255], [85, 263]],
      note: 'Observed between 60% and 80%; the 50, 55 and 85% points are the site’s own extrapolations.' },
    { id: 'nbmecalculator', src: 'NBMECalculator.com table', short: 'NBMECalculator', type: 'wrong', b: 292, a: -1.05, clamp: [140, 300], url: 'https://nbmecalculator.com/step-2/uwsa-1/',
      note: 'A straight line that reproduces the site’s table.' },
  ] },
  'uwsa-2': { qs: 160, models: [
    { id: 'nbmescore', src: NBS + ' formula', short: 'NBMEScore', type: 'wrong', b: 280, a: -0.85, clamp: [140, 300], url: nbs('uwsa-2-score-conversion') },
    { id: 'nbmecalculator', src: 'NBMECalculator.com table', short: 'NBMECalculator', type: 'wrong', b: 280, a: -1.08, clamp: [140, 300], url: 'https://nbmecalculator.com/step-2/uwsa-2/',
      note: 'A straight line that reproduces the site’s table.' },
  ] },
  'f120-2021': { qs: 120, models: [
    { id: 'supplied', src: 'Supplied formula', short: 'Supplied', type: 'pct', b: 166.17, a: 1.165, note: 'Only for the 2021 release.' },
  ] },
};

export const modelsFor = (id) => (SCORE_MODELS[id] ? SCORE_MODELS[id].models : []);
export const modelById = (id, mid) => modelsFor(id).find((m) => m.id === mid) || null;

// Nearest whole score, rounding halves up the way a spreadsheet does (256.4999… from float error counts as 256.5).
export const roundScore = (v) => Math.round(Math.round(v * 1e6) / 1e6);

// Score from a model: { value, score } or { error: 'range' | 'none', range: [lo, hi] (in % correct) }.
// `x` is questions wrong for 'wrong' models and % correct otherwise; use scoreAtPct to start from %.
export function runModel(m, x, qs) {
  if (!m) return { error: 'none' };
  let v;
  if (m.type === 'wrong') {
    const max = m.maxWrong != null ? m.maxWrong : qs;
    if (!(x >= -1e-9 && x <= max + 1e-9)) return { error: 'range', range: [Math.round((qs - max) / qs * 1000) / 10, 100] };
    v = m.b + m.a * x + (m.q || 0) * x * x;
  } else if (m.type === 'pct') {
    if (!(x >= 0 && x <= 100)) return { error: 'range', range: [0, 100] };
    v = m.b + m.a * x;
  } else {
    const pts = m.points, lo = pts[0][0], hi = pts[pts.length - 1][0];
    if (!(x >= lo - 1e-9 && x <= hi + 1e-9)) return { error: 'range', range: [lo, hi] };
    const i = Math.max(1, pts.findIndex((p) => p[0] >= x - 1e-9));
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    v = y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  if (m.clamp) v = Math.min(m.clamp[1], Math.max(m.clamp[0], v));
  return { value: v, score: roundScore(v) };
}
export const wrongAt = (pct, qs) => qs * (1 - pct / 100);
export const scoreAtPct = (m, pct, qs) => runModel(m, m.type === 'wrong' ? wrongAt(pct, qs) : pct, qs);

const n = (x) => +x.toFixed(4);
export function describeModel(m) {
  if (m.type === 'chart') return 'chart of ' + m.points.length + ' points, ' + m.points[0][0] + '–' + m.points[m.points.length - 1][0] + '%';
  const sign = (x) => (x < 0 ? ' − ' : ' + ') + n(Math.abs(x));
  if (m.type === 'pct') return 'score = ' + n(m.a) + ' × %' + sign(m.b);
  return 'score = ' + n(m.b) + sign(m.a) + ' × wrong' + (m.q ? sign(m.q) + ' × wrong²' : '') + (m.clamp ? ', kept within ' + m.clamp.join('–') : '');
}
