// Small shared helpers: DOM builder, number/date formatting, input sanitisers. No app state.

export const h = (tag, attrs, ...kids) => {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
export const $ = (id) => document.getElementById(id);
export const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
export const nn = (x) => x != null;
export const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const fmtPct = (v) => Math.round(v) + '%';
export const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n));
export const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
// Date formatters are built once: toLocaleDateString builds a new one on every call, which made
// the activity calendar (140 day titles) the slowest part of the overview.
const dateFmt = (opts) => {
  const f = new Intl.DateTimeFormat('en-GB', opts), memo = new Map();
  return (d) => {
    if (!d) return '';
    let s = memo.get(d);
    if (s == null) { const t = new Date(d + 'T00:00:00'); s = isNaN(t) ? d : f.format(t); if (memo.size > 2000) memo.clear(); memo.set(d, s); }
    return s;
  };
};
export const fmtDate = dateFmt({ day: 'numeric', month: 'short', year: '2-digit' });
const fmtLongDay = dateFmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtLong = (d) => fmtLongDay(d) || d;
export const monthShort = ((f) => (n) => f.format(new Date(n * 864e5)))(new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })); // from a day number
export const today = () => { const t = new Date(); return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
// dates as whole days (UTC-based, so daylight-saving changes never shift a day)
export const dayNum = (d) => { const [y, m, dd] = d.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, dd) / 864e5); };
export const fromDay = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
export const daysUntil = (d) => dayNum(d) - dayNum(today());
export const weekday = (n) => (new Date(n * 864e5).getUTCDay() + 6) % 7; // Monday = 0
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const slug = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const fmtN = (n) => Math.round(n).toLocaleString('en-US');

export const ID_RE = /^[a-z0-9-]{1,48}$/i;
export const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
export const arr = (x) => (Array.isArray(x) ? x : []);
export const str = (x, max = 4000) => (typeof x === 'string' ? x.slice(0, max) : typeof x === 'number' && Number.isFinite(x) ? String(x) : '');
export const int = (x, lo, hi) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
export const isDate = (x) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(new Date(x + 'T00:00:00')) ? x : '');
export const inRange = (x, lo, hi) => { const v = num(x); return v != null && v >= lo && v <= hi ? String(v) : ''; };
export const stampOf = (x) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
export const ints = (a, lo, hi) => [...new Set(arr(a).map(Number).filter((n) => Number.isInteger(n) && n >= lo && n <= hi))].sort((x, y) => x - y);

export const safeUrl = (x) => { try { const u = new URL(String(x).trim()); return /^https?:$/.test(u.protocol) ? u.href.slice(0, 500) : ''; } catch (e) { return ''; } };
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const svgIcon = (body) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
// progress ring (share done) with a label in the middle; cls picks the colour (see .pv-ring in styles.css)
export function ring(frac, label, cls) {
  const ns = 'http://www.w3.org/2000/svg', r = 15, c = 2 * Math.PI * r;
  const s = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = s('svg', { viewBox: '0 0 36 36', class: 'pv-ring ' + cls, 'aria-hidden': 'true' });
  svg.append(s('circle', { cx: 18, cy: 18, r, class: 'bg' }), s('circle', { cx: 18, cy: 18, r, class: 'fg', 'stroke-dasharray': (Math.min(1, frac) * c).toFixed(2) + ' ' + c.toFixed(2), transform: 'rotate(-90 18 18)' }));
  return h('div', { class: 'pv-ringw' }, svg, h('b', { text: label }));
}
