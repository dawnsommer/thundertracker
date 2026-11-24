// The Settings page.

import { $, daysUntil, fmtDate, fmtLong, fmtN, fmtPct, h, isDate, plural, svgIcon } from './util.js?v=33';
import { APP_VERSION } from './catalog.js?v=33';
import { blank, norm, stampAll } from './model.js?v=33';
import { applyTheme, cloud, save, setState, snapshot, state, toast, ui } from './store.js?v=33';
import { qbStats } from './data.js?v=33';
import { numField, refreshSheet } from './sheets.js?v=33';
import { render, showTab, tabsNow } from './shell.js?v=33';
import { openQbank } from './qbank.js?v=33';
import { exportCsv, exportJson } from './backup.js?v=33';
import { reloadLatest } from './updates.js?v=33';
import { printSummary } from './print.js?v=33';
import { codeOk, passiveOn } from './passive.js?v=33';
import { ambossOn } from './amboss.js?v=33';
import { blockName, blockOn, defaultLayout, ovLayout, spans } from './layout.js?v=33';

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

  // home page: a small map of the overview; drag to reorder, tap the width or the eye
  const layMap = h('div', { class: 'lay-map', id: 'st-layout', role: 'list', 'aria-label': 'Overview blocks, in order' });
  const layNote = h('p', { class: 'hint' });
  const layTray = h('div', { class: 'lay-tray', id: 'st-lay-hidden' });
  const layReset = h('button', { class: 'btn ghost', id: 'st-lay-reset', onclick: () => { const undo = state.prefs.ovLayout; state.prefs.ovLayout = null; save(); drawLayout(); toast('Home page reset', () => { state.prefs.ovLayout = undo; save(); drawLayout(); }); } }, 'Reset');
  const ICON = {
    grip: svgIcon('<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>'),
    full: svgIcon('<rect x="3" y="7" width="18" height="10" rx="2"/>'),
    half: svgIcon('<rect x="3" y="7" width="8" height="10" rx="2"/><rect x="13" y="7" width="8" height="10" rx="2" stroke-dasharray="2 2.5"/>'),
    eye: svgIcon('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    off: svgIcon('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1"/>'),
  };
  let dragging = null;
  const setLayout = (list) => { state.prefs.ovLayout = list; save(); };
  // put the blocks you can see in a new order; blocks for extras that are off keep their place
  const reorder = (keys) => {
    const full = ovLayout(), res = keys.map((k) => full.find((r) => r.k === k));
    full.forEach((r, i) => {
      if (keys.includes(r.k)) return;
      const prev = full.slice(0, i).reverse().find((x) => res.includes(x));
      res.splice(prev ? res.indexOf(prev) + 1 : 0, 0, r);
    });
    return res;
  };
  const sizeMap = () => {
    const els = [...layMap.children], list = ovLayout(), sp = spans(els.map((el) => list.find((r) => r.k === el.dataset.k)));
    els.forEach((el) => el.style.setProperty('--span', sp.get(el.dataset.k)));
  };
  // move a block's tile, animating the others to their new places
  const flip = (fn) => {
    const els = [...layMap.children], before = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
    fn(); sizeMap();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const el of els) {
      if (el.classList.contains('drag')) continue;
      const a = before.get(el), b = el.getBoundingClientRect();
      if (Math.abs(a.left - b.left) + Math.abs(a.top - b.top) + Math.abs(a.width - b.width) < 1) continue;
      el.animate([{ transform: `translate(${a.left - b.left}px,${a.top - b.top}px)`, width: a.width + 'px' }, { transform: 'none', width: b.width + 'px' }], { duration: 180, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
  };
  const startDrag = (e, el) => {
    if (e.button > 0) return;
    e.preventDefault();
    dragging = el; el.classList.add('drag');
    let last = 0;
    const move = (ev) => {
      const t = document.elementFromPoint(ev.clientX, ev.clientY), over = t && t.closest('.lay-b');
      if (!over || over === el || over.parentElement !== layMap || ev.timeStamp - last < 140) return;
      last = ev.timeStamp;
      const kids = [...layMap.children], after = kids.indexOf(over) > kids.indexOf(el);
      flip(() => layMap.insertBefore(el, after ? over.nextSibling : over));
    };
    const end = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
      el.classList.remove('drag'); dragging = null;
      const keys = [...layMap.children].map((x) => x.dataset.k);
      if (keys.join() !== ovLayout().filter((r) => blockOn(r.k) && !r.hide).map((r) => r.k).join()) setLayout(reorder(keys));
      drawLayout();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
  };
  const drawLayout = (focusK, focusCls) => {
    if (dragging) return;
    const all = ovLayout(), on = all.filter((r) => blockOn(r.k)), list = on.filter((r) => !r.hide), sp = spans(list);
    const patch = (k, f) => { setLayout(all.map((r) => (r.k === k ? Object.assign({}, r, f(r)) : r))); drawLayout(k, document.activeElement && document.activeElement.className); };
    layMap.replaceChildren(...list.map((r, i) => {
      const nm = blockName(r.k);
      const grip = h('button', { class: 'lay-g', type: 'button', 'aria-label': 'Move ' + nm + ' — drag, or use the arrow keys', title: 'Drag to move',
        onkeydown: (e) => {
          const d = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
          if (!d || i + d < 0 || i + d >= list.length) return;
          e.preventDefault();
          const keys = list.map((x) => x.k); [keys[i], keys[i + d]] = [keys[i + d], keys[i]];
          setLayout(reorder(keys)); drawLayout(r.k, 'lay-g');
        } });
      grip.innerHTML = ICON.grip;
      const el = h('div', { class: 'lay-b', role: 'listitem', 'data-k': r.k, style: '--span:' + sp.get(r.k) },
        grip, h('span', { class: 'lay-n', text: nm }));
      const wb = h('button', { class: 'lay-w', type: 'button', 'aria-pressed': String(r.w === 'full'), 'aria-label': 'Full width: ' + nm, title: r.w === 'full' ? 'Full width — tap for half' : 'Half width — tap for full', onclick: () => patch(r.k, (x) => ({ w: x.w === 'full' ? 'half' : 'full' })) });
      wb.innerHTML = r.w === 'full' ? ICON.full : ICON.half;
      const eb = h('button', { class: 'lay-e', type: 'button', 'aria-label': 'Hide ' + nm, title: 'Hide', onclick: () => { patch(r.k, () => ({ hide: true })); const n = layTray.querySelector(`[data-k="${r.k}"]`); if (n) n.focus(); } });
      eb.innerHTML = ICON.eye;
      el.append(wb, eb);
      grip.addEventListener('pointerdown', (e) => startDrag(e, el));
      return el;
    }));
    // hidden blocks wait in a tray under the map; tap one to bring it back where it was
    const hid = on.filter((r) => r.hide);
    layTray.hidden = !hid.length;
    layTray.replaceChildren(h('span', { class: 'lay-tl', text: 'Hidden' }), ...hid.map((r) => {
      const b = h('button', { class: 'lay-chip', type: 'button', 'data-k': r.k, 'aria-label': 'Show ' + blockName(r.k), title: 'Tap to show', onclick: () => { patch(r.k, () => ({ hide: false })); const n = layMap.querySelector(`[data-k="${r.k}"] .lay-e`); if (n) n.focus(); } });
      b.innerHTML = ICON.off; b.append(h('span', { text: blockName(r.k) }));
      return b;
    }));
    layNote.textContent = list.length ? 'Halves share a row on wider screens.' : 'Everything is hidden — tap a block to show it.';
    layReset.disabled = JSON.stringify(all) === JSON.stringify(defaultLayout());
    if (focusK) { const f = layMap.querySelector(`[data-k="${focusK}"] .${(focusCls || 'lay-g').split(' ')[0]}`); if (f) f.focus(); }
  };

  // extras: hidden sections, shown with a code
  const exBox = h('div', { class: 'set-body', id: 'st-extras' });
  let exShown = null;
  const drawExtras = () => {
    const key = passiveOn() + ',' + ambossOn();
    if (exShown === key) return; // redraw only when it changes, so typing isn't interrupted
    exShown = key;
    if (passiveOn() || ambossOn()) {
      // once unlocked, each extra has its own switch; hiding both brings the code back
      const row = (id, name, about, on, tab, set) => h('div', { class: 'set-row', id: 'st-ex-' + id },
        h('div', null, h('b', { text: name }), h('small', { text: about })),
        h('div', { class: 'btnrow' }, on
          ? [h('button', { class: 'btn', onclick: () => showTab(tab, true) }, 'Open'),
            h('button', { class: 'btn ghost', id: id === 'passive' ? 'st-lock' : 'st-amb-hide', onclick: () => { set(false); save(); render(); toast(name + ' hidden' + (id === 'passive' ? ' — your progress is kept' : '')); } }, 'Hide')]
          : h('button', { class: 'btn', id: 'st-' + id + '-show', onclick: () => { set(true); save(); render(); toast(name + ' is on — it’s now a tab'); } }, 'Show')));
      exBox.replaceChildren(
        row('passive', 'Passive study', 'Divine Intervention podcasts and PHYSEO, as a tab · on for your devices that sync', passiveOn(), 'passive', (v) => { state.prefs.passive = v; }),
        row('amboss', 'AMBOSS tracker', 'Your AMBOSS block accuracy, misses and review questions, as a tab and an overview card · read from your AMBOSS tracker page', ambossOn(), 'amboss', (v) => { state.prefs.amboss = v; }));
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
    const { theme, passive, amboss, ovLayout: lay } = state.prefs;
    setState(blank()); Object.assign(state.prefs, { theme, passive, amboss, ovLayout: lay }); // display settings stay
    stampAll(state, Date.now());
    save(); render(); refreshSheet();
    toast('All data erased', undo);
  } }, 'Erase all data');

  const keysDl = h('dl', { class: 'keys' });
  // the tab count changes when Passive study is unlocked
  const drawKeys = () => keysDl.replaceChildren(...[['1 – ' + tabsNow().length, 'Switch tabs'], [',', 'Open settings'], ['b', 'BlockFlow exam timer (Space pauses it there)'], ['t', 'Light / dark'], ['p', 'Print a one-page summary'], ['Esc', 'Close a panel, or leave settings'], ['← →', 'Move between tabs (when a tab is focused)']]
    .flatMap(([k, d]) => [h('dt', null, h('kbd', { text: k })), h('dd', { text: d })]));
  const SECTIONS = [
    ['set-plan', 'Plan'], ['set-sync', 'Google sync'], ['set-look', 'Appearance'], ['set-home', 'Home page'], ['set-qbanks', 'Qbanks'],
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
    card('set-home', 'Home page', 'Arrange the overview: drag a block to move it, tap the width or the eye. Saved on this device.',
      layMap, layTray, h('div', { class: 'lay-foot' }, layNote, layReset)),
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
    drawPlan(); drawGoogle(); drawTheme(); drawArtView(); if (!layMap.contains(document.activeElement) && !layTray.contains(document.activeElement)) drawLayout(); drawQb(); drawBackup(); drawExtras(); drawKeys();
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
