// The overview's layout: which blocks show, in what order, and how wide (Settings → Home page).
// Saved per device in prefs.ovLayout as [{k, w: 'full'|'half', hide}]. Halves next to each other share
// a row: two per row, three when a run is odd, and a half on its own fills the row.

import { $, arr } from './util.js?v=35';
import { state } from './store.js?v=35';
import { passiveOn } from './passive.js?v=35';
import { ambossOn } from './amboss.js?v=35';

export const OV_BLOCKS = [
  { k: 'tiles', name: 'Summary tiles', w: 'full' },
  { k: 'trend', name: 'Score trend', w: 'half' },
  { k: 'cms', name: 'CMS by subject', w: 'half' },
  { k: 'next', name: 'Up next', w: 'half' },
  { k: 'heat', name: 'Activity', w: 'half' },
  { k: 'weak', name: 'Weak systems', w: 'full' },
  { k: 'sys', name: 'Systems', w: 'half' },
  { k: 'art', name: 'AMBOSS articles', w: 'half' },
  { k: 'pv', name: 'Passive study', w: 'half', extra: () => passiveOn() },
  { k: 'amb', name: 'AMBOSS tracker', w: 'half', extra: () => ambossOn() },
];
const BY = Object.fromEntries(OV_BLOCKS.map((b) => [b.k, b]));
export const defaultLayout = () => OV_BLOCKS.map((b) => ({ k: b.k, w: b.w, hide: false }));

// clean a saved layout: known blocks once each; a block it doesn't know yet goes after the one before it
export function normLayout(x) {
  const out = [], seen = new Set();
  for (const r of arr(x)) {
    if (!r || !BY[r.k] || seen.has(r.k)) continue;
    seen.add(r.k);
    out.push({ k: r.k, w: r.w === 'full' || r.w === 'half' ? r.w : BY[r.k].w, hide: r.hide === true });
  }
  if (!out.length) return defaultLayout();
  OV_BLOCKS.forEach((b, i) => {
    if (seen.has(b.k)) return;
    const prev = OV_BLOCKS.slice(0, i).reverse().find((p) => seen.has(p.k));
    out.splice(prev ? out.findIndex((r) => r.k === prev.k) + 1 : 0, 0, { k: b.k, w: b.w, hide: false });
    seen.add(b.k);
  });
  return out;
}
export const ovLayout = () => normLayout(state.prefs.ovLayout);
export const blockName = (k) => BY[k].name;
export const blockOn = (k) => !BY[k].extra || BY[k].extra(); // Passive and the AMBOSS tracker only once they're on

// grid spans on a 6-column grid for the given visible rows: full 6, a pair 3 + 3, an odd run ends in 2 + 2 + 2
export function spans(rows) {
  const out = new Map();
  let run = [];
  const close = () => {
    const n = run.length;
    run.forEach((k, i) => out.set(k, n === 1 ? 6 : n % 2 && i >= n - 3 ? 2 : 3));
    run = [];
  };
  for (const r of rows) {
    if (r.w === 'half') run.push(r.k);
    else { close(); out.set(r.k, 6); }
  }
  close();
  return out;
}

// put the overview's blocks in order and size them
export function applyOverviewLayout() {
  const grid = $('ov-grid'), list = ovLayout().filter((r) => blockOn(r.k));
  const shown = list.filter((r) => !r.hide), sp = spans(shown);
  for (const r of list) {
    const el = grid.querySelector(`:scope > [data-blk="${r.k}"]`);
    if (!el) continue;
    grid.append(el);
    el.hidden = r.hide;
    el.style.setProperty('--span', sp.get(r.k) || 6);
  }
  // blocks for extras that are off stay hidden
  for (const b of OV_BLOCKS) if (!blockOn(b.k)) { const el = grid.querySelector(`:scope > [data-blk="${b.k}"]`); if (el) el.hidden = true; }
}
