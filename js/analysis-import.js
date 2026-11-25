// Reads a ThunderNBME analysis feed file (ThunderTracker_<form>.md) into an assessment's weak systems.
// Pure: no DOM, no state; the assessment editor (js/assessments.js) applies the result. Node-tested.
//
// The file: a `<!-- thundertracker:assessment v1 -->` marker, `key: value` lines (form, date, correct, weak)
// and a table `| id | system | wrong | unstable |`. `weak:` lists the weak system ids; the table gives the
// errors (wrong) and unstable counts per system.

import { MERGE } from './catalog.js?v=35';

export const ANALYSIS_MARKER = /<!--\s*thundertracker:assessment\s+v1\s*-->/i;
const MAX_N = 200; // same cap as the editor's number boxes and normItem

// text: the file's contents. validIds: the system ids the app knows (allSystems().map(s => s.id)).
// → { ok: true, form, date, pct ('' when absent), weak, weakN, rows (table rows read) } or { ok: false, error }
export function parseAnalysis(text, validIds) {
  if (typeof text !== 'string' || !ANALYSIS_MARKER.test(text)) return { ok: false, error: 'Not a ThunderNBME analysis file (no “thundertracker:assessment v1” line).' };
  const known = new Set(validIds);
  const unknown = new Set();
  const idOf = (raw) => {
    const id0 = String(raw).trim().toLowerCase();
    const id = MERGE[id0] || id0;
    if (!known.has(id)) { unknown.add(raw.trim()); return null; }
    return id;
  };
  const meta = {};
  const weakN = {};
  let tableRows = 0;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    const kv = /^(form|date|correct|weak)\s*:\s*(.*)$/i.exec(t);
    if (kv) { meta[kv[1].toLowerCase()] = kv[2].trim(); continue; }
    if (!t.startsWith('|')) continue;
    const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (/^:?-+:?$/.test(cells[0]) || /^id$/i.test(cells[0])) continue; // header and separator
    if (cells.length < 4) return { ok: false, error: 'Table row “' + t + '” needs id, system, wrong and unstable.' };
    const id = idOf(cells[0]);
    const e = Number(cells[2]), u = Number(cells[3]);
    if (![e, u].every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_N)) return { ok: false, error: 'Table row “' + cells[0] + '”: wrong and unstable must be whole numbers 0–' + MAX_N + '.' };
    tableRows++;
    if (!id || !(e || u)) continue;
    const prev = weakN[id] || { e: 0, u: 0 }; // two old ids folded into one merged system add up
    weakN[id] = { e: Math.min(MAX_N, prev.e + e), u: Math.min(MAX_N, prev.u + u) };
  }
  if (!('weak' in meta)) return { ok: false, error: 'The file has no “weak:” line.' };
  const weak = [];
  for (const raw of meta.weak.split(/[\s,]+/).filter(Boolean)) {
    const id = idOf(raw);
    if (id && !weak.includes(id)) weak.push(id);
  }
  if (unknown.size) return { ok: false, error: 'Unknown system id' + (unknown.size > 1 ? 's' : '') + ': ' + [...unknown].join(', ') + '.' };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(meta.date || '') ? meta.date : '';
  return { ok: true, form: meta.form || '', date, pct: pctOfCorrect(meta.correct), weak, weakN, rows: tableRows };
}

// "90/150 (60.0%)" → "60"; "90/150" → "60"; "60%" → "60"; anything else → ''
export function pctOfCorrect(s) {
  if (!s) return '';
  const p = /(\d+(?:\.\d+)?)\s*%/.exec(s);
  let v = p ? Number(p[1]) : null;
  if (v == null) {
    const f = /(\d+)\s*\/\s*(\d+)/.exec(s);
    if (f && Number(f[2]) > 0) v = Math.round(Number(f[1]) / Number(f[2]) * 1000) / 10;
  }
  return v != null && v >= 0 && v <= 100 ? String(v) : '';
}

// Does the file's `form:` name the assessment being edited? Compared without case, spaces or punctuation,
// against its full name ("NBME 7", "UWSA 2", "Free 120 (2023)"). An empty `form:` counts as a match.
export function formMatches(fileForm, fullName) {
  const k = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return !k(fileForm) || k(fileForm) === k(fullName);
}
