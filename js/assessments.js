// The Assessments tab (NBME, UWSA, Free 120) and the assessment editor.

import { $, avg, daysUntil, fmtDate, fmtPct, h, isDate, nn, num, today } from './util.js?v=18';
import { FORM_ST, GROUPS } from './catalog.js?v=18';
import { item, save, snapshot, state, toast, ui } from './store.js?v=18';
import { addForm, band, pctOf, scaledOf, taken, testForms, toggleRemove, weakNames } from './data.js?v=18';
import { closeSheet, numField, openSheet, sheetHead, weakPicker } from './sheets.js?v=18';
import { render } from './shell.js?v=18';
import { statusPill } from './overview.js?v=18';
import { estimateScore, estText, toggleCalculator } from './calculator.js?v=18';
import { modelsFor } from './score-models.js?v=18';

export function renderTests() {
  const eb = $('edit-tests');
  eb.setAttribute('aria-pressed', ui.editTests ? 'true' : 'false');
  eb.textContent = ui.editTests ? 'Done editing' : 'Edit list';
  const bar = ui.editTests ? h('div', { class: 'editbar' },
    h('span', { text: 'Remove the forms you won’t take; ↺ brings one back. Scores are kept.' }),
    h('button', { class: 'btn primary', onclick: () => { ui.editTests = false; render(); } }, 'Done')) : null;
  $('tests').replaceChildren(...[bar].filter(Boolean), ...GROUPS.map((g) => {
    const all = testForms(g, true), forms = all.filter((f) => !f.removed);
    const nHidden = all.length - forms.length;
    const done = forms.filter(taken).length;
    const a3 = avg(forms.map(scaledOf).filter(nn)), ap = avg(forms.map(pctOf).filter(nn));
    // edit mode: every form, removed ones greyed out with ↺
    const editRow = (f) => {
      const it = item(f.id), s3 = scaledOf(f), p = pctOf(f);
      return h('div', { class: 'row editing' + (f.removed ? ' removed' : ''), 'data-edit': f.id },
        h('span', { class: 'nm' }, f.label, f.old ? h('span', { class: 'old', text: 'older' }) : null),
        h('span', { class: 'st-txt', text: f.removed ? 'Removed' + (it.status > 0 ? ' · your scores are kept' : '') : FORM_ST[it.status] + (s3 != null ? ' · ' + s3 : p != null ? ' · ' + fmtPct(p) : '') }),
        h('button', { class: 'rm-btn' + (f.removed ? ' back' : ''), 'aria-label': (f.removed ? 'Restore ' : 'Remove ') + f.full, onclick: () => {
          const undo = snapshot();
          toggleRemove(f);
          toast(f.full + (f.removed ? ' is back' : ' removed'), undo);
        } }, f.removed ? '↺ Restore' : '× Remove'));
    };
    const rows = ui.editTests ? all.map(editRow) : forms.map((f) => {
      const it = item(f.id), s3 = scaledOf(f), p = pctOf(f);
      const main = g.scaled ? s3 : p;
      // no 3-digit score yet: show an estimate from % correct, if one is available
      const est = s3 == null && p != null ? estimateScore(f, p) : null;
      const planned = !taken(f) && it.plan, overdue = planned && daysUntil(it.plan) < 0;
      return h('button', { class: 'row', 'data-open': f.id, onclick: () => openForm(f),
        'aria-label': f.full + ', ' + FORM_ST[it.status] + (s3 != null ? ', score ' + s3 : '') + (p != null ? ', ' + fmtPct(p) + ' correct' : '') },
        h('span', { class: 'nm' }, f.label, f.old ? h('span', { class: 'old', text: 'older' }) : null),
        h('span', { style: 'min-width:0' }, statusPill(it.status, FORM_ST),
          // weak systems, then your notes on their own line
          it.weak.length ? h('span', { class: 'notes-p' }, h('b', { class: 'weak-l', text: 'Weak: ' + weakNames(it.weak) })) : null,
          it.notes ? h('span', { class: 'notes-p notes-t', title: it.notes, text: it.notes }) : null),
        h('span', { class: 'sc' + (main == null && p == null ? ' none' : '') },
          g.scaled && est ? h('b', { class: 'est', title: 'Estimated from % correct (' + est.how + ')', text: '≈' + est.score })
            : g.scaled ? h('b', { class: band('score', s3), text: s3 != null ? String(s3) : '—' }) : h('b', { text: p != null ? fmtPct(p) : '—' }),
          g.scaled && p != null ? h('small', { text: fmtPct(p) }) : !g.scaled && est ? h('small', { class: 'est', title: 'Estimated 3-digit score (' + est.how + ')', text: '≈' + est.score }) : null),
        planned ? h('span', { class: 'dt plan' + (overdue ? ' overdue' : ''), title: overdue ? 'Planned date has passed' : 'Planned', text: (overdue ? 'was ' : 'plan ') + fmtDate(it.plan) })
          : h('span', { class: 'dt', text: fmtDate(it.date) }));
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
        nHidden && !ui.editTests ? h('button', { class: 'linkish', onclick: () => { ui.editTests = true; render(); } }, nHidden + ' removed · restore') : null),
      h('p', { class: 'sub', text: g.desc }),
      h('div', { class: 'rows' }, rows, ui.editTests ? null : add));
  }));
}

