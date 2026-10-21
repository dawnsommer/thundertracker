// Side panels (editor sheets) and the form controls they share.

import { $, h, num } from './util.js?v=11';
import { allSystems, shortSys } from './data.js?v=11';
import { render } from './shell.js?v=11';
import { settingsRefresh } from './settings.js?v=11';

// Tap-to-toggle system chips, shared by assessments and qbanks.
// getPct/setPct (optional): the % correct you scored in each weak system, which shades the weakness matrix.
export function weakPicker(get, set, getPct, setPct) {
  const wrap = h('div', { class: 'weak-wrap' });
  const box = h('div', { class: 'tags weak-pick', role: 'group', 'aria-label': 'Weak systems' });
  const pctBox = h('div', { class: 'weak-pcts' });
  let showPct = !!(getPct && Object.keys(getPct()).length);
  const draw = () => {
    box.replaceChildren(...allSystems().map((sy) => {
      const on = get().includes(sy.id);
      return h('button', { class: 'tag' + (on ? ' on weak-on' : ''), 'aria-pressed': on ? 'true' : 'false', title: sy.name, onclick: () => {
        const w = get().filter((x) => x !== sy.id);
        set(on ? w : w.concat(sy.id));
        draw();
      } }, (on ? '✓ ' : '') + shortSys(sy.name));
    }));
    if (!getPct) return;
    const sel = get().map((id) => allSystems().find((x) => x.id === id)).filter(Boolean);
    if (!sel.length) { pctBox.replaceChildren(); return; }
    if (!showPct) { pctBox.replaceChildren(h('button', { class: 'linkish', onclick: () => { showPct = true; draw(); } }, 'Add % correct per weak system (optional — shades the weakness matrix)')); return; }
    pctBox.replaceChildren(h('p', { class: 'hint', text: '% correct in each weak system, from the score report (optional):' }),
      h('div', { class: 'weak-pct-grid' }, sel.map((sy) => {
        const inp = h('input', { type: 'number', min: '0', max: '100', step: 'any', inputmode: 'decimal', placeholder: '%', value: getPct()[sy.id] || '', 'aria-label': '% correct in ' + sy.name, 'data-weakpct': sy.id });
        inp.addEventListener('input', () => {
          const v = inp.value.trim(), n = Number(v), next = Object.assign({}, getPct());
          if (v === '') delete next[sy.id]; else if (n >= 0 && n <= 100) next[sy.id] = v; else return;
          setPct(next);
        });
        return h('label', { class: 'weak-pct' }, h('span', { text: shortSys(sy.name) }), inp);
      })));
  };
  draw();
  wrap.append(box, pctBox);
  return { box: wrap, draw };
}
export const root = $('sheet-root');
export let sheetOpen = null;
export function openSheet(key, label, kids, refresh, focus) {
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, kids);
  root.replaceChildren(h('div', { class: 'scrim', onclick: closeSheet }), sheet);
  ['hdr', 'main'].forEach((id) => $(id).setAttribute('inert', ''));
  sheetOpen = { key, refresh };
  setTimeout(() => (sheet.querySelector(focus || '.x') || sheet).focus(), 0);
}
export function closeSheet() {
  if (!sheetOpen) return;
  const key = sheetOpen.key;
  sheetOpen = null;
  root.replaceChildren();
  ['hdr', 'main'].forEach((id) => $(id).removeAttribute('inert'));
  render();
  // return focus to whatever opened the panel
  const back = [...document.querySelectorAll('[data-open="' + CSS.escape(key) + '"]')].find((el) => el.getClientRects().length);
  if (back) back.focus();
}
export const refreshSheet = () => { if (sheetOpen && sheetOpen.refresh) sheetOpen.refresh(); if (settingsRefresh) settingsRefresh(); };
export const sheetHead = (eyebrow, title) => h('div', { class: 'sheet-head' },
  h('div', null, h('div', { class: 'eyebrow', text: eyebrow }), h('h2', { text: title })),
  h('button', { class: 'x', 'aria-label': 'Close', onclick: closeSheet }, '×'));

// Number input that only reports valid values; shows an inline error otherwise.
export function numField(id, label, attrs, lo, hi, intOnly, onValid) {
  const inp = h('input', Object.assign({ type: 'number', id, min: String(lo), max: String(hi) }, attrs));
  const err = h('span', { class: 'err', id: id + '-err', text: 'Enter ' + (intOnly ? 'a whole number ' : 'a number ') + lo + '–' + hi });
  const field = h('div', { class: 'field' }, h('label', { for: id, text: label }), inp, err);
  inp.setAttribute('aria-describedby', id + '-err');
  inp.addEventListener('input', () => {
    const raw = inp.value.trim(), v = num(raw);
    const ok = !inp.validity.badInput && (raw === '' || (v != null && v >= lo && v <= hi && (!intOnly || Number.isInteger(v))));
    field.classList.toggle('bad', !ok);
    inp.setAttribute('aria-invalid', ok ? 'false' : 'true');
    if (ok) onValid(raw);
  });
  return { field, inp };
}
