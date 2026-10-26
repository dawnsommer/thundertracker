// The Settings page.

import { $, daysUntil, fmtDate, fmtLong, fmtN, fmtPct, h, isDate, plural } from './util.js?v=22';
import { APP_VERSION } from './catalog.js?v=22';
import { blank, norm, stampAll } from './model.js?v=22';
import { applyTheme, cloud, save, setState, snapshot, state, toast, ui } from './store.js?v=22';
import { qbStats } from './data.js?v=22';
import { numField, refreshSheet } from './sheets.js?v=22';
import { render, showTab, tabsNow } from './shell.js?v=22';
import { openQbank } from './qbank.js?v=22';
import { exportCsv, exportJson } from './backup.js?v=22';
import { reloadLatest } from './updates.js?v=22';
import { printSummary } from './print.js?v=22';
import { codeOk, passiveOn } from './passive.js?v=22';

// Built once each time you open it; live parts redraw through settingsRefresh so typing isn't interrupted.
export let settingsRefresh = null;
export function openSettings(focus) {
  if (ui.tab !== 'settings') ui.prevTab = ui.tab;
  ui.settingsFocus = focus || '';
  showTab('settings', true);
}
export function buildSettings() {
  const p = () => state.prefs;
  const setPref = (k, v) => { state.prefs[k] = v; save(); render(); };
  const card = (id, title, sub, ...kids) => h('section', { class: 'card set-card', id, 'aria-labelledby': id + '-h' },
    h('h3', { id: id + '-h', text: title }), sub ? h('p', { class: 'sub', text: sub }) : null, ...kids);

  // plan
  const examIn = h('input', { type: 'date', id: 'st-exam', value: p().examDate });
  examIn.addEventListener('change', () => setPref('examDate', isDate(examIn.value)));
  const target = numField('st-target', 'Target score', { inputmode: 'numeric', step: '1', placeholder: 'e.g. 255', value: p().target }, 1, 300, true, (raw) => setPref('target', raw));
  const planNote = h('p', { class: 'hint' });
  const drawPlan = () => {
    const ex = p().examDate, dl = ex ? daysUntil(ex) : null;
    planNote.textContent = ex ? (dl > 0 ? plural(dl, 'day') + ' to go · ' : dl === 0 ? 'Test day is today · ' : 'Test date has passed · ') + 'drives the countdown, pace and score projection.'
      : 'Set it to get a countdown, a pace for your remaining assessments and qbanks, and a projected score.';
  };

  // Google
  const gBox = h('div', { class: 'set-body', id: 'st-google', tabindex: '-1' });
  // version history: kept outside drawGoogle so a redraw doesn't close the list
  const histBox = h('div', { class: 'hist', id: 'st-history', hidden: true });
  const restoreVersion = async (v, btn) => {
    btn.disabled = true;
    try {
      const data = await cloud().getVersion(v.id);
      const undo = snapshot();
      const theme = state.prefs.theme;
      setState(norm(data));
      state.prefs.theme = theme;
      stampAll(state, Date.now());
      applyTheme(); save(); render(); refreshSheet();
      toast('Restored your copy from ' + fmtDate(v.date) + ' — it replaces the copy in your Google account too', undo);
    } catch (e) { toast(e.message); } finally { btn.disabled = false; }
  };
  const loadHistory = async () => {
    histBox.hidden = false;
    histBox.replaceChildren(h('p', { class: 'hint', text: 'Loading your saved copies…' }));
    try {
      const vs = await cloud().listVersions();
      histBox.replaceChildren(
        vs.length ? h('div', { class: 'set-list' }, vs.map((v) => {
          const btn = h('button', { class: 'btn', 'data-version': v.id }, 'Restore');
          btn.addEventListener('click', () => restoreVersion(v, btn));
          return h('div', { class: 'set-row' },
            h('div', null, h('b', { text: fmtLong(v.date) }), h('small', { text: v.size ? Math.max(1, Math.round(v.size / 1024)) + ' KB' : '' })), btn);
        })) : h('p', { class: 'hint', text: 'No saved copies yet — the first one is saved with your next sync.' }),
        h('p', { class: 'hint', text: 'A copy is saved in your Google Drive app folder once a day, the first time you sync; the last 10 are kept. Restoring replaces what’s here and in your Google account, and you can undo right after.' }));
    } catch (e) { histBox.replaceChildren(h('p', { class: 'hint', text: e.message })); }
  };
  const drawGoogle = () => {
    const c = cloud() && cloud().status();
    if (!c) { gBox.replaceChildren(h('p', { class: 'hint', text: 'Google sync couldn’t load. Reload the page to try again.' })); return; }
    const busy = c.state === 'syncing' || c.state === 'connecting';
    const detail = [c.account ? 'Account: ' + c.account : '', c.shared ? 'using your ThunderShadow sign-in' : '',
      c.lastSync ? 'last synced ' + new Date(c.lastSync).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '', c.pending ? 'changes waiting to sync' : ''].filter(Boolean).join(' · ');
    gBox.replaceChildren(...[
      h('p', { class: 'gstat g-' + c.state, text: c.message || (c.connected ? 'Signed in.' : 'Sign in with Google to keep your progress in your Google account and pick it up on any device.') }),
      c.connected && detail ? h('p', { class: 'hint', text: detail.charAt(0).toUpperCase() + detail.slice(1) }) : null,
      h('div', { class: 'btnrow' },
        c.connected
          ? h('button', { class: 'btn primary', disabled: busy, onclick: () => cloud().syncNow({ manual: true }).then(() => toast('Synced with Google')).catch((e) => toast(e.message)) }, busy ? 'Syncing…' : 'Sync now')
          : h('button', { class: 'btn primary', id: 'st-gconnect', disabled: busy || !c.canSignIn, onclick: signIn }, 'Sign in with Google'),
        c.connected ? h('button', { class: 'btn', id: 'st-history-btn', 'aria-expanded': histBox.hidden ? 'false' : 'true',
          onclick: () => { if (histBox.hidden) loadHistory(); else histBox.hidden = true; drawGoogle(); } }, 'Version history') : null,
        c.connected ? h('button', { class: 'btn ghost', onclick: () => cloud().disconnect().then(() => { histBox.hidden = true; toast('Signed out of Google sync'); }) }, 'Sign out') : null),
      c.connected ? histBox : null,
      h('p', { class: 'hint', text: 'Stored in a private app folder in your Google Drive (it doesn’t show up in your Drive files), kept apart from ThunderShadow’s data.' }),
      !c.connected && !c.canSignIn ? h('p', { class: 'hint', text: 'Google sign-in works on the published site: ' + c.returnUrl }) : null].filter(Boolean));
  };

  // appearance
  const theme = h('div', { class: 'seg mode', role: 'group', 'aria-label': 'Theme' });
  const drawTheme = () => theme.replaceChildren(...[['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) =>
    h('button', { 'aria-pressed': p().theme === k ? 'true' : 'false', onclick: () => { state.prefs.theme = k; applyTheme(); save(); drawTheme(); } }, l)));
  const artView = h('div', { class: 'seg mode', role: 'group', 'aria-label': 'Articles layout' });
  const drawArtView = () => artView.replaceChildren(...[['grid', 'Grid'], ['list', 'List']].map(([k, l]) =>
    h('button', { 'aria-pressed': p().artView === k ? 'true' : 'false', onclick: () => { state.prefs.artView = k; save(); drawArtView(); } }, l)));

  // qbanks
  const qbList = h('div', { class: 'set-list' });
  const drawQb = () => qbList.replaceChildren(...qbStats().banks.map((b) => h('div', { class: 'set-row' },
    h('div', null, h('b', { text: b.qb.name }), h('small', { text: [b.bank ? fmtN(b.bank) + ' questions' : 'bank size not set', b.pctDone != null ? fmtPct(b.pctDone) + ' done' : '', b.acc != null ? fmtPct(b.acc) + ' correct' : '', b.finished ? 'finished ' + fmtDate(b.qb.finished) : ''].filter(Boolean).join(' · ') })),
    h('button', { class: 'btn', 'data-open': 'qb-' + b.qb.id, onclick: () => openQbank(b.qb) }, 'Edit'))),
    h('div', { class: 'btnrow' }, h('button', { class: 'btn ghost', 'data-open': 'qb-new', onclick: () => openQbank(null) }, '+ Add a qbank')));

  // extras: hidden sections, shown with a code
  const exBox = h('div', { class: 'set-body', id: 'st-extras' });
  let exShown = null;
  const drawExtras = () => {
    if (exShown === passiveOn()) return; // redraw only when it changes, so typing isn't interrupted
    exShown = passiveOn();
    if (exShown) {
      exBox.replaceChildren(h('div', { class: 'set-row' },
        h('div', null, h('b', { text: 'Passive study' }), h('small', { text: 'Divine Intervention podcasts and PHYSEO, as a tab · on for your devices that sync' })),
        h('div', { class: 'btnrow' },
          h('button', { class: 'btn', onclick: () => showTab('passive', true) }, 'Open'),
          h('button', { class: 'btn ghost', id: 'st-lock', onclick: () => { state.prefs.passive = false; save(); render(); toast('Passive study hidden — your progress is kept'); } }, 'Hide'))));
      return;
    }
    const code = h('input', { type: 'text', id: 'st-code', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Code', 'aria-label': 'Code' });
    const err = h('p', { class: 'err-line', role: 'alert' });
    const unlock = () => {
      if (!codeOk(code.value)) { err.textContent = 'That code doesn’t unlock anything.'; code.select(); return; }
      state.prefs.passive = true; save(); render();
      toast('Passive study unlocked — it’s now a tab');
    };
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
    code.addEventListener('input', () => { err.textContent = ''; });
    exBox.replaceChildren(h('div', { class: 'code-row' }, code, h('button', { class: 'btn', id: 'st-unlock', onclick: unlock }, 'Unlock')), err);
  };

  // backup
  const backupNote = h('p', { class: 'hint' });
  const drawBackup = () => {
    const lb = p().lastBackup;
    backupNote.textContent = (lb ? 'Last backup ' + fmtDate(lb.slice(0, 10)) + '. ' : 'No backup file yet. ') + 'Backups are JSON files you can import on any device. CSV opens in Excel or Sheets.';
  };
  const persistNote = h('p', { class: 'hint' });
  const persistBtn = h('button', { class: 'btn', hidden: true, onclick: async () => {
    try { await navigator.storage.persist(); } catch (e) {}
    checkPersist();
  } }, 'Protect from clearing');
  const checkPersist = async () => {
    if (!navigator.storage || !navigator.storage.persisted) { persistNote.textContent = 'Your browser decides how long site data is kept — sign in with Google or export backups.'; return; }
    const ok = await navigator.storage.persisted().catch(() => false);
    persistNote.textContent = ok ? 'This browser has agreed to keep your data unless you clear it yourself.' : 'The browser may clear site data when space runs low. Ask it to keep your data, and sign in with Google or export backups.';
    persistBtn.hidden = ok;
  };
  checkPersist();

  // danger zone
  let armTimer = null;
  const resetBtn = h('button', { class: 'btn ghost danger', onclick: () => {
    if (!resetBtn.dataset.arm) {
      resetBtn.dataset.arm = '1'; resetBtn.textContent = 'Tap again to erase everything';
      armTimer = setTimeout(() => { delete resetBtn.dataset.arm; resetBtn.textContent = 'Erase all data'; }, 4000);
      return;
    }
    clearTimeout(armTimer);
    delete resetBtn.dataset.arm; resetBtn.textContent = 'Erase all data';
    const undo = snapshot();
    const theme = state.prefs.theme, passive = state.prefs.passive;
    setState(blank()); state.prefs.theme = theme; state.prefs.passive = passive; // display settings stay
    stampAll(state, Date.now());
    save(); render(); refreshSheet();
    toast('All data erased', undo);
  } }, 'Erase all data');

  const keysDl = h('dl', { class: 'keys' });
  // the tab count changes when Passive study is unlocked
  const drawKeys = () => keysDl.replaceChildren(...[['1 – ' + tabsNow().length, 'Switch tabs'], [',', 'Open settings'], ['b', 'BlockFlow exam timer (Space pauses it there)'], ['t', 'Light / dark'], ['p', 'Print a one-page summary'], ['Esc', 'Close a panel, or leave settings'], ['← →', 'Move between tabs (when a tab is focused)']]
    .flatMap(([k, d]) => [h('dt', null, h('kbd', { text: k })), h('dd', { text: d })]));
  const SECTIONS = [
    ['set-plan', 'Plan'], ['set-sync', 'Google sync'], ['set-look', 'Appearance'], ['set-qbanks', 'Qbanks'],
    ['set-data', 'Backup & import'], ['set-extras', 'Extras'], ['set-keys', 'Shortcuts'], ['set-app', 'App version'], ['set-danger', 'Erase data'],
  ];
  const nav = h('nav', { class: 'set-nav', 'aria-label': 'Settings sections' }, SECTIONS.map(([id, label]) =>
    h('a', { href: '#settings', 'data-sec': id, onclick: (e) => { e.preventDefault(); const el = $(id); el.scrollIntoView({ block: 'start', behavior: 'smooth' }); el.focus({ preventScroll: true }); } }, label)));

  $('settings-body').replaceChildren(nav, h('div', { class: 'set-main' },
    card('set-plan', 'Plan', 'Your test date and the score you’re aiming for.',
      h('div', { class: 'two' }, h('div', { class: 'field' }, h('label', { for: 'st-exam', text: 'Test date' }), examIn), target.field), planNote),
    card('set-sync', 'Google sync', null, gBox),
    card('set-look', 'Appearance', 'Saved on this device only.',
      h('div', { class: 'set-row' }, h('div', null, h('b', { text: 'Theme' }), h('small', { text: 'Or press t, or use the button in the header.' })), theme),
      h('div', { class: 'set-row' }, h('div', null, h('b', { text: 'AMBOSS articles layout' }), h('small', { text: 'Grid fits more articles on screen.' })), artView)),
    card('set-qbanks', 'Qbanks', 'Bank sizes and the progress you’d made before logging sessions here.', qbList),
    card('set-data', 'Backup & import', null, backupNote,
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn primary', id: 'st-export', onclick: exportJson }, 'Export backup'),
        h('button', { class: 'btn', onclick: exportCsv }, 'Export CSV'),
        h('button', { class: 'btn', onclick: () => $('import').click() }, 'Import backup'),
        h('button', { class: 'btn', id: 'st-print', onclick: printSummary }, 'Print summary')),
      h('div', { class: 'btnrow' }, h('button', { class: 'btn', 'data-open': 'sim-import', onclick: () => $('sim-import').click() }, 'Import from Exam Simulator')),
      h('p', { class: 'hint', text: 'Exam Simulator import reads its progress backup (.zip) and fills in finished NBME, UWSA and CMS forms. You see what changes before anything is saved.' }),
      persistNote, h('div', { class: 'btnrow' }, persistBtn)),
    card('set-extras', 'Extras', 'Optional sections, hidden until you enter their code.', exBox),
    card('set-keys', 'Keyboard shortcuts', null, keysDl),
    card('set-app', 'App version', null,
      h('p', { class: 'hint', text: 'Version ' + APP_VERSION + '. The app checks for a new version each time it opens and shows “Reload” when one is ready. If this device still shows an old version, reload it here — your progress, your Google sign-in and ThunderShadow’s data on the same site are not touched.' }),
      h('div', { class: 'btnrow' }, h('button', { class: 'btn', id: 'st-reload', onclick: reloadLatest }, 'Reload latest version'))),
    card('set-danger', 'Erase data', 'Erases every score, note, session and article tick in this browser — and in your Google account if you’re signed in. You can undo right after.',
      h('div', { class: 'btnrow' }, resetBtn)),
    h('p', { class: 'hint set-about' }, 'Thunder tracker · your data stays in this browser and, if you sign in, your own Google Drive. ',
      h('a', { href: 'https://github.com/dawnsommer/thundertracker', target: '_blank', rel: 'noopener noreferrer', text: 'Source on GitHub' }))));
  // make the section cards focus targets for the nav
  SECTIONS.forEach(([id]) => $(id).setAttribute('tabindex', '-1'));

  settingsRefresh = () => {
    const a = document.activeElement;
    if (a !== examIn) examIn.value = p().examDate;
    if (a !== target.inp) target.inp.value = p().target;
    drawPlan(); drawGoogle(); drawTheme(); drawArtView(); drawQb(); drawBackup(); drawExtras(); drawKeys();
  };
  settingsRefresh();
  const f = ui.settingsFocus; ui.settingsFocus = '';
  setTimeout(() => {
    const el = f ? document.querySelector(f) : null;
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } else $('settings-h').focus();
  }, 0);
}
export function signIn() {
  if (!cloud()) return;
  Promise.resolve(cloud().connect()).then(() => { if (cloud().status().connected) toast('Signed in with Google'); })
    .catch((e) => { if (e.refused) { toast('Google sign-in isn’t available yet — details in Settings'); if (ui.tab !== 'settings') openSettings('#st-google'); } else toast(e.message); });
}
export const leaveSettings = () => showTab(ui.prevTab && ui.prevTab !== 'settings' ? ui.prevTab : 'overview', true);
$('open-settings').addEventListener('click', () => (ui.tab === 'settings' ? leaveSettings() : openSettings()));
$('settings-back').addEventListener('click', leaveSettings);
$('foot-settings').addEventListener('click', () => openSettings());

export function setSettingsRefresh(f) { settingsRefresh = f; }
