// Importing a Step Exam Simulator progress backup.

import { $, arr, fmtDate, fmtPct, h, num, obj, plural, slug, str, sum, today } from './util.js?v=19';
import { GROUPS, SUBJ } from './catalog.js?v=19';
import { item, save, snapshot, state, toast } from './store.js?v=19';
import { closeSheet, openSheet, sheetHead } from './sheets.js?v=19';

// Reads the Step Exam Simulator's progress backup (a .zip of <form>_progress_save.json files plus
// progress_metadata.json, or those JSON files picked directly) and fills in the matching tracker forms.
// It only adds: empty fields are filled, status is raised to at least "Taken", and nothing is
// overwritten unless you ask. Custom question sets can become qbank sessions.
export const SIM_SUBJ = { IM: 'med', MED: 'med', SURG: 'surg', PEDS: 'peds', OBGYN: 'obgyn', PSYCH: 'psych', NEURO: 'neuro', FM: 'fm', EM: 'em' };

// Minimal zip reader: central directory + stored/deflate entries (what the simulator writes).
export async function readZip(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('That file isn’t a zip archive.');
  const count = dv.getUint16(end + 10, true);
  const entries = [];
  for (let i = 0, q = dv.getUint32(end + 16, true); i < count; i++) {
    if (dv.getUint32(q, true) !== 0x02014b50) throw new Error('The zip archive looks damaged.');
    const nameLen = dv.getUint16(q + 28, true);
    entries.push({ name: new TextDecoder().decode(buf.subarray(q + 46, q + 46 + nameLen)), method: dv.getUint16(q + 10, true),
      size: dv.getUint32(q + 20, true), at: dv.getUint32(q + 42, true) });
    q += 46 + nameLen + dv.getUint16(q + 30, true) + dv.getUint16(q + 32, true);
  }
  const read = async (en) => {
    const start = en.at + 30 + dv.getUint16(en.at + 26, true) + dv.getUint16(en.at + 28, true);
    const data = buf.subarray(start, start + en.size);
    if (en.method === 0) return new TextDecoder().decode(data);
    if (en.method !== 8) throw new Error('Unsupported compression in ' + en.name + '.');
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t open zip files. Unzip the backup and pick the .json files inside instead.');
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  };
  return { entries, read };
}

export async function readSimFiles(files) {
  const out = { docs: {}, scores: {}, suspended: new Set(), names: [] };
  const take = (name, text) => {
    let j = null;
    try { j = JSON.parse(text); } catch (e) { return; }
    const type = j && typeof j.fileType === 'string' ? j.fileType : '';
    if (type === 'StepExamSimulatorProgressMetadata') arr(j.forms).forEach((f) => { if (f && typeof f.formId === 'string') out.scores[f.formId] = num(f.threeDigitScore); });
    else if (/^StepExamSimulator.*ProgressBundle$/.test(type)) out.docs[str(j.formSlot, 60) || name] = j;
  };
  const suspendedId = (name) => (/([^/]+)_suspended_test\.json$/i.exec(name) || [])[1];
  for (const f of files) {
    out.names.push(f.name);
    if (/\.zip$/i.test(f.name) || /zip/.test(f.type)) {
      const z = await readZip(f);
      for (const en of z.entries) {
        if (!/\.json$/i.test(en.name) || /QBANK_MODE/i.test(en.name)) continue;
        const sid = suspendedId(en.name);
        if (sid) { out.suspended.add(sid); continue; }
        take(en.name, await z.read(en));
      }
    } else {
      const sid = suspendedId(f.name);
      if (sid) out.suspended.add(sid); else take(f.name, await f.text());
    }
  }
  return out;
}

