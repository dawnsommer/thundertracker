// The Qbank tab: qbank cards and editor, session log and weekly volume.

import { $, dayNum, fmtDate, fmtK, fmtN, fmtPct, fromDay, h, isDate, num, plural, today, uid, weekday } from './util.js?v=12';
import { QBANKS } from './catalog.js?v=12';
import { save, snapshot, state, toast, ui } from './store.js?v=12';
import { band, bankStats, qbStats, weakNames } from './data.js?v=12';
import { closeSheet, numField, openSheet, sheetHead, weakPicker } from './sheets.js?v=12';
import { render } from './shell.js?v=12';
import { tile } from './overview.js?v=12';

export function renderQbank() {
  const qb = qbStats();
  $('qb-banks').replaceChildren(...qb.banks.map((b) => {
    const big = b.done != null && (b.baseQ || b.loggedQ) ? fmtN(b.done) : b.pctDone != null ? fmtPct(b.pctDone) : '—';
    const note = [b.pctDone != null && b.done != null && b.bank ? fmtPct(b.pctDone) + ' done' : '', b.acc != null ? fmtPct(b.acc) + ' correct' : '',
      b.left != null && b.started && !b.finished ? fmtN(b.left) + ' left' : '', b.loggedQ ? fmtN(b.loggedQ) + ' logged here' : '',
      b.baseQ == null && !b.finished ? 'add the bank size to count questions' : ''].filter(Boolean).join(' · ');
    return h('button', { class: 'tile qbc' + (b.finished ? ' fin' : ''), 'data-open': 'qb-' + b.qb.id, onclick: () => openQbank(b.qb), 'aria-label': b.qb.name + (b.finished ? ', finished' : '') + ': edit progress' },
      h('span', { class: 'eyebrow qbc-h' }, h('span', null, b.qb.name, b.finished ? h('span', { class: 'qbc-fin', text: '✓ Finished ' + fmtDate(b.qb.finished) }) : null), h('span', { class: 'qbc-edit', text: 'Edit' })),
      h('span', { class: 'big' }, big, b.bank && b.done != null && (b.baseQ || b.loggedQ) ? h('small', { text: '/ ' + fmtN(b.bank) }) : null),
      h('span', { class: 'meter' }, h('b', { style: 'width:' + Math.round(b.pctDone || 0) + '%' })),
      h('span', { class: 'note', text: note || 'Tap to enter your progress so far' }),
      b.finished ? h('span', { class: 'note qbc-weak' }, b.qb.weak.length ? h('b', { class: 'weak-l', text: 'Weak: ' + weakNames(b.qb.weak) }) : 'Tap to mark its weak systems') : null);
  }), h('button', { class: 'add-chip qbc-add', 'data-open': 'qb-new', onclick: () => openQbank(null) }, '+ Add a qbank'));
  // keep the session form's qbank list in step with your qbanks
  const sel = $('lg-src'), keep = sel.value, opts = state.qbanks.map((q) => q.name).concat('Other');
  if ([...sel.options].map((o) => o.value).join('|') !== opts.join('|')) {
    sel.replaceChildren(...opts.map((n) => h('option', { value: n, text: n })));
    sel.value = opts.includes(keep) ? keep : opts[0];
  }
  $('qb-tiles').replaceChildren(
    tile('Accuracy', qb.acc != null ? fmtPct(qb.acc) : '—', '', qb.acc != null ? qb.acc / 100 : null, 'All qbanks, weighted by questions'),
    tile('Last 7 days', fmtK(qb.week), 'questions', null, qb.week ? '~' + Math.round(qb.week / 7) + ' a day' : 'Nothing logged this week'),
    tile('Streak', String(qb.streak), qb.streak === 1 ? 'day' : 'days', null, 'Longest ' + plural(qb.best, 'day') + ' · ' + plural(qb.sessions, 'session')),
  );
  renderWeeks($('qb-weeks'));
  const list = state.log.slice().sort((a, b) => b.date.localeCompare(a.date));
  const shown = ui.logAll ? list : list.slice(0, 25);
  const rows = shown.map((e) => h('div', { class: 'lrow' },
    h('span', { class: 'd', text: fmtDate(e.date) }),
    h('span', null, h('span', { class: 'tag', text: e.src })),
    h('span', { class: 'q', text: e.q + ' q' }),
    h('span', { class: 'p ' + (num(e.pct) != null ? band('cms', num(e.pct)) : 'muted'), text: num(e.pct) != null ? fmtPct(num(e.pct)) : '—' }),
    h('span', { class: 'nt', text: e.note, title: e.note || null }),
    h('button', { class: 'xs', 'aria-label': 'Delete session on ' + fmtDate(e.date), title: 'Delete', onclick: () => {
      const undo = snapshot();
      state.log = state.log.filter((x) => x.id !== e.id); save(); render();
      toast('Session deleted', undo);
    } }, '×')));
  if (list.length > shown.length) rows.push(h('button', { class: 'add-link', onclick: () => { ui.logAll = true; render(); } }, 'Show all ' + list.length + ' sessions'));
  $('qb-list').replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty-row', text: 'No sessions yet. Log your first block above.' })]));
}
export function renderWeeks(box) {
  const n = 12, t = dayNum(today()), start = t - weekday(t) - (n - 1) * 7;
  const wk = Array.from({ length: n }, () => ({ q: 0, cq: 0, c: 0 }));
  state.log.forEach((e) => {
    const d = dayNum(e.date); if (d < start || d > t) return;
    const w = wk[Math.floor((d - start) / 7)], p = num(e.pct);
    w.q += e.q; if (p != null) { w.cq += e.q; w.c += e.q * p; }
  });
  const max = Math.max(1, ...wk.map((w) => w.q));
  box.replaceChildren(h('div', { class: 'wbars', role: 'img', 'aria-label': 'Questions per week: ' + wk.map((w) => w.q).join(', ') },
    wk.map((w, i) => {
      const ws = fromDay(start + i * 7);
      return h('div', { class: 'wb' + (i === n - 1 ? ' cur' : ''), title: 'Week of ' + fmtDate(ws) + ' · ' + w.q + ' questions' + (w.cq ? ' · ' + fmtPct(w.c / w.cq) + ' correct' : '') },
        h('span', { class: 'wv', text: w.q ? fmtK(w.q) : '' }),
        h('span', { class: 'wc' }, h('i', { style: 'height:' + (w.q / max * 100) + '%' })),
        h('span', { class: 'wl', text: (n - 1 - i) % 3 === 0 ? new Date(ws + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '' }));
    })));
}
(function setupLogForm() {
  const f = $('log-form'), date = $('lg-date'), q = $('lg-q'), pct = $('lg-pct'), src = $('lg-src'), note = $('lg-note'), err = $('lg-err');
  date.value = today();
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const qn = Number(q.value), pn = pct.value === '' ? null : Number(pct.value);
    const problem = !isDate(date.value) ? 'Pick a date.' : !(Number.isInteger(qn) && qn >= 1 && qn <= 1000) ? 'Enter how many questions (1–1000).'
      : pn != null && !(pn >= 0 && pn <= 100) ? '% correct must be between 0 and 100.' : pct.validity.badInput ? '% correct must be a number.' : '';
    err.textContent = problem;
    if (problem) return;
    const undo = snapshot();
    state.log.push({ id: uid(), date: date.value, q: qn, pct: pn == null ? '' : String(pn), src: src.value, note: note.value.trim().slice(0, 200) });
    save(); render();
    q.value = ''; pct.value = ''; note.value = ''; q.focus();
    toast('Logged ' + qn + ' ' + src.value + ' questions', undo);
  });
})();

