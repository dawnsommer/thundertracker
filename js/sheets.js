// Side panels (editor sheets) and the form controls they share.

import { $, h, num } from './util.js?v=18';
import { allSystems, shortSys } from './data.js?v=18';
import { render } from './shell.js?v=18';
import { settingsRefresh } from './settings.js?v=18';

// Tap-to-toggle system chips, shared by assessments and qbanks.
// getPct/setPct (optional): the % correct you scored in each weak system, which shades the weakness matrix.
// Tap systems you were weak in. `extra` adds optional numbers per weak system that shade the weakness
// matrix: { kind: 'count', get, set } for assessments (errors and unstable questions, from your review)
// or { kind: 'pct', get, set } for qbanks (% correct, e.g. from UWorld's performance page).
export function weakPicker(get, set, extra) {
  const wrap = h('div', { class: 'weak-wrap' });
  const box = h('div', { class: 'tags weak-pick', role: 'group', 'aria-label': 'Weak systems' });
  const numBox = h('div', { class: 'weak-pcts' });
  const counts = extra && extra.kind === 'count';
  let showNums = !!(extra && Object.keys(extra.get()).length);
  // one number box: '' clears it; out of range is ignored while typing
  const numIn = (sy, field, max, label, placeholder) => {
    const v = counts ? ((extra.get()[sy.id] || {})[field] || '') : (extra.get()[sy.id] || '');
    const inp = h('input', { type: 'number', min: '0', max: String(max), step: counts ? '1' : 'any', inputmode: counts ? 'numeric' : 'decimal', placeholder, value: v === 0 ? '' : String(v),
      'aria-label': label + ' in ' + sy.name, 'data-weak': sy.id + ':' + field });
    inp.addEventListener('input', () => {
      const raw = inp.value.trim(), n = Number(raw), next = Object.assign({}, extra.get());
      if (raw !== '' && !(n >= 0 && n <= max && (!counts || Number.isInteger(n)))) return;
      if (counts) {
        const cur = Object.assign({ e: 0, u: 0 }, next[sy.id]);
        cur[field] = raw === '' ? 0 : n;
        if (cur.e || cur.u) next[sy.id] = cur; else delete next[sy.id];
      } else if (raw === '') delete next[sy.id]; else next[sy.id] = raw;
      extra.set(next);
    });
    return inp;
  };
  const draw = () => {
    box.replaceChildren(...allSystems().map((sy) => {
      const on = get().includes(sy.id);
      return h('button', { class: 'tag' + (on ? ' on weak-on' : ''), 'aria-pressed': on ? 'true' : 'false', title: sy.name, onclick: () => {
        const w = get().filter((x) => x !== sy.id);
        set(on ? w : w.concat(sy.id));
        draw();
      } }, (on ? '✓ ' : '') + shortSys(sy.name));
    }));
    if (!extra) return;
    const sel = get().map((id) => allSystems().find((x) => x.id === id)).filter(Boolean);
    if (!sel.length) { numBox.replaceChildren(); numBox.dataset.key = ''; return; }
    if (!showNums) {
      numBox.dataset.key = '';
      numBox.replaceChildren(h('button', { class: 'linkish', onclick: () => { showNums = true; draw(); } },
        counts ? 'Add errors per weak system (optional — shades the weakness matrix)' : 'Add % correct per weak system (optional — shades the weakness matrix)'));
      return;
    }
    // same systems and you're typing in one: update the others in place, keep the focused box
    const key = sel.map((sy) => sy.id).join();
    if (numBox.dataset.key === key && numBox.contains(document.activeElement)) {
      numBox.querySelectorAll('[data-weak]').forEach((i) => {
        if (i === document.activeElement) return;
        const [id, field] = i.dataset.weak.split(':');
        const v = counts ? ((extra.get()[id] || {})[field] || '') : (extra.get()[id] || '');
        i.value = v === 0 ? '' : String(v);
      });
      return;
    }
    numBox.dataset.key = key;
    numBox.replaceChildren(
      h('p', { class: 'hint', text: counts ? 'From your review: questions wrong (errors) and right-but-unsure (unstable) in each weak system. Both optional.' : '% correct in each weak system, from the score report (optional):' }),
      h('div', { class: 'weak-pct-grid' + (counts ? ' counts' : '') },
        counts ? h('div', { class: 'weak-pct weak-n head', 'aria-hidden': 'true' }, h('span'), h('small', { text: 'errors' }), h('small', { text: 'unstable' })) : null,
        sel.map((sy) => counts
        ? h('div', { class: 'weak-pct weak-n' }, h('span', { text: shortSys(sy.name) }), numIn(sy, 'e', 200, 'Errors', 'err'), numIn(sy, 'u', 200, 'Unstable', 'uns'))
        : h('label', { class: 'weak-pct' }, h('span', { text: shortSys(sy.name) }), numIn(sy, 'pct', 100, '% correct', '%')))));
  };
  draw();
  wrap.append(box, numBox);
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
