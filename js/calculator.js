// Estimated 3-digit scores from % correct, and the on-demand calculator on the Assessments tab.
// No conversion is built in. An estimate comes from, in order: a conversion you saved for that form,
// one you saved for its exam type (a formula "score = a × % + b" or a table you paste, e.g. from Reddit),
// or a straight line fitted to your own forms that have both a score and a % correct.
// A score you type in is never changed; the estimate is shown next to it.

import { $, avg, fmtPct, h, num } from './util.js?v=10';
import { GROUPS } from './catalog.js?v=10';
import { normConversion } from './model.js?v=10';
import { save, snapshot, state, toast, ui } from './store.js?v=10';
import { allTests, band, pctOf, scaledOf, testForms } from './data.js?v=10';
import { render } from './shell.js?v=10';

export function fitLine(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = avg(points.map((p) => p[0])), my = avg(points.map((p) => p[1]));
  let sxx = 0, sxy = 0, syy = 0;
  points.forEach(([x, y]) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; });
  if (sxx === 0) return null;
  const a = sxy / sxx, b = my - a * mx;
  const resid = points.reduce((t, [x, y]) => t + (y - (a * x + b)) ** 2, 0);
  return { a, b, n, sd: n > 2 ? Math.sqrt(resid / (n - 2)) : null, r: syy ? sxy / Math.sqrt(sxx * syy) : 1, spread: Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0])) };
}
// Linear: a × % + b. Table: straight lines between points, continuing the end segments past the table.
export function convert(conv, pct) {
  if (conv.kind === 'linear') return conv.a * pct + conv.b;
  const pts = conv.points;
  let i = pts.findIndex((p) => p[0] >= pct);
  if (i === 0 && pts[0][0] === pct) return pts[0][1];
  if (i < 0) i = pts.length - 1; else if (i === 0) i = 1;
  const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
  return y0 + (y1 - y0) * (pct - x0) / (x1 - x0);
}
const clampScore = (v) => Math.max(1, Math.min(300, Math.round(v)));
// Your own forms in one exam type that have both a 3-digit score and % correct.
export function ownPoints(gkey) {
  return testForms(GROUPS.find((g) => g.key === gkey), true).map((f) => [pctOf(f), scaledOf(f)]).filter(([p, s]) => p != null && s != null);
}
export function personalFit(gkey) {
  const fit = fitLine(ownPoints(gkey));
  return fit && fit.n >= 3 && fit.spread >= 3 ? fit : null;
}
export const describeConv = (c) => (c.kind === 'linear' ? 'score = ' + +c.a.toFixed(3) + ' × % ' + (c.b < 0 ? '− ' : '+ ') + +Math.abs(c.b).toFixed(1) : 'table of ' + c.points.length + ' points');
const groupOf = (key) => GROUPS.find((g) => g.key === key);

// Best available estimate for form f at pct % correct, or null.
export function estimateScore(f, pct) {
  if (pct == null || f.kind !== 'test') return null;
  const own = state.conversions[f.id];
  if (own) return { score: clampScore(convert(own, pct)), how: 'your ' + (own.kind === 'table' ? 'table' : 'formula') + ' for ' + f.full };
  const exam = state.conversions[f.g.key];
  if (exam) return { score: clampScore(convert(exam, pct)), how: 'your ' + (exam.kind === 'table' ? 'table' : 'formula') + ' for ' + f.g.short };
  // Free 120 has no 3-digit scores of its own, so it borrows the NBME fit
  for (const key of f.g.key === 'f120' ? ['f120', 'nbme'] : [f.g.key]) {
    const fit = personalFit(key);
    if (fit) return { score: clampScore(fit.a * pct + fit.b), how: 'a fit to your ' + fit.n + ' ' + groupOf(key).short + ' forms', range: fit.sd != null ? Math.max(1, Math.round(fit.sd)) : null };
  }
  return null;
}
export const estText = (e) => '≈' + e.score + (e.range ? ' ± ' + e.range : '');

