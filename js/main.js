// Entry point: keyboard shortcuts and start-up. Loads every other module.

import { $, clone, today } from './util.js?v=13';
import { merge, norm, same } from './model.js?v=13';
import { applyTheme, cloud, cycleTheme, flush, load, paintStatus, persistQuiet, saveTimer, setSave, setSaved, setState, state, storageOk, toast, ui } from './store.js?v=13';
import { closeSheet, refreshSheet, sheetOpen } from './sheets.js?v=13';
import { render, renderNotice, showTab, tabsNow, VIEWS } from './shell.js?v=13';
import { drawTrend } from './overview.js?v=13';
import { leaveSettings, openSettings } from './settings.js?v=13';

import './data.js?v=13';
import './assessments.js?v=13';
import './cms.js?v=13';
import './systems.js?v=13';
import './articles.js?v=13';
import './qbank.js?v=13';
import './sim-import.js?v=13';
import './backup.js?v=13';
import './updates.js?v=13';
import './calculator.js?v=13';
import './planner.js?v=13';
import './passive.js?v=13';
import { printSummary } from './print.js?v=13';

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetOpen) { closeSheet(); return; }
  if (e.key === 'Escape' && ui.tab === 'settings' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { leaveSettings(); return; }
  if (sheetOpen || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const tabs = tabsNow();
  if (e.key >= '1' && e.key <= String(tabs.length)) { showTab(tabs[Number(e.key) - 1], true); }
  else if (e.key === ',') { e.preventDefault(); if (ui.tab !== 'settings') openSettings(); }
  else if (e.key === 't') cycleTheme();
  else if (e.key === 'p') printSummary();
});

setState(load());
setSaved(clone(state));
applyTheme();
renderNotice();
setSave(storageOk ? '' : 'off', storageOk ? 'Saved on this device' : 'Not saved — storage blocked');
export const hash = location.hash.slice(1);
showTab(VIEWS.includes(hash) ? hash : 'overview');
if (cloud()) {
  cloud().subscribe(() => { paintStatus(); refreshSheet(); });
  cloud().init({
    flush: () => { if (saveTimer) flush(); },
    getState: () => clone(state),
    norm, merge, same,
    // Merge again with the live state so edits made while the sync was in flight are kept.
    applyRemote: (next) => {
      if (saveTimer) flush();
      const m = merge(state, next);
      if (same(m, state)) return;
      setState(m);
      persistQuiet(); applyTheme(); render(); refreshSheet();
    },
  });
  if (cloud().justConnected()) toast('Signed in with Google — syncing your progress');
}
export let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (ui.tab === 'overview') drawTrend(); }, 150); });
// re-render after midnight so countdowns and "today" stay right
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (!$('lg-date').value) $('lg-date').value = today(); render(); } });