// First finished attempt (first-pass performance); falls back to the current session.
export function simResult(doc) {
  const atts = arr(obj(doc.bundle).attempts).filter((a) => a && a.session);
  const att = atts.find((a) => a.type === 'initial' && a.completedAt) || atts.find((a) => a.completedAt);
  const ses = obj(att ? att.session : doc.session);
  const res = arr(ses.results).filter((r) => r && Number(r.total) > 0);
  const total = sum(res.map((r) => Number(r.total))), correct = sum(res.map((r) => Number(r.correct) || 0));
  const blocks = arr(ses.blocks).length;
  const done = total > 0 && (!!ses.completedAt || (blocks > 0 && res.length >= blocks));
  const when = ses.completedAt || (res.length ? res[res.length - 1].completedAt : '') || ses.startedAt || '';
  const d = new Date(when);
  return { total, correct, done, partial: !done && res.length > 0, attempt: str(ses.attemptId || (att && att.attemptId), 60),
    date: isNaN(d) ? '' : new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10),
    title: str(ses.libraryFormName || ses.title || doc.formSlot, 80).replace(/\s+—\s+All Questions$/, ''), retakes: atts.filter((a) => a.type && a.type !== 'initial').length };
}
export function simTarget(id, title) {
  let m;
  if ((m = /^N-?0*(\d{1,2})$/i.exec(id))) return { kind: 'test', g: GROUPS[0], n: +m[1] };
  if ((m = /^UWSA-?0*(\d)$/i.exec(id))) return { kind: 'test', g: GROUPS[1], n: +m[1] };
  if ((m = /^C-([A-Za-z]+)-0*(\d{1,2})$/.exec(id)) && SIM_SUBJ[m[1].toUpperCase()]) return { kind: 'cms', s: SUBJ.find((x) => x.key === SIM_SUBJ[m[1].toUpperCase()]), n: +m[2] };
  if (/free\s*-?\s*120|^f-?120/i.test(id + ' ' + title) && (m = /(20[1-4]\d)/.exec(id + ' ' + title))) return { kind: 'test', g: GROUPS[2], n: +m[1] };
  return null;
}
export function simPlan(src) {
  const rows = [];
  for (const id of new Set([...Object.keys(src.docs), ...src.suspended])) {
    const r = src.docs[id] ? simResult(src.docs[id]) : null;
    const row = { id, r, title: r ? r.title : id, score3: src.scores[id] != null && src.scores[id] >= 1 && src.scores[id] <= 300 ? Math.round(src.scores[id]) : null };
    const tgt = simTarget(id, row.title);
    if (!r || !r.done) Object.assign(row, { kind: 'skip', why: r && r.partial ? 'In progress' : 'Not finished', order: 3 });
    else if (tgt) {
      const fid = tgt.kind === 'cms' ? 'cms-' + tgt.s.key + '-' + tgt.n : tgt.g.key + '-' + tgt.n;
      const name = tgt.kind === 'cms' ? tgt.s.name + ' Form ' + tgt.n : tgt.g.full(tgt.n);
      Object.assign(row, { kind: 'form', tgt, fid, name, order: tgt.kind === 'cms' ? 1 + SUBJ.indexOf(tgt.s) / 100 : GROUPS.indexOf(tgt.g) / 100 });
    } else Object.assign(row, { kind: 'qbank', logId: ('sim-' + slug(id).slice(0, 24) + '-' + slug(r.attempt).slice(-12)).replace(/-+$/, ''), order: 2 });
    rows.push(row);
  }
  return rows.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, undefined, { numeric: true }));
}
// What importing one form row would change, given the current tracker state.
export function simChange(row, overwrite) {
  const { tgt, fid, r } = row, isCms = tgt.kind === 'cms', grp = isCms ? tgt.s : tgt.g;
  const cur = item(fid), pctKey = isCms ? 'score' : 'pct';
  const patch = {}, conflicts = [];
  const want = (k, v, label, fmt) => {
    if (v == null || v === '') return;
    if (cur[k] === '') patch[k] = v;
    else if (k === 'date' ? cur[k] !== v : num(cur[k]) !== num(v)) { conflicts.push(label + ': yours ' + fmt(cur[k]) + ', simulator ' + fmt(v)); if (overwrite) patch[k] = v; }
  };
  if (cur.status < 1) patch.status = 1;
  want(pctKey, String(Math.round(r.correct / r.total * 1000) / 10), '% correct', (v) => fmtPct(num(v)));
  if (!isCms && grp.scaled) want('score', row.score3 != null ? String(row.score3) : '', 'score', String);
  want('date', r.date, 'date', fmtDate);
  if (!cur.notes) patch.notes = 'Exam Simulator: ' + r.correct + '/' + r.total + ' correct' + (r.retakes ? ' (first attempt; ' + plural(r.retakes, 'retake') + ' not counted)' : '');
  const listed = isCms ? tgt.n <= grp.latest || (state.extraForms[grp.key] || []).includes(tgt.n) : grp.base.includes(tgt.n) || (state.extraAssess[grp.key] || []).includes(tgt.n);
  const hidden = state.removed.includes(fid);
  const fresh = !cur.status && !cur.score && !cur.pct && !cur.date;
  const changed = Object.keys(patch).some((k) => k !== 'notes') || (!!patch.notes && Object.keys(patch).length > 1) || !listed || hidden;
  return { patch, conflicts, listed, hidden, changed, fresh };
}
export function simLogEntry(row) {
  return { id: row.logId, date: row.r.date || today(), q: Math.min(5000, row.r.total), pct: String(Math.round(row.r.correct / row.r.total * 1000) / 10), src: 'Other', note: ('Exam Simulator · ' + row.title).slice(0, 200), t: 0 };
}
export function applySim(rows, opts) {
  let nForms = 0, nLog = 0;
  for (const row of rows) {
    if (row.kind === 'form') {
      const c = simChange(row, opts.overwrite);
      if (!c.changed) continue;
      const { tgt, fid } = row;
      if (!c.listed) {
        const list = tgt.kind === 'cms' ? state.extraForms : state.extraAssess, key = tgt.kind === 'cms' ? tgt.s.key : tgt.g.key;
        list[key] = [...new Set([...(list[key] || []), tgt.n])].sort((a, b) => a - b);
      }
      if (c.hidden) state.removed = state.removed.filter((x) => x !== fid);
      state.items[fid] = Object.assign({}, item(fid), c.patch);
      nForms++;
    } else if (row.kind === 'qbank' && opts.qbank && !state.log.some((e) => e.id === row.logId)) {
      state.log.push(simLogEntry(row));
      nLog++;
    }
  }
  return { nForms, nLog };
}

