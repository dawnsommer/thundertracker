// Live state, saving to this browser, undo snapshots, toasts and the light/dark theme.

import { $, clone, h, svgIcon } from './util.js?v=21';
import { KEY } from './catalog.js?v=21';
import { blank, norm, normSys, same, stamp, stampAll } from './model.js?v=21';
import { refreshSheet } from './sheets.js?v=21';
import { render, renderNotice } from './shell.js?v=21';

export let state = blank();
export const ui = { tab: 'overview', subj: 'all', st: 'all', addingFor: null, focusAdd: false, editForms: false, logAll: false, heatDay: '', weakAll: false, prevTab: 'overview', artArrange: false, calcOpen: false,
  artF: 'all', artQ: '', artAdding: null, artNewSec: false, artRename: null, artJump: '' };
export let saveTimer = null, storageOk = true, storageMsg = '';
export let saved = blank(); // copy of what is in storage, used to stamp what changed
export const cloud = () => window.CKCloud || null;

export const item = (id) => state.items[id] || { status: 0, score: '', pct: '', date: '', notes: '', weak: [], weakPct: {}, weakN: {}, plan: '', retake: null };
export const sysItem = (id) => state.systems[id] || normSys(null);

// Header status: local save state first, then Google sync state when signed in.
export let localSave = { cls: '', text: 'Saved on this device' };
export const setSave = (cls, text) => { localSave = { cls, text }; paintStatus(); };
export function paintStatus() {
  const c = cloud() && cloud().status();
  let { cls, text } = localSave;
  if (c && c.connected && !cls && c.short) { cls = { syncing: 'busy', connecting: 'busy', error: 'off', offline: 'off', expired: 'off' }[c.state] || ''; text = c.short; }
  $('save').className = 'save ' + cls;
  $('save-t').textContent = text;
  $('save').title = c && c.message ? c.message : '';
}

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); }
  catch (e) { storageOk = false; storageMsg = 'Your browser is blocking storage for this page, so nothing you log will be kept after you close it. Allow site data, or export a backup before leaving.'; return blank(); }
  if (!raw) return blank();
  try { return norm(JSON.parse(raw)); }
  catch (e) {
    // keep the unreadable copy so it can be recovered by hand
    try { localStorage.setItem(KEY + '-unreadable-' + Date.now(), raw); } catch (e2) {}
    storageMsg = 'Your saved data couldn’t be read, so the tracker started fresh. The old copy was kept in browser storage; import a backup to restore your progress.';
    return blank();
  }
}
export function save() {
  setSave('busy', 'Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}
export function flush() {
  clearTimeout(saveTimer); saveTimer = null;
  const changed = stamp(state, saved, Date.now());
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saved = clone(state);
    storageOk = true;
    setSave('', 'Saved on this device');
    if (changed && cloud()) cloud().markDirty();
  } catch (e) {
    storageOk = false;
    // still in memory: with Google sync on, it can still reach your account
    if (changed && cloud()) cloud().markDirty();
    setSave('off', e && e.name === 'QuotaExceededError' ? 'Not saved — storage full' : 'Not saved — storage blocked');
    storageMsg = 'Changes can’t be saved in this browser right now. Export a backup from Settings so you don’t lose them.';
    renderNotice();
  }
}
window.addEventListener('pagehide', () => { if (saveTimer) flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) flush(); });
// another tab changed the data
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue || saveTimer) return;
  try { state = norm(JSON.parse(e.newValue)); } catch (err) { return; }
  saved = clone(state);
  applyTheme(); render(); refreshSheet();
});
// Write a state that came from elsewhere (Google) without re-stamping it as a local edit.
export function persistQuiet() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); saved = clone(state); } catch (e) {}
}

// Undo: capture the whole state before a destructive change.
export function snapshot() {
  const snap = JSON.stringify(state);
  return () => {
    const before = state.base;
    state = norm(JSON.parse(snap));
    // undoing an import/erase is itself a fresh starting point
    if (state.base !== before) stampAll(state, Date.now());
    applyTheme(); save(); render(); refreshSheet();
  };
}
export function toast(msg, undo) {
  const t = h('div', { class: 'toast' }, h('span', { text: msg }));
  if (undo) t.append(h('button', { onclick: () => { undo(); t.remove(); } }, 'Undo'));
  $('toasts').replaceChildren(t);
  setTimeout(() => t.remove(), undo ? 8000 : 4000);
}

export function applyTheme() {
  const t = state.prefs.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const dark = t === 'dark' || (t === 'system' && (m.getAttribute('media') || '').includes('dark'));
    m.setAttribute('content', dark ? '#0e131a' : '#f3f5f8');
  });
  const b = $('theme-btn');
  b.innerHTML = THEME_ICON[t];
  const label = 'Theme: ' + { system: 'matches your device', light: 'light', dark: 'dark' }[t] + '. Tap to switch.';
  b.setAttribute('aria-label', label);
  b.title = label;
}
export const THEME_ICON = {
  light: svgIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  dark: svgIcon('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  system: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>'),
};
// From "match device", the first tap always flips what you see; the third returns to matching the device.
export function cycleTheme() {
  const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const flip = sysDark ? 'light' : 'dark', same = sysDark ? 'dark' : 'light';
  const t = state.prefs.theme;
  state.prefs.theme = t === 'system' ? flip : t === flip ? same : 'system';
  applyTheme(); save(); refreshSheet();
  toast({ light: 'Light mode', dark: 'Dark mode', system: 'Theme matches your device' }[state.prefs.theme]);
}
$('theme-btn').addEventListener('click', cycleTheme);

// Other modules can't assign imported bindings, so these replace `state = …` / `saved = …` there.
export function setState(s) { state = s; }
export function setSaved(s) { saved = s; }
