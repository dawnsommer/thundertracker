// NotebookLM audio volumes (Passive → NotebookLM, AMBOSS → Audio). Pure: no DOM, Node-tested.
// The feed is `nlm.json` on the user's amboss-tracker page, pushed by their local ThunderNBME / MogiAMBOSS
// (NBME/CMS volumes plus MogiAMBOSS's). It holds titles, systems, counts, dates and a status only. It is
// personal: never copy it into this repo. Volumes only ever get added (a system's queue
// fills to a threshold, then a new volume is frozen), so the shelf is grouped by system and sorted by number.

export const NL_ST = { E: 'Exported', U: 'Uploaded', A: 'Audio ready', L: 'Listened' };
const ST_KEYS = Object.keys(NL_ST);
const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');
const int = (x, lo, hi) => { const v = Math.round(Number(x)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null; };
const ymd = (x) => (/^\d{4}-\d{2}-\d{2}/.test(x || '') ? x.slice(0, 10) : '');

function normPart(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.vols)) return null;
  const vols = p.vols.slice(0, 400).map((v) => v && typeof v.id === 'string' && v.id ? {
    id: str(v.id, 60), track: ['system', 'repeat', 'form'].includes(v.track) ? v.track : 'system', g: str(v.g, 60) || 'other',
    n: int(v.n, 1, 999) || 1, title: str(v.title, 120) || v.id, q: int(v.q, 0, 9999) || 0,
    st: ST_KEYS.includes(v.st) ? v.st : 'E', d0: ymd(v.d0), d1: ymd(v.d1), at: ymd(v.at),
  } : null).filter(Boolean);
  const groups = (Array.isArray(p.groups) ? p.groups : []).slice(0, 60).filter((g) => g && typeof g.id === 'string').map((g, i) => ({
    id: str(g.id, 60), name: str(g.name, 80) || g.id, order: int(g.order, 0, 999) ?? i,
    queue: g.queue == null ? null : int(g.queue, 0, 9999), thr: g.thr == null ? null : int(g.thr, 1, 999),
  }));
  return { label: str(p.label, 40), groups, vols };
}

// A feed file (or the stored pref) → { at, nbme, amboss } or null when it isn't one.
export function normFeed(f) {
  if (!f || typeof f !== 'object' || f.kind !== 'thundertracker-nlm') return null;
  const nbme = normPart(f.nbme), amboss = normPart(f.amboss);
  if (!nbme && !amboss) return null;
  return { kind: 'thundertracker-nlm', v: 1, at: str(f.at, 30), nbme, amboss };
}

// the passive-study key holding a volume's listen boxes (ids allow only a-z 0-9 -)
export const volKey = (src, id) => ('nl-' + (src === 'amboss' ? 'a' : 'n') + '-' + id.toLowerCase().replace(/[^a-z0-9]+/g, '-')).slice(0, 48);
export const heard = (v, n) => v.st === 'L' || n > 0;

const REPEAT = { repeat_4plus: 'Repeat offenders · 4+ misses', repeat_3star: 'Repeat offenders · 3★ topics' };
// rows for one track: [{ id, name, queue, thr, vols: [...] }] in the feed's system order, volumes by number
export function shelfRows(part, track) {
  if (!part) return [];
  const meta = new Map(part.groups.map((g) => [g.id, g]));
  const by = new Map();
  for (const v of part.vols) if (v.track === track) (by.get(v.g) || by.set(v.g, []).get(v.g)).push(v);
  const rows = [...by].map(([g, vols]) => {
    vols.sort((a, b) => a.n - b.n || a.id.localeCompare(b.id));
    const m = meta.get(g);
    const name = m ? m.name : REPEAT[g] || (track === 'form' ? vols[0].title.replace(/\s+[—–-]\s+.*$/, '') : g);
    return { id: g, name, order: m ? m.order : 999, queue: m ? m.queue : null, thr: m ? m.thr : null, vols };
  });
  if (track === 'system') for (const g of part.groups) if (!by.has(g.id) && g.queue) rows.push({ id: g.id, name: g.name, order: g.order, queue: g.queue, thr: g.thr, vols: [] });
  return rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

// passes(key) → times through. Filter: all | todo (not heard) | ready (audio there, not heard)
export function filterRows(rows, f, passes, src) {
  if (f === 'all') return rows;
  return rows.map((r) => Object.assign({}, r, { vols: r.vols.filter((v) => !heard(v, passes(volKey(src, v.id))) && (f === 'todo' || v.st === 'A')) }))
    .filter((r) => r.vols.length);
}

export function shelfStats(part, passes, src) {
  const vols = part ? part.vols : [];
  const h = vols.filter((v) => heard(v, passes(volKey(src, v.id))));
  return { total: vols.length, ready: vols.filter((v) => v.st === 'A' && !h.includes(v)).length, heard: h.length,
    q: vols.reduce((t, v) => t + v.q, 0) };
}

// Up next: audio that's ready and not heard yet, oldest volume first in system order (repeat packs, then
// forms, after the systems); else the next one still needing its audio made.
export function upNext(part, passes, src) {
  if (!part) return null;
  const order = ['system', 'repeat', 'form'].flatMap((t) => shelfRows(part, t).flatMap((r) => r.vols.map((v) => [v, r])));
  const open = order.filter(([v]) => !heard(v, passes(volKey(src, v.id))));
  const hit = open.find(([v]) => v.st === 'A') || open[0];
  return hit ? { vol: hit[0], row: hit[1], needsAudio: hit[0].st !== 'A' } : null;
}