// ---------- calculator panel ----------
export function toggleCalculator(open) {
  ui.calcOpen = open == null ? !ui.calcOpen : open;
  $('calc-btn').setAttribute('aria-expanded', ui.calcOpen ? 'true' : 'false');
  const box = $('calc');
  box.hidden = !ui.calcOpen;
  if (ui.calcOpen) { buildCalculator(box); setTimeout(() => $('calc-pct').focus(), 0); } else box.replaceChildren();
}

function buildCalculator(box) {
  const examSel = h('select', { id: 'calc-exam', class: 'sel' }, GROUPS.map((g) => h('option', { value: g.key, text: g.name })));
  const formSel = h('select', { id: 'calc-form', class: 'sel', 'aria-label': 'Form' });
  const pctIn = h('input', { type: 'number', id: 'calc-pct', min: '0', max: '100', step: 'any', inputmode: 'decimal', placeholder: 'e.g. 72' });
  const corIn = h('input', { type: 'number', id: 'calc-correct', min: '0', step: '1', inputmode: 'numeric', placeholder: 'correct', 'aria-label': 'Questions correct' });
  const totIn = h('input', { type: 'number', id: 'calc-total', min: '1', step: '1', inputmode: 'numeric', placeholder: 'of', 'aria-label': 'Out of' });
  const out = h('div', { class: 'calc-out', 'aria-live': 'polite' });
  const fits = h('div', { class: 'calc-fits' });
  const convBox = h('div', { class: 'calc-convs' });

  const drawForms = () => {
    const g = groupOf(examSel.value);
    formSel.replaceChildren(h('option', { value: '', text: 'Any ' + g.short + ' form' }), ...testForms(g, true).map((f) => h('option', { value: f.id, text: f.full })));
    totIn.placeholder = 'of ' + g.qs;
  };
  const pctNow = () => {
    const c = num(corIn.value), t = num(totIn.value) || groupOf(examSel.value).qs;
    if (c != null && document.activeElement !== pctIn && (corIn.value !== '' )) return t ? c / t * 100 : null;
    return num(pctIn.value);
  };
  const drawOut = () => {
    const g = groupOf(examSel.value), p = pctNow();
    const f = formSel.value ? testForms(g, true).find((x) => x.id === formSel.value) : { kind: 'test', id: '', g, full: g.short };
    if (p == null || p < 0 || p > 100) { out.replaceChildren(h('p', { class: 'muted', text: 'Enter % correct (or questions correct) to estimate a 3-digit score.' })); return; }
    const e = estimateScore(f, p);
    if (!e) {
      out.replaceChildren(h('p', { class: 'muted', text: fmtPct(p) + ' correct — no estimate yet. Add a conversion below (a formula or table you trust), or log 3 ' + g.short + ' forms with both a 3-digit score and % correct so the app can fit your own.' }));
      return;
    }
    const kids = [h('div', { class: 'calc-big' }, h('span', { class: band('score', e.score), text: '≈ ' + e.score }), e.range ? h('small', { text: '± ' + e.range }) : null),
      h('p', { class: 'hint', text: 'At ' + (Math.round(p * 10) / 10) + '% correct, from ' + e.how + '.' })];
    const real = f.id ? scaledOf(f) : null;
    if (real != null) kids.push(h('p', { class: 'hint', text: 'You logged ' + real + ' for ' + f.full + (pctOf(f) != null ? ' at ' + fmtPct(pctOf(f)) : '') + '.' }));
    out.replaceChildren(...kids);
  };
  const drawFits = () => fits.replaceChildren(...GROUPS.filter((g) => g.scaled).map((g) => {
    const fit = personalFit(g.key), n = ownPoints(g.key).length;
    return h('p', { class: 'hint' }, h('b', { text: g.short + ': ' }), fit
      ? 'score ≈ ' + fit.a.toFixed(2) + ' × % ' + (fit.b < 0 ? '− ' : '+ ') + Math.abs(fit.b).toFixed(0) + ' from ' + fit.n + ' forms' + (fit.sd != null ? ' (typical miss ±' + Math.max(1, Math.round(fit.sd)) + ')' : '')
      : n + ' form' + (n === 1 ? '' : 's') + ' with both score and % — 3 needed (with a few % points between them) for your own fit.');
  }));
  const drawConvs = () => {
    const entries = Object.entries(state.conversions).sort(([a], [b]) => a.localeCompare(b));
    const nameOf = (key) => { const g = groupOf(key); if (g) return g.name + ' (all forms)'; const f = allTests().find((x) => x.id === key) || GROUPS.flatMap((x) => testForms(x, true)).find((x) => x.id === key); return f ? f.full : key; };
    convBox.replaceChildren(
      h('div', { class: 'calc-h' }, h('h4', { text: 'Your conversions' }), h('button', { class: 'linkish', id: 'calc-add', onclick: () => editConv(null) }, '+ Add a conversion')),
      entries.length ? h('div', { class: 'rows' }, entries.map(([key, c]) => h('div', { class: 'conv-row' },
        h('div', null, h('b', { text: nameOf(key) }), h('small', { text: describeConv(c) + (c.note ? ' · ' + c.note : '') })),
        h('button', { class: 'linkish', onclick: () => editConv(key) }, 'Edit'),
        h('button', { class: 'linkish', onclick: () => {
          const undo = snapshot();
          delete state.conversions[key]; save(); drawConvs(); drawOut(); render();
          toast('Conversion removed', undo);
        } }, 'Remove'))))
        : h('p', { class: 'hint', text: 'None yet. Paste a formula or table you trust (for example from a Reddit conversion post) for a whole exam type or one form; it’s used instead of the fit to your own forms.' }),
      editor);
  };

  // conversion editor (inline)
  const editor = h('div', { class: 'conv-edit', hidden: true });
  function editConv(key) {
    const cur = key ? state.conversions[key] : null;
    const target = h('select', { id: 'conv-target', class: 'sel' },
      GROUPS.map((g) => h('option', { value: g.key, text: g.name + ' — all forms' })),
      GROUPS.flatMap((g) => testForms(g, true)).map((f) => h('option', { value: f.id, text: f.full + ' only' })));
    target.value = key || examSel.value;
    const kind = h('div', { class: 'seg mode', role: 'group', 'aria-label': 'Conversion type' });
    let k = cur ? cur.kind : 'linear';
    const aIn = h('input', { type: 'number', id: 'conv-a', step: 'any', placeholder: 'e.g. 1.7', value: cur && cur.kind === 'linear' ? String(cur.a) : '' });
    const bIn = h('input', { type: 'number', id: 'conv-b', step: 'any', placeholder: 'e.g. 120', value: cur && cur.kind === 'linear' ? String(cur.b) : '' });
    const table = h('textarea', { id: 'conv-table', rows: '6', placeholder: 'One “% correct, score” per line, e.g.\n60, 228\n70, 245\n80, 262' });
    table.value = cur && cur.kind === 'table' ? cur.points.map((p) => p[0] + ', ' + p[1]).join('\n') : '';
    const note = h('input', { type: 'text', id: 'conv-note', maxlength: '200', placeholder: 'Source, e.g. r/Step2 conversion post (optional)', value: cur ? cur.note : '' });
    const preview = h('p', { class: 'hint' }), err = h('p', { class: 'err-line', role: 'alert' });
    const read = () => {
      if (k === 'linear') return normConversion({ kind: 'linear', a: aIn.value, b: bIn.value, note: note.value });
      const points = table.value.split('\n').map((l) => l.split(/[,;\t ]+/).filter(Boolean).map((x) => x.replace('%', ''))).filter((p) => p.length >= 2).map((p) => [p[0], p[1]]);
      return normConversion({ kind: 'table', points, note: note.value });
    };
    const drawPreview = () => {
      const c = read();
      err.textContent = '';
      preview.textContent = c ? describeConv(c) + ' · at 60% → ' + clampScore(convert(c, 60)) + ', 70% → ' + clampScore(convert(c, 70)) + ', 80% → ' + clampScore(convert(c, 80)) : '';
    };
    const drawKind = () => {
      kind.replaceChildren(...[['linear', 'Formula'], ['table', 'Table']].map(([v, l]) => h('button', { 'aria-pressed': k === v ? 'true' : 'false', onclick: () => { k = v; drawKind(); } }, l)));
      fieldsBox.replaceChildren(...(k === 'linear'
        ? [h('div', { class: 'two' }, h('div', { class: 'field' }, h('label', { for: 'conv-a', text: 'a (points per 1%)' }), aIn), h('div', { class: 'field' }, h('label', { for: 'conv-b', text: 'b (constant)' }), bIn)),
          h('p', { class: 'hint', text: 'score = a × % correct + b' })]
        : [h('div', { class: 'field' }, h('label', { for: 'conv-table', text: 'Table' }), table), h('p', { class: 'hint', text: 'Scores between rows are interpolated.' })]));
      drawPreview();
    };
    const fieldsBox = h('div');
    [aIn, bIn, table, note].forEach((x) => x.addEventListener('input', drawPreview));
    editor.hidden = false;
    editor.replaceChildren(
      h('div', { class: 'two' }, h('div', { class: 'field' }, h('label', { for: 'conv-target', text: 'Use for' }), target), h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Type' }), kind)),
      fieldsBox,
      h('div', { class: 'field' }, h('label', { for: 'conv-note', text: 'Source' }), note),
      preview, err,
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn primary', id: 'conv-save', onclick: () => {
          const c = read();
          if (!c) { err.textContent = k === 'linear' ? 'Enter both numbers, a and b.' : 'Enter at least two lines of “% correct, score”.'; return; }
          const undo = snapshot();
          if (key && key !== target.value) delete state.conversions[key];
          state.conversions[target.value] = c;
          save(); editor.hidden = true; editor.replaceChildren(); drawConvs(); drawOut(); render();
          toast('Conversion saved', undo);
        } }, 'Save conversion'),
        h('button', { class: 'btn ghost', onclick: () => { editor.hidden = true; editor.replaceChildren(); } }, 'Cancel')));
    drawKind();
    setTimeout(() => (k === 'linear' ? aIn : table).focus(), 0);
  }

  examSel.addEventListener('change', () => { drawForms(); drawOut(); });
  formSel.addEventListener('change', () => {
    const f = formSel.value && testForms(groupOf(examSel.value), true).find((x) => x.id === formSel.value);
    if (f && pctOf(f) != null && pctIn.value === '' && corIn.value === '') pctIn.value = String(pctOf(f));
    drawOut();
  });
  pctIn.addEventListener('input', () => { corIn.value = ''; drawOut(); });
  [corIn, totIn].forEach((x) => x.addEventListener('input', () => {
    const c = num(corIn.value), t = num(totIn.value) || groupOf(examSel.value).qs;
    if (c != null && t) pctIn.value = String(Math.round(c / t * 1000) / 10);
    drawOut();
  }));
  drawForms();
  box.replaceChildren(h('div', { class: 'card calc' },
    h('div', { class: 'calc-h' }, h('h3', { text: 'Score calculator' }), h('button', { class: 'x', 'aria-label': 'Close calculator', onclick: () => toggleCalculator(false) }, '×')),
    h('div', { class: 'calc-in' },
      h('div', { class: 'field' }, h('label', { for: 'calc-exam', text: 'Exam' }), examSel),
      h('div', { class: 'field' }, h('label', { for: 'calc-form', text: 'Form' }), formSel),
      h('div', { class: 'field' }, h('label', { for: 'calc-pct', text: '% correct' }), pctIn),
      h('div', { class: 'field' }, h('span', { class: 'lab', text: 'or questions correct' }), h('div', { class: 'calc-frac' }, corIn, h('span', { text: '/' }), totIn))),
    out, h('div', { class: 'calc-cols' }, h('div', null, h('h4', { text: 'Fit to your own forms' }), fits), convBox),
    h('p', { class: 'hint', text: 'Estimates are approximate. Official NBME and UWorld reports use their own scaling, so a score you type in always stays as you entered it.' })));
  drawFits(); drawConvs(); drawOut();
}
