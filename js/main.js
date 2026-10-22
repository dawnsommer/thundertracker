// Entry point: keyboard shortcuts and start-up. Loads every other module.

import { clone } from './util.js?v=16';
import { merge, norm, same } from './model.js?v=16';
import { applyTheme, cloud, cycleTheme, flush, load, paintStatus, persistQuiet, saveTimer, setSave, setSaved, setState, state, storageOk, toast, ui } from './store.js?v=16';
import { closeSheet, refreshSheet, sheetOpen } from './sheets.js?v=16';
import { render, renderNotice, showTab, tabsNow, VIEWS } from './shell.js?v=16';
import { drawTrend } from './overview.js?v=16';
import { leaveSettings, openSettings, settingsRefresh } from './settings.js?v=16';

import './data.js?v=16';
import './assessments.js?v=16';
import './cms.js?v=16';
import './systems.js?v=16';
import './articles.js?v=16';
import './qbank.js?v=16';
import './sim-import.js?v=16';
import './backup.js?v=16';
import './updates.js?v=16';
import './calculator.js?v=16';
import './planner.js?v=16';
import './passive.js?v=16';
import { printSummary } from './print.js?v=16';

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
  // only the header and the settings page show sync status; side sheets aren't redrawn for it
  cloud().subscribe(() => { paintStatus(); if (settingsRefresh) settingsRefresh(); });
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
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });
