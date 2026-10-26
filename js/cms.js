// The CMS forms tab.

import { $, avg, fmtPct, h, nn } from './util.js?v=21';
import { FORM_ST, SUBJ } from './catalog.js?v=21';
import { item, save, snapshot, state, toast, ui } from './store.js?v=21';
import { addForm, band, cmsForms, pctOf, taken, toggleRemove } from './data.js?v=21';
import { render } from './shell.js?v=21';
import { openForm } from './assessments.js?v=21';

export function renderCms() {
  $('cms-subj').replaceChildren(
    h('button', { class: 'pill', 'aria-pressed': ui.subj === 'all' ? 'true' : 'false', onclick: () => { ui.subj = 'all'; render(); } }, 'All subjects'),
    ...SUBJ.map((s) => h('button', { class: 'pill', 'aria-pressed': ui.subj === s.key ? 'true' : 'false', onclick: () => { ui.subj = s.key; render(); } }, s.name)));
  document.querySelectorAll('[data-st]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.st === ui.st ? 'true' : 'false'));
  $('show-old').checked = !!state.prefs.showOld;
  const eb = $('edit-forms');
  eb.setAttribute('aria-pressed', ui.editForms ? 'true' : 'false');
  eb.textContent = ui.editForms ? 'Done editing' : 'Edit list';

  const subs = SUBJ.filter((s) => ui.subj === 'all' || ui.subj === s.key);
  const bar = ui.editForms ? h('div', { class: 'editbar' },
    h('span', { text: 'Tap × to remove a form, ↺ to bring it back. Your scores are kept.' }),
    h('button', { class: 'btn primary', onclick: () => { ui.editForms = false; render(); } }, 'Done')) : null;
  $('cms-list').replaceChildren(...[bar].filter(Boolean), ...subs.map((s) => {
    const visibleAll = cmsForms(s, state.prefs.showOld);
    const nRemoved = cmsForms(s, true, true).filter((f) => f.removed).length;
    const forms = ui.editForms ? cmsForms(s, state.prefs.showOld, true)
      : visibleAll.filter((f) => ui.st === 'all' || (ui.st === 'todo' ? item(f.id).status === 0 : item(f.id).status > 0));
    const done = visibleAll.filter(taken).length;
    const a = avg(visibleAll.map(pctOf).filter(nn));
    const chips = forms.map((f) => {
      const it = item(f.id), v = pctOf(f);
      if (ui.editForms) {
        return h('button', { class: 'chip editing ' + (f.removed ? 'removed' : 's' + it.status), 'aria-label': (f.removed ? 'Restore ' : 'Remove ') + s.name + ' ' + f.label,
          onclick: () => {
            const undo = f.extra ? snapshot() : null;
            toggleRemove(f);
            if (undo) toast(s.name + ' ' + f.label + ' removed', undo);
          } },
          h('span', { class: 'del', 'aria-hidden': 'true', text: f.removed ? '↺' : '×' }),
          h('span', { class: 'nm' }, f.label, f.old ? h('span', { class: 'old', text: 'older' }) : null),
          h('span', { class: 'sc none', text: f.removed ? 'Removed' : v != null ? fmtPct(v) : FORM_ST[it.status] }),
          h('span', { class: 'steps', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
      }
      return h('button', { class: 'chip s' + it.status, 'data-open': f.id, onclick: () => openForm(f), 'aria-label': s.name + ' ' + f.label + ', ' + FORM_ST[it.status] + (v != null ? ', ' + fmtPct(v) : '') },
        h('span', { class: 'nm' }, f.label, f.old ? h('span', { class: 'old', text: 'older' }) : null),
        v != null ? h('span', { class: 'sc ' + band('cms', v), text: fmtPct(v) }) : h('span', { class: 'sc none', text: FORM_ST[it.status] }),
        h('span', { class: 'steps', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
    });
    if (ui.addingFor === s.key) {
      const inp = h('input', { type: 'number', min: '1', max: '99', placeholder: 'Form #', 'aria-label': 'New ' + s.name + ' form number' });
      const add = () => {
        const n = parseInt(inp.value, 10);
        if (!(n >= 1 && n <= 99)) { inp.focus(); return; }
        ui.addingFor = null; toast(addForm('cms', s, n)); render();
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { ui.addingFor = null; render(); } });
      chips.push(h('div', { class: 'add-form' }, inp, h('button', { onclick: add }, 'Add')));
      if (ui.focusAdd) { ui.focusAdd = false; setTimeout(() => inp.focus(), 0); }
    } else if (ui.st !== 'done' && !ui.editForms) {
      chips.push(h('button', { class: 'add-chip', onclick: () => { ui.addingFor = s.key; ui.focusAdd = true; render(); } }, '+ Add form'));
    }
    return h('div', { class: 'subject', id: 'cms-' + s.key },
      h('div', { class: 'subj-head' }, h('h3', { text: s.name }),
        h('span', { class: 'stat' }, done + '/' + visibleAll.length + ' done', a != null ? h('span', { class: band('cms', a), text: ' · avg ' + fmtPct(a) }) : null),
        nRemoved && !ui.editForms ? h('button', { class: 'linkish', onclick: () => { ui.editForms = true; render(); } }, nRemoved + ' removed · restore') : null),
      chips.length ? h('div', { class: 'chips' }, chips) : h('p', { class: 'sub', text: 'Nothing here for this filter.' }));
  }));
}
document.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { ui.st = b.dataset.st; render(); }));
$('edit-forms').addEventListener('click', () => { ui.editForms = !ui.editForms; ui.addingFor = null; render(); });
$('show-old').addEventListener('change', (e) => { state.prefs.showOld = e.target.checked; save(); render(); });
