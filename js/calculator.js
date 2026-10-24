// Estimated 3-digit scores from % correct, and the on-demand calculator on the Assessments tab.
// An estimate comes from, in order: a conversion you saved for that form; the form's built-in conversion
// (published, unofficial; see score-models.js; you pick which source, or none); one you saved for its
// exam type; or a straight line fitted to your own forms that have both a score and a % correct.
// A score you type in is never changed; the estimate is shown next to it.

import { $, avg, fmtPct, h, num } from './util.js?v=20';
import { GROUPS } from './catalog.js?v=20';
import { normConversion } from './model.js?v=20';
import { save, snapshot, state, toast, ui } from './store.js?v=20';
import { band, pctOf, scaledOf, taken, testForms } from './data.js?v=20';
import { render } from './shell.js?v=20';
import { describeModel, modelsFor, runModel, SCORE_MODELS, wrongAt } from './score-models.js?v=20';

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
// Your own conversions. Linear: a × % + b. Table: straight lines between points, continuing the end segments.
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
const userConv = (key) => { const c = state.conversions[key]; return c && c.kind !== 'builtin' ? c : null; };
const convWord = (c) => (c.kind === 'table' ? 'table' : 'formula');

// The built-in conversion form f uses: the source you picked, else the default; null if none (or you turned it off).
export function builtinModel(f) {
  const ms = f.id ? modelsFor(f.id) : [];
  if (!ms.length) return null;
  const c = state.conversions[f.id], pick = c && c.kind === 'builtin' ? c.model : '';
  if (pick === 'none') return null;
  return ms.find((m) => m.id === pick) || ms[0];
}
// One model at this result: wrong-count models use the exact number wrong when you entered one.
const runAt = (m, f, pct, wrong) => runModel(m, m.type === 'wrong' ? (wrong != null ? wrong : wrongAt(pct, f.qs)) : pct, f.qs);

// The estimate, plus `skipped` when the form's built-in source doesn't cover this result.
function estimate(f, pct, wrong) {
  const own = f.id && userConv(f.id);
  if (own) return { score: clampScore(convert(own, pct)), how: 'your ' + convWord(own) + ' for ' + f.full, key: 'own' };
  let skipped = null;
  const m = builtinModel(f);
  if (m) {
    const r = runAt(m, f, pct, wrong);
    if (!r.error) return { score: r.score, value: r.value, how: m.src + ' for ' + f.full, key: m.id, model: m };
    skipped = { model: m, range: r.range };
  }
  const exam = userConv(f.g.key);
  if (exam) return { score: clampScore(convert(exam, pct)), how: 'your ' + convWord(exam) + ' for ' + f.g.short, key: 'exam', skipped };
  // Free 120 has no 3-digit scores of its own, so it borrows the NBME fit
  for (const key of f.g.key === 'f120' ? ['f120', 'nbme'] : [f.g.key]) {
    const fit = personalFit(key);
    if (fit) return { score: clampScore(fit.a * pct + fit.b), how: 'a fit to your ' + fit.n + ' ' + groupOf(key).short + ' forms', key: 'fit', skipped, range: fit.sd != null ? Math.max(1, Math.round(fit.sd)) : null };
  }
  return skipped ? { score: null, skipped } : null;
}
// Best available estimate for form f at pct % correct, or null.
export function estimateScore(f, pct) {
  if (pct == null || f.kind !== 'test') return null;
  const e = estimate(f, pct, null);
  return e && e.score != null ? e : null;
}
export const estText = (e) => '≈' + e.score + (e.range ? ' ± ' + e.range : '');

// Use built-in source `mid` (or 'none') for form f. The default needs no entry; a saved conversion of your
// own for the form is replaced (you can undo).
function chooseSource(f, mid) {
  const undo = snapshot(), had = userConv(f.id), def = modelsFor(f.id)[0].id;
  if (mid === def) delete state.conversions[f.id]; else state.conversions[f.id] = { kind: 'builtin', model: mid };
  save(); render();
  const m = modelsFor(f.id).find((x) => x.id === mid);
  toast((m ? f.full + ' now uses ' + m.src : f.full + ': no built-in conversion') + (had ? ' — your own conversion was replaced' : ''), undo);
}

