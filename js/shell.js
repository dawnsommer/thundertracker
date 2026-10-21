// Tabs, routing and the top-level render.

import { $, fmtK, h, sum } from './util.js?v=9';
import { TABS } from './catalog.js?v=9';
import { state, storageMsg, sysItem, ui } from './store.js?v=9';
import { allArticles, allCms, allSystems, allTests, artItem, taken } from './data.js?v=9';
import { closeSheet, sheetOpen } from './sheets.js?v=9';
import { renderOverview } from './overview.js?v=9';
import { renderTests } from './assessments.js?v=9';
import { renderCms } from './cms.js?v=9';
import { renderSystems } from './systems.js?v=9';
import { renderArticles } from './articles.js?v=9';
import { renderQbank } from './qbank.js?v=9';
import { buildSettings, setSettingsRefresh, settingsRefresh } from './settings.js?v=9';

export const VIEWS = TABS.concat('settings');
export function showTab(t, push) {
  if (!VIEWS.includes(t)) t = 'overview';
  const entering = t === 'settings' && ui.tab !== 'settings';
  if (t !== 'settings') setSettingsRefresh(null);
  ui.tab = t;
  $('open-settings').setAttribute('aria-pressed', t === 'settings' ? 'true' : 'false');
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === t;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on || (t === 'settings' && b.dataset.tab === ui.prevTab) ? 0 : -1;
  });
  document.querySelectorAll('section.view').forEach((s) => (s.hidden = s.id !== 'view-' + t));
  if (push && location.hash !== '#' + t) try { history.pushState(null, '', '#' + t); } catch (e) {}
  if (entering) { buildSettings(); window.scrollTo(0, 0); }
  render();
}
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) showTab(b.dataset.tab, true); });
$('tabs').addEventListener('keydown', (e) => {
  const i = TABS.indexOf(ui.tab);
  const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
  if (j == null) return;
  e.preventDefault();
  const t = TABS[(j + TABS.length) % TABS.length];
  showTab(t, true);
  $('tab-' + t).focus();
});
window.addEventListener('popstate', () => {
  const t = location.hash.slice(1) || 'overview';
  if (sheetOpen) closeSheet();
  if (t === 'settings' && ui.tab !== 'settings') ui.prevTab = ui.tab;
  if (t !== ui.tab) showTab(t);
});

export function render() {
  renderCounts();
  if (ui.tab === 'overview') renderOverview();
  if (ui.tab === 'nbme') renderTests();
  if (ui.tab === 'cms') renderCms();
  if (ui.tab === 'systems') renderSystems();
  if (ui.tab === 'qbank') renderQbank();
  if (ui.tab === 'articles') renderArticles();
  if (ui.tab === 'settings' && settingsRefresh) settingsRefresh();
}
export function renderNotice() {
  $('notice').replaceChildren(...(storageMsg ? [h('div', { class: 'banner', style: 'margin-bottom:20px', text: storageMsg })] : []));
}

export function renderCounts() {
  const tests = allTests();
  $('ct-nbme').textContent = tests.filter(taken).length + '/' + tests.length;
  const cms = allCms();
  $('ct-cms').textContent = cms.filter(taken).length + '/' + cms.length;
  const sy = allSystems();
  $('ct-sys').textContent = sy.filter((s) => sysItem(s.id).status === 3).length + '/' + sy.length;
  const q = sum(state.log.map((e) => e.q));
  $('ct-qb').textContent = q ? fmtK(q) : '';
  const arts = allArticles();
  $('ct-art').textContent = arts.filter((a) => artItem(a.id).reads > 0).length + '/' + arts.length;
}