// Edit a qbank's size and the progress you'd made before logging sessions here (null = add a new one).
export function openQbank(qb) {
  const isNew = !qb, builtIn = qb && QBANKS.some((d) => d.id === qb.id);
  const draft = qb ? null : { id: 'qb-x' + uid(), name: '', bank: '', done: '', unit: 'q', acc: '', finished: '', weak: [], t: 0 };
  const cur = () => (isNew ? draft : state.qbanks.find((x) => x.id === qb.id) || draft);
  const patch = (p) => {
    if (isNew) { Object.assign(draft, p); return; }
    state.qbanks = state.qbanks.map((x) => (x.id === qb.id ? Object.assign({}, x, p) : x));
    save(); render(); drawSummary();
  };
  const nameIn = h('input', { type: 'text', id: 'qb-name', maxlength: '40', placeholder: 'e.g. Kaplan', value: cur().name });
  const nameErr = h('span', { class: 'err', text: 'Give it a name that isn’t already used' });
  const nameField = h('div', { class: 'field' }, h('label', { for: 'qb-name', text: 'Qbank name' }), nameIn, nameErr);
  nameIn.addEventListener('input', () => {
    const v = nameIn.value.trim(), clash = state.qbanks.some((x) => x.id !== cur().id && x.name.toLowerCase() === v.toLowerCase()) || /^other$/i.test(v);
    nameField.classList.toggle('bad', !v || clash);
    if (v && !clash && !isNew) {
      // sessions refer to a qbank by name, so rename them too
      const old = cur().name;
      state.log = state.log.map((e) => (e.src === old ? Object.assign({}, e, { src: v }) : e));
      patch({ name: v });
    } else if (isNew) patch({ name: v });
  });
  const bank = numField('qb-bank', 'Questions in the bank', { inputmode: 'numeric', step: '1', placeholder: 'e.g. 3509', value: cur().bank }, 1, 50000, true, (raw) => patch({ bank: raw }));
  const unitSel = h('select', { id: 'qb-unit', 'aria-label': 'Done so far is counted in' },
    h('option', { value: 'q', text: 'questions' }), h('option', { value: 'pct', text: '% of the bank' }));
  unitSel.value = cur().unit;
  const done = numField('qb-done', 'Done so far', { inputmode: 'decimal', step: 'any', placeholder: cur().unit === 'pct' ? 'e.g. 94' : 'e.g. 930', value: cur().done },
    0, 50000, false, (raw) => patch({ done: raw }));
  done.field.append(unitSel);
  unitSel.addEventListener('change', () => { patch({ unit: unitSel.value }); done.inp.placeholder = unitSel.value === 'pct' ? 'e.g. 94' : 'e.g. 930'; });
  const acc = numField('qb-acc', '% correct so far', { inputmode: 'decimal', step: 'any', placeholder: 'e.g. 65', value: cur().acc }, 0, 100, false, (raw) => patch({ acc: raw }));
  // Finished: you can stop before 100%. Once finished, mark its weak systems like an assessment.
  const finIn = h('input', { type: 'checkbox', id: 'qb-fin' });
  finIn.checked = !!cur().finished;
  const finDate = h('input', { type: 'date', id: 'qb-fin-date', value: cur().finished, 'aria-label': 'Finished on' });
  const picker = weakPicker(() => cur().weak || [], (weak) => patch({ weak }), () => cur().weakPct || {}, (weakPct) => patch({ weakPct }));
  const finBox = h('div', { class: 'field qb-fin-box' });
  const drawFin = () => {
    const b = bankStats(cur()), fin = !!cur().finished;
    finIn.checked = fin;
    if (document.activeElement !== finDate) finDate.value = cur().finished;
    finBox.replaceChildren(...[
      h('label', { class: 'switch sim-opt', for: 'qb-fin' }, finIn, h('span', null, h('b', { text: 'Finished' }),
        h('small', { class: 'muted', text: fin ? '' : b.pctDone != null && b.pctDone >= 100 ? ' — looks complete' : ' — you can finish early and skip the rest' }))),
      fin ? h('div', { class: 'two' }, h('div', { class: 'field' }, h('label', { for: 'qb-fin-date', text: 'Finished on' }), finDate), h('div')) : null,
      fin ? h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Weak systems in this qbank' }), picker.box,
        h('p', { class: 'hint', text: 'Use its performance-by-system report. These join your assessments in “Recurring weak systems” on the overview.' })) : null,
    ].filter(Boolean));
    picker.draw();
  };
  finIn.addEventListener('change', () => { patch({ finished: finIn.checked ? cur().finished || today() : '' }); drawFin(); });
  finDate.addEventListener('change', () => { if (isDate(finDate.value)) patch({ finished: finDate.value }); });
  drawFin();
  const summary = h('p', { class: 'hint' });
  const drawSummary = () => {
    const b = bankStats(cur());
    summary.textContent = b.started
      ? [b.done != null ? fmtN(b.done) + (b.bank ? ' of ' + fmtN(b.bank) : '') + ' done' : fmtPct(b.pctDone) + ' done', b.pctDone != null && b.bank ? fmtPct(b.pctDone) : '',
        b.acc != null ? fmtPct(b.acc) + ' correct' : '', b.loggedQ ? 'includes ' + fmtN(b.loggedQ) + ' logged in sessions' : '', b.finished ? 'finished' : ''].filter(Boolean).join(' · ')
      : 'Nothing entered yet.';
  };
  drawSummary();
  const actions = [
    isNew ? h('button', { class: 'btn primary', onclick: () => {
      const v = draft.name.trim();
      if (!v || state.qbanks.some((x) => x.name.toLowerCase() === v.toLowerCase()) || /^other$/i.test(v)) { nameField.classList.add('bad'); nameIn.focus(); return; }
      state.qbanks.push(Object.assign({}, draft, { name: v }));
      save(); closeSheet(); toast(v + ' added');
    } }, 'Add qbank') : h('button', { class: 'btn primary', onclick: closeSheet }, 'Done'),
    !isNew && !builtIn ? h('button', { class: 'btn ghost danger', onclick: () => {
      const undo = snapshot();
      state.qbanks = state.qbanks.filter((x) => x.id !== qb.id);
      save(); closeSheet(); toast(qb.name + ' removed (its sessions are kept)', undo);
    } }, 'Remove qbank') : null,
  ];
  openSheet(isNew ? 'qb-new' : 'qb-' + qb.id, isNew ? 'Add a qbank' : qb.name, [
    sheetHead('Qbank', isNew ? 'Add a qbank' : qb.name),
    builtIn ? null : nameField,
    h('div', { class: 'two' }, bank.field, acc.field),
    h('div', { class: 'two' }, done.field, h('div')),
    h('p', { class: 'hint', text: 'Enter where you are now — from the qbank’s own stats page. Sessions you log on this tab are added on top. “% of the bank” needs the bank size to count questions.' }),
    summary,
    finBox,
    h('div', { class: 'actions' }, actions),
  ], () => {
    const a = document.activeElement;
    if (a !== bank.inp) bank.inp.value = cur().bank;
    if (a !== done.inp) done.inp.value = cur().done;
    if (a !== acc.inp) acc.inp.value = cur().acc;
    unitSel.value = cur().unit;
    drawSummary(); drawFin();
  }, builtIn ? '#qb-bank' : '#qb-name');
}
