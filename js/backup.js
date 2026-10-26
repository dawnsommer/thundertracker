// Backup export/import and CSV export.

import { $, h, today } from './util.js?v=22';
import { FORM_ST, GROUPS, PASSES, SUBJ, SYS_ST } from './catalog.js?v=22';
import { norm, stampAll } from './model.js?v=22';
import { applyTheme, cloud, flush, item, save, setState, snapshot, state, sysItem, toast } from './store.js?v=22';
import { allSystems, artItem, bankStats, cmsForms, testForms, weakNames } from './data.js?v=22';
import { refreshSheet } from './sheets.js?v=22';
import { render } from './shell.js?v=22';
import { orderedSections } from './articles.js?v=22';
import { importSimulator } from './sim-import.js?v=22';

export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportJson() {
  state.prefs.lastBackup = new Date().toISOString();
  flush();
  download('ck-tracker-backup-' + today() + '.json', JSON.stringify(Object.assign({ app: 'ck-tracker', exported: state.prefs.lastBackup }, state), null, 2), 'application/json');
  render(); refreshSheet();
  toast('Backup downloaded');
}
export function exportCsv() {
  const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['type', 'group', 'name', 'status', 'score_3digit', 'percent_correct', 'questions', 'date', 'notes', 'weak_systems']];
  GROUPS.forEach((g) => testForms(g, true).forEach((f) => {
    const it = item(f.id);
    rows.push(['assessment', g.short, f.label, FORM_ST[it.status], g.scaled ? it.score : '', it.pct, f.qs, it.date, it.notes, weakNames(it.weak)]);
  }));
  SUBJ.forEach((s) => cmsForms(s, true, true).forEach((f) => {
    const it = item(f.id);
    if (!f.removed || it.status) rows.push(['cms', s.name, f.label, FORM_ST[it.status], '', it.score, 50, it.date, it.notes]);
  }));
  allSystems().forEach((sy) => {
    const it = sysItem(sy.id);
    rows.push(['system', '', sy.name, SYS_ST[it.status] + (it.conf ? ' · confidence ' + it.conf + '/5' : ''), '', it.uw, '', '', [it.tags.join(' / '), it.notes].filter(Boolean).join(' · ')]);
  });
  state.qbanks.map(bankStats).forEach((b) => rows.push(['qbank-total', b.qb.name, b.bank ? 'bank of ' + b.bank : '', '', '', b.acc != null ? Math.round(b.acc * 10) / 10 : '',
    b.done != null ? b.done : '', b.qb.finished, [b.pctDone != null ? Math.round(b.pctDone) + '% done' : '', b.finished ? 'finished' : ''].filter(Boolean).join(' · '), weakNames(b.qb.weak || [])]));
  state.log.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => rows.push(['qbank', e.src, '', '', '', e.pct, e.q, e.date, e.note]));
  orderedSections().forEach((sec) => sec.articles.forEach((ar) => {
    const it = artItem(ar.id);
    rows.push(['article', sec.name, ar.name, it.reads + '/' + PASSES + ' read-throughs', '', '', '', it.date, it.notes]);
  }));
  download('ck-tracker-' + today() + '.csv', '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv');
  toast('CSV downloaded');
}
$('import').addEventListener('change', () => {
  const inp = $('import'), file = inp.files && inp.files[0];
  if (!file) return;
  if (/\.zip$/i.test(file.name) || /zip/.test(file.type)) { inp.value = ''; importSimulator([file]); return; }
  const r = new FileReader();
  r.onload = () => {
    inp.value = '';
    let data = null;
    try { data = JSON.parse(r.result); } catch (e) {}
    if (data && /^StepExamSimulator/.test(data.fileType || '')) { importSimulator([file]); return; }
    if (!data || typeof data !== 'object' || !('items' in data)) { toast('That file isn’t a tracker backup.'); return; }
    const undo = snapshot();
    const theme = state.prefs.theme;
    setState(norm(data));
    state.prefs.theme = theme;
    stampAll(state, Date.now());
    applyTheme(); save(); render(); refreshSheet();
    toast(cloud() && cloud().status().connected ? 'Backup restored — it replaces the copy in your Google account too' : 'Backup restored', undo);
  };
  r.readAsText(file);
});