export async function importSimulator(files) {
  if (!files || !files.length) return;
  let src;
  try { src = await readSimFiles([...files]); }
  catch (e) { toast(e.message || 'Couldn’t read that file.'); return; }
  const rows = simPlan(src);
  if (!rows.length) { toast('No Exam Simulator progress found in that file.'); return; }
  openSimSheet(rows, src.names.join(', '));
}
$('sim-import').addEventListener('change', () => { const inp = $('sim-import'), files = [...(inp.files || [])]; inp.value = ''; importSimulator(files); });
$('sim-btn').addEventListener('click', () => $('sim-import').click());

export function openSimSheet(rows, fileName) {
  const opts = { overwrite: false, qbank: true };
  const forms = rows.filter((r) => r.kind === 'form'), sets = rows.filter((r) => r.kind === 'qbank'), skipped = rows.filter((r) => r.kind === 'skip');
  const list = h('div', { class: 'sim-list' });
  const go = h('button', { class: 'btn primary' });
  const resultText = (row) => [row.r.correct + '/' + row.r.total, fmtPct(row.r.correct / row.r.total * 100), row.score3, fmtDate(row.r.date)].filter(Boolean).join(' · ');
  const simRow = (name, sub, res, badge, cls, extra) => h('div', { class: 'sim-row' },
    h('div', { class: 'sim-nm' }, h('b', { text: name }), sub ? h('small', { text: sub }) : null, extra ? h('small', { class: 'sc-warn', text: extra }) : null),
    h('span', { class: 'sim-res', text: res }),
    h('span', { class: 'sim-badge ' + cls, text: badge }));
  const draw = () => {
    let count = 0;
    const formRows = forms.map((row) => {
      const c = simChange(row, opts.overwrite);
      if (c.changed) count++;
      const badge = !c.changed ? (c.conflicts.length ? 'Kept yours' : 'Up to date') : c.fresh ? (!c.listed ? 'New form' : 'New') : 'Update';
      const extra = c.conflicts.length ? c.conflicts.join(' · ') : !c.listed ? 'Adds ' + row.name + ' to your list' : c.hidden ? 'Unhides this form' : '';
      return simRow(row.name, row.title !== row.name ? row.title : '', resultText(row), badge, c.changed ? (c.fresh ? 'new' : 'upd') : c.conflicts.length ? 'warn' : 'same', extra);
    });
    const setRows = sets.map((row) => {
      const has = state.log.some((e) => e.id === row.logId);
      if (opts.qbank && !has) count++;
      return simRow(row.title, row.id, resultText(row), has ? 'Logged' : opts.qbank ? 'Qbank' : 'Skipped', has ? 'same' : opts.qbank ? 'new' : 'same');
    });
    const skipRows = skipped.map((row) => simRow(row.title, row.id, '', row.why, 'same'));
    list.replaceChildren(...[
      forms.length ? h('h3', { text: 'Assessments & CMS forms (' + forms.length + ')' }) : null, ...formRows,
      sets.length ? h('h3', { text: 'Custom question sets (' + sets.length + ')' }) : null, ...setRows,
      skipped.length ? h('h3', { text: 'Not imported (' + skipped.length + ')' }) : null, ...skipRows].filter(Boolean));
    go.disabled = !count;
    go.textContent = count ? 'Import ' + plural(count, 'change') : 'Nothing new to import';
  };
  const check = (label, key, hint) => {
    const inp = h('input', { type: 'checkbox' });
    inp.checked = opts[key];
    inp.addEventListener('change', () => { opts[key] = inp.checked; draw(); });
    return h('label', { class: 'switch sim-opt' }, inp, h('span', null, label, hint ? h('small', { class: 'muted', text: ' ' + hint }) : null));
  };
  go.addEventListener('click', () => {
    const undo = snapshot();
    const { nForms, nLog } = applySim(rows, opts);
    save(); closeSheet();
    toast('Imported ' + plural(nForms, 'form') + (nLog ? ' and ' + plural(nLog, 'qbank session') : '') + ' from the Exam Simulator', undo);
  });
  draw();
  openSheet('sim-import', 'Import from Exam Simulator', [
    sheetHead('Exam Simulator', 'Import progress'),
    h('p', { class: 'hint', text: 'From ' + fileName + '. Finished forms fill in your tracker; empty fields are filled and nothing you entered is replaced unless you choose to. Scores use your first attempt.' }),
    h('div', { class: 'sim-opts' },
      check('Replace my values where they differ', 'overwrite'),
      sets.length ? check('Log custom question sets as qbank sessions', 'qbank', '(“Other” qbank)') : null),
    list,
    h('div', { class: 'actions' }, go, h('button', { class: 'btn ghost', onclick: closeSheet }, 'Cancel')),
  ], draw);
}