export function openForm(f) {
  const isCms = f.kind === 'cms', scaled = !isCms && f.g.scaled, qs = isCms ? 50 : f.qs;
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
  const estLine = h('p', { class: 'hint est-line' });
  const drawConv = () => {
    const p = num(cur()[pctKey]);
    conv.textContent = qs + ' questions' + (p != null && p >= 0 && p <= 100 ? ' · ' + fmtPct(p) + ' ≈ ' + Math.round(p / 100 * qs) + '/' + qs + ' correct'
      : scaled ? ' · enter the 3-digit score and % correct' : ' · enter % correct');
    // estimate from % correct; a score you typed stays as it is, and the difference is shown
    const e = !isCms && p != null && p >= 0 && p <= 100 ? estimateScore(f, p) : null;
    const real = scaled ? num(cur().score) : null;
    estLine.textContent = !e ? (scaled && p != null ? (modelsFor(f.id).length ? 'No score estimate — ' + fmtPct(p) + ' is outside the published conversion’s range.' : 'No published conversion for ' + f.full + ' — add your own in the Score calculator.') : '')
      : 'Estimated from % correct: ' + estText(e) + ' (' + e.how + ')' + (real == null ? '.' : real === e.score ? ' — matches your score.'
        : ' — your score is ' + Math.abs(real - e.score) + (real > e.score ? ' higher.' : ' lower.'));
  };
  const score = scaled ? numField('ed-score', '3-digit score', { inputmode: 'numeric', step: '1', placeholder: 'e.g. 248', value: cur().score }, 1, 300, true,
    (raw) => { const p = { score: raw }; if (raw !== '') markTaken(p); patch(p); drawStep(); drawConv(); }) : null;
  const pct = numField('ed-pct', '% correct', { inputmode: 'decimal', step: 'any', placeholder: scaled ? 'e.g. 72' : 'e.g. 82', value: cur()[pctKey] }, 0, 100, false,
    (raw) => { const p = { [pctKey]: raw }; if (raw !== '') markTaken(p); patch(p); drawStep(); drawConv(); });
  const notesIn = h('textarea', { id: 'ed-notes', placeholder: 'Weak areas, recurring mistakes, topics to read…' });
  notesIn.value = cur().notes;
  notesIn.addEventListener('input', () => patch({ notes: notesIn.value }));
  drawStep(); drawConv();

  const dateField = h('div', { class: 'field' }, h('label', { for: 'ed-date', text: 'Date taken' }), dateIn);
  const planIn = isCms ? null : h('input', { type: 'date', id: 'ed-plan', value: cur().plan });
  if (planIn) planIn.addEventListener('change', () => patch({ plan: isDate(planIn.value) }));
  const planField = planIn && h('div', { class: 'field' }, h('label', { for: 'ed-plan', text: 'Planned for' }), planIn);
  const picker = isCms ? null : weakPicker(() => cur().weak, (weak) => patch({ weak }), { kind: 'count', get: () => cur().weakN || {}, set: (weakN) => patch({ weakN }) });
  const weakBox = picker && picker.box, drawWeak = () => picker && picker.draw();
  const clearBtn = h('button', { class: 'btn ghost danger', onclick: () => {
    const undo = snapshot();
    delete state.items[f.id]; save(); closeSheet();
    toast(f.full + ' cleared', undo);
  } }, 'Clear entry');
  const rmBtn = h('button', { class: 'btn ghost danger', onclick: () => {
    const undo = snapshot();
    if (!f.removed) toggleRemove(f);
    closeSheet();
    toast(f.full + ' removed — Edit list brings it back', undo);
  } }, 'Remove form');
  openSheet(f.id, f.full, [
    sheetHead(isCms ? 'CMS · ' + f.subj.name : f.g.name, f.label + (f.old ? ' (older)' : '')),
    h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Status' }), stepper),
    scaled ? h('div', { class: 'two' }, score.field, pct.field) : h('div', { class: 'two' }, pct.field, dateField),
    scaled ? h('div', { class: 'two' }, dateField, planField) : planField ? h('div', { class: 'two' }, planField, h('div')) : null,
    conv, estLine,
    weakBox ? h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Weak systems in this form' }), weakBox,
      h('p', { class: 'hint', text: 'Tap the systems you missed most. Systems that keep coming up across forms show on the overview.' })) : null,
    h('div', { class: 'field' }, h('label', { for: 'ed-notes', text: 'Notes' }), notesIn),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'Done'), clearBtn, rmBtn),
  ], () => {
    const a = document.activeElement;
    if (score && a !== score.inp) score.inp.value = cur().score;
    if (a !== pct.inp) pct.inp.value = cur()[pctKey];
    if (a !== dateIn) dateIn.value = cur().date;
    if (planIn && a !== planIn) planIn.value = cur().plan;
    if (a !== notesIn) notesIn.value = cur().notes;
    drawStep(); drawConv(); drawWeak();
  }, scaled ? '#ed-score' : '#ed-pct');
}
$('calc-btn').addEventListener('click', () => toggleCalculator());
$('edit-tests').addEventListener('click', () => { ui.editTests = !ui.editTests; ui.addingFor = null; render(); });