// ---------- calculator panel ----------
export function toggleCalculator(open) {
  ui.calcOpen = open == null ? !ui.calcOpen : open;
  $('calc-btn').setAttribute('aria-expanded', ui.calcOpen ? 'true' : 'false');
  const box = $('calc');
  box.hidden = !ui.calcOpen;
  if (ui.calcOpen) { buildCalculator(box); setTimeout(() => $('calc-pct').focus(), 0); } else box.replaceChildren();
}

const SCALE = [180, 290]; // the score bar's range
const MODES = [['pct', '% correct'], ['wrong', 'wrong'], ['correct', 'correct']];
const allForms = () => GROUPS.flatMap((g) => testForms(g, true));

function buildCalculator(box) {
  // form picker: "any form" per exam type, then each form
  const formSel = h('select', { id: 'calc-form', class: 'sel' }, GROUPS.map((g) => h('optgroup', { label: g.name },
    h('option', { value: g.key, text: 'Any ' + g.short + ' form' }), testForms(g, true).map((f) => h('option', { value: f.id, text: f.full + (SCORE_MODELS[f.id] ? '' : ' · no built-in') })))));
  const firstOpen = allForms().find((f) => f.g.scaled && !f.old && !taken(f));
  formSel.value = ui.calcForm || (firstOpen ? firstOpen.id : 'nbme');
  if (!formSel.value) formSel.value = 'nbme';
  let mode = ui.calcMode || 'pct';
  const numIn = h('input', { type: 'number', id: 'calc-pct', min: '0', step: 'any', inputmode: 'decimal', 'aria-label': 'Result' });
  const modeSeg = h('div', { class: 'seg mode', id: 'calc-mode', role: 'group', 'aria-label': 'Enter as' });
  const res = h('div', { class: 'calc-out', 'aria-live': 'polite' });
  const srcBox = h('div', { class: 'calc-src', id: 'calc-sources' });
  const fits = h('div', { class: 'calc-fits' });
  const convBox = h('div', { class: 'calc-convs' });

  const form = () => {
    const v = formSel.value, g = groupOf(v);
    return g ? { kind: 'test', id: '', g, full: g.short, qs: g.qs } : allForms().find((f) => f.id === v);
  };
  // the entered result as % correct, plus the exact number wrong when you entered a count
  const read = () => {
    const f = form(), v = num(numIn.value);
    if (v == null) return null;
    if (mode === 'pct') return v >= 0 && v <= 100 ? { pct: v, wrong: null } : { bad: 'Enter a % between 0 and 100.' };
    if (!(Number.isInteger(v) && v >= 0 && v <= f.qs)) return { bad: 'Enter a whole number from 0 to ' + f.qs + '.' };
    const wrong = mode === 'wrong' ? v : f.qs - v;
    return { pct: (f.qs - wrong) / f.qs * 100, wrong };
  };
  const drawMode = () => {
    modeSeg.replaceChildren(...MODES.map(([k, l]) => h('button', { 'aria-pressed': mode === k ? 'true' : 'false', 'data-mode': k, onclick: () => {
      const before = read();
      mode = k; ui.calcMode = k;
      // keep the same result when switching how it's entered
      if (before && before.pct != null) {
        const f = form(), w = before.wrong != null ? before.wrong : wrongAt(before.pct, f.qs);
        numIn.value = k === 'pct' ? String(Math.round(before.pct * 10) / 10) : String(Math.round(k === 'wrong' ? w : f.qs - w));
      }
      drawMode(); draw(); numIn.focus();
    } }, l)));
    numIn.placeholder = mode === 'pct' ? 'e.g. 74' : mode === 'wrong' ? 'e.g. 52' : 'e.g. 148';
    numIn.max = mode === 'pct' ? '100' : String(form().qs);
  };

  const scale = (score) => {
    const at = (v) => Math.max(0, Math.min(100, (v - SCALE[0]) / (SCALE[1] - SCALE[0]) * 100)) + '%';
    const tgt = num(state.prefs.target);
    return h('div', { class: 'calc-scale', 'aria-hidden': 'true' },
      h('div', { class: 'track' }, h('b', { class: band('score', score), style: 'width:' + at(score) })),
      h('i', { class: 'tick pass', style: 'left:' + at(218) }, h('span', { text: 'pass 218' })),
      tgt ? h('i', { class: 'tick tgt', style: 'left:' + at(tgt) }, h('span', { text: 'target ' + tgt })) : null);
  };

  const draw = () => {
    const f = form(), r = read();
    ui.calcForm = formSel.value;
    drawSources(f, r);
    if (!r) { res.replaceChildren(h('p', { class: 'calc-empty', text: 'Enter your result to estimate a 3-digit score.' })); return; }
    if (r.bad) { res.replaceChildren(h('p', { class: 'calc-empty', text: r.bad })); return; }
    const e = estimate(f, r.pct, r.wrong);
    const w = r.wrong != null ? r.wrong : wrongAt(r.pct, f.qs), whole = Math.abs(w - Math.round(w)) < 1e-6; // 80% of 200 → 39.999…
    const facts = (Math.round(r.pct * 10) / 10) + '% · ' + (whole ? '' : '≈') + Math.round(w) + ' wrong of ' + f.qs;
    const skip = e && e.skipped ? e.skipped.model.src + ' only covers ' + e.skipped.range[0] + '–' + e.skipped.range[1] + '% correct' : '';
    if (!e || e.score == null) {
      res.replaceChildren(h('div', { class: 'calc-line' }, h('div', { class: 'calc-score none' }, h('b', { text: '—' })), h('span', { class: 'calc-facts', text: facts })),
        h('p', { class: 'calc-how', text: skip ? skip + ' — no estimate here.'
          : (f.id ? 'No published conversion for ' + f.full + '. ' : 'Pick a form to use its published conversion. ') + 'Add your own under “Your conversions”, or log 3 ' + f.g.short + ' forms with a score and % for a fit to your own.' }));
      return;
    }
    const real = f.id ? scaledOf(f) : null;
    res.replaceChildren(
      h('div', { class: 'calc-line' },
        h('div', { class: 'calc-score' }, h('b', { class: band('score', e.score), text: '≈ ' + e.score }), e.range ? h('small', { text: '± ' + e.range }) : ''),
        scale(e.score),
        h('span', { class: 'calc-facts', text: facts })),
      h('p', { class: 'calc-how' }, 'From ' + e.how + (e.model && e.model.decimals ? ' (' + e.value.toFixed(2) + ')' : '') + '.',
        skip ? ' ' + skip + ', so it isn’t used here.' : '', e.model && e.model.note ? h('span', { class: 'calc-note', text: ' ' + e.model.note }) : '',
        real != null ? ' Your logged score: ' + real + (pctOf(f) != null ? ' at ' + fmtPct(pctOf(f)) : '') + '.' : ''));
  };

  // every source for the chosen form, side by side; tap one to use it
  const drawSources = (f, r) => {
    const ms = f.id ? modelsFor(f.id) : [];
    if (!ms.length) { srcBox.replaceChildren(); srcBox.hidden = true; return; }
    srcBox.hidden = false;
    const ok = r && r.pct != null, own = userConv(f.id), inUse = own ? 'own' : (builtinModel(f) || { id: 'none' }).id;
    const scores = [];
    // a pill per source: name and score; the formula is in its tooltip, the link opens the source
    const row = (id, name, tip, val, url) => h('label', { class: 'src-row' + (inUse === id ? ' on' : ''), title: tip },
      h('input', { type: 'radio', name: 'calc-src', value: id, checked: inUse === id, onchange: () => { if (id !== 'own') { chooseSource(f, id); draw(); drawConvs(); } } }),
      h('span', { class: 'src-nm', text: name }), h('span', { class: 'src-sc', text: val }),
      url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'src-link', 'aria-label': 'Source: ' + name }, '↗') : '');
    const rows = ms.map((m) => {
      const x = ok ? runAt(m, f, r.pct, r.wrong) : null;
      if (x && !x.error) scores.push(x.score);
      return row(m.id, m.short, m.src + ': ' + describeModel(m), !x ? '' : x.error ? x.range[0] + '–' + x.range[1] + '%' : String(x.score), m.url);
    });
    if (own) {
      const v = ok ? clampScore(convert(own, r.pct)) : null;
      if (v != null) scores.push(v);
      rows.unshift(row('own', 'Your ' + convWord(own), describeConv(own) + (own.note ? ' · ' + own.note : ''), v != null ? String(v) : ''));
    }
    rows.push(row('none', 'None', 'Don’t use a built-in conversion: use your exam-wide conversion or your own fit', ''));
    const gap = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0;
    srcBox.replaceChildren(h('span', { class: 'src-h', text: 'Source' }),
      h('div', { class: 'src-list', role: 'radiogroup', 'aria-label': 'Conversion for ' + f.full }, rows),
      gap >= 10 ? h('p', { class: 'calc-warn', text: 'Sources differ by ' + gap + ' points — disagreement, not a confidence range.' }) : '');
  };

  const drawFits = () => fits.replaceChildren(...GROUPS.filter((g) => g.scaled).map((g) => {
    const fit = personalFit(g.key), n = ownPoints(g.key).length;
    return h('p', { class: 'hint' }, h('b', { text: g.short + ': ' }), fit
      ? 'score ≈ ' + fit.a.toFixed(2) + ' × % ' + (fit.b < 0 ? '− ' : '+ ') + Math.abs(fit.b).toFixed(0) + ' from ' + fit.n + ' forms' + (fit.sd != null ? ' (typical miss ±' + Math.max(1, Math.round(fit.sd)) + ')' : '')
      : n + ' form' + (n === 1 ? '' : 's') + ' with both score and % — 3 needed (with a few % points between them) for your own fit.');
  }));
  const drawConvs = () => {
    const entries = Object.entries(state.conversions).filter(([, c]) => c.kind !== 'builtin').sort(([a], [b]) => a.localeCompare(b));
    const nameOf = (key) => { const g = groupOf(key); if (g) return g.name + ' (all forms)'; const f = allForms().find((x) => x.id === key); return f ? f.full : key; };
    convBox.replaceChildren(
      h('div', { class: 'calc-sub' }, h('h4', { text: 'Your conversions' }), h('button', { class: 'linkish', id: 'calc-add', onclick: () => editConv(null) }, '+ Add')),
      entries.length ? h('div', { class: 'rows' }, entries.map(([key, c]) => h('div', { class: 'conv-row' },
        h('div', null, h('b', { text: nameOf(key) }), h('small', { text: describeConv(c) + (c.note ? ' · ' + c.note : '') })),
        h('button', { class: 'linkish', onclick: () => editConv(key) }, 'Edit'),
        h('button', { class: 'linkish', onclick: () => {
          const undo = snapshot();
          delete state.conversions[key]; save(); drawConvs(); draw(); render();
          toast('Conversion removed', undo);
        } }, 'Remove'))))
        : h('p', { class: 'hint', text: 'None. A formula or table you add for one form is used instead of its built-in conversion; one for a whole exam type covers forms without one (like UWSA 3).' }),
      editor);
  };

  // conversion editor (inline)
  const editor = h('div', { class: 'conv-edit', hidden: true });
  function editConv(key) {
    const cur = key ? state.conversions[key] : null;
    const target = h('select', { id: 'conv-target', class: 'sel' },
      GROUPS.map((g) => h('option', { value: g.key, text: g.name + ' — all forms' })),
      allForms().map((f) => h('option', { value: f.id, text: f.full + ' only' })));
    target.value = key || (form().id || form().g.key);
    const kind = h('div', { class: 'seg mode', role: 'group', 'aria-label': 'Conversion type' });
    let k = cur ? cur.kind : 'linear';
    const aIn = h('input', { type: 'number', id: 'conv-a', step: 'any', placeholder: 'e.g. 1.7', value: cur && cur.kind === 'linear' ? String(cur.a) : '' });
    const bIn = h('input', { type: 'number', id: 'conv-b', step: 'any', placeholder: 'e.g. 120', value: cur && cur.kind === 'linear' ? String(cur.b) : '' });
    const table = h('textarea', { id: 'conv-table', rows: '5', placeholder: 'One “% correct, score” per line, e.g.\n60, 228\n70, 245\n80, 262' });
    table.value = cur && cur.kind === 'table' ? cur.points.map((p) => p[0] + ', ' + p[1]).join('\n') : '';
    const note = h('input', { type: 'text', id: 'conv-note', maxlength: '200', placeholder: 'Source (optional)', value: cur ? cur.note : '' });
    const preview = h('p', { class: 'hint' }), err = h('p', { class: 'err-line', role: 'alert' });
    const readConv = () => {
      if (k === 'linear') return normConversion({ kind: 'linear', a: aIn.value, b: bIn.value, note: note.value });
      const points = table.value.split('\n').map((l) => l.split(/[,;\t ]+/).filter(Boolean).map((x) => x.replace('%', ''))).filter((p) => p.length >= 2).map((p) => [p[0], p[1]]);
      return normConversion({ kind: 'table', points, note: note.value });
    };
    const drawPreview = () => {
      const c = readConv();
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
    more.open = true;
    editor.replaceChildren(
      h('div', { class: 'two' }, h('div', { class: 'field' }, h('label', { for: 'conv-target', text: 'Use for' }), target), h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Type' }), kind)),
      fieldsBox,
      h('div', { class: 'field' }, h('label', { for: 'conv-note', text: 'Source' }), note),
      preview, err,
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn primary', id: 'conv-save', onclick: () => {
          const c = readConv();
          if (!c) { err.textContent = k === 'linear' ? 'Enter both numbers, a and b.' : 'Enter at least two lines of “% correct, score”.'; return; }
          const undo = snapshot();
          if (key && key !== target.value) delete state.conversions[key];
          state.conversions[target.value] = c;
          save(); editor.hidden = true; editor.replaceChildren(); drawConvs(); draw(); render();
          toast('Conversion saved', undo);
        } }, 'Save conversion'),
        h('button', { class: 'btn ghost', onclick: () => { editor.hidden = true; editor.replaceChildren(); } }, 'Cancel')));
    drawKind();
    setTimeout(() => (k === 'linear' ? aIn : table).focus(), 0);
  }

  // where the built-in numbers come from
  const about = h('details', { class: 'calc-more', id: 'calc-about' }, h('summary', { text: 'About the sources' }),
    h('p', { class: 'hint', text: 'NBME and UWorld don’t publish how raw scores become 3-digit scores. These are third-party estimates — your real score report always wins. Nothing is extrapolated past a source’s range.' }),
    h('div', { class: 'about-list' }, Object.entries(SCORE_MODELS).map(([id, fm]) => {
      const f = allForms().find((x) => x.id === id);
      return h('div', { class: 'about-row' }, h('b', { text: (f ? f.full : id) + ' · ' + fm.qs + ' Qs' }), h('div', null, fm.models.map((m, i) => h('p', null,
        m.url ? h('a', { href: m.url, target: '_blank', rel: 'noopener noreferrer', text: m.src }) : m.src, i === 0 && fm.models.length > 1 ? ' (default)' : '', ' — ', h('code', { text: describeModel(m) }), m.note ? ' ' + m.note : ''))));
    })),
    h('p', { class: 'hint', text: 'No published conversion: UWSA 3, Free 120 (2019 and 2021). Step 2 CK passing score: 218 (since July 2025) — an estimate above it isn’t a pass prediction.' }));
  const more = h('details', { class: 'calc-more', id: 'calc-more' }, h('summary', { text: 'Your conversions & fit' }),
    h('div', { class: 'calc-cols' }, convBox, h('div', null, h('div', { class: 'calc-sub' }, h('h4', { text: 'Fit to your own forms' })), fits)));

  formSel.addEventListener('change', () => {
    const f = form();
    if (f.id && pctOf(f) != null && numIn.value === '') { mode = 'pct'; ui.calcMode = 'pct'; numIn.value = String(pctOf(f)); }
    drawMode(); draw();
  });
  numIn.addEventListener('input', draw);
  drawMode();
  formSel.setAttribute('aria-label', 'Form');
  box.replaceChildren(h('div', { class: 'card calc' },
    h('div', { class: 'calc-top' },
      h('h3', { text: 'Score calculator' }), formSel, h('div', { class: 'calc-num' }, numIn, modeSeg),
      h('button', { class: 'x', 'aria-label': 'Close calculator', onclick: () => toggleCalculator(false) }, '×')),
    res, srcBox, h('div', { class: 'calc-foot' }, more, about)));
  drawFits(); drawConvs(); draw();
}
