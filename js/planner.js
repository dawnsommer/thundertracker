// Planned dates for self-assessments: the planner panel, spreading forms out before test day, and a
// calendar file (.ics) with the plan. A planned date is stored on the form as `plan`; taking the form
// (status Taken or later) takes it off the plan.

import { $, dayNum, daysUntil, fmtLong, fromDay, h, isDate, plural, today } from './util.js?v=10';
import { GROUPS } from './catalog.js?v=10';
import { item, save, snapshot, state, toast } from './store.js?v=10';
import { allTests, ORDER, taken } from './data.js?v=10';
import { closeSheet, openSheet, sheetHead } from './sheets.js?v=10';
import { render } from './shell.js?v=10';
import { download } from './backup.js?v=10';
import { openSettings } from './settings.js?v=10';

export const plannedForms = () => allTests().filter((f) => !taken(f) && item(f.id).plan)
  .sort((a, b) => item(a.id).plan.localeCompare(item(b.id).plan) || ORDER(a) - ORDER(b));
const setPlan = (f, plan) => { state.items[f.id] = Object.assign({}, item(f.id), { plan }); };
const untaken = () => allTests().filter((f) => !taken(f));
export const inDays = (d) => { const n = daysUntil(d); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? 'in ' + n + ' days' : plural(-n, 'day') + ' ago'; };

// Give every untaken form without a date one, evenly between tomorrow and two days before the test.
// Free 120s go in the final week. Returns how many forms got a date.
export function spreadPlan() {
  const ex = state.prefs.examDate;
  if (!ex || daysUntil(ex) < 3) return 0;
  const todo = untaken().filter((f) => !f.old && !item(f.id).plan);
  const main = todo.filter((f) => f.g.key !== 'f120'), last = todo.filter((f) => f.g.key === 'f120');
  const t = dayNum(today()), end = dayNum(ex) - 2;
  const lastStart = last.length ? Math.max(t + 1, end - 6) : end + 1;
  const place = (list, from, to) => list.forEach((f, i) => {
    const d = list.length === 1 ? from : Math.round(from + i * (to - from) / (list.length - 1));
    setPlan(f, fromDay(Math.min(Math.max(d, t + 1), end)));
  });
  place(main, t + 1, Math.max(t + 1, (last.length ? lastStart - 1 : end)));
  place(last, lastStart, end);
  return todo.length;
}

// All-day events for the planned forms and test day.
export function planIcs() {
  const created = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const day = (d) => d.replace(/-/g, '');
  const next = (d) => fromDay(dayNum(d) + 1).replace(/-/g, '');
  const ev = (uidPart, d, title) => ['BEGIN:VEVENT', 'UID:' + uidPart + '-' + day(d) + '@thundertracker', 'DTSTAMP:' + created,
    'DTSTART;VALUE=DATE:' + day(d), 'DTEND;VALUE=DATE:' + next(d), 'SUMMARY:' + title.replace(/[,;]/g, ' '), 'END:VEVENT'];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Thunder tracker//Plan//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Step 2 CK plan'];
  plannedForms().forEach((f) => lines.push(...ev(f.id, item(f.id).plan, f.full + ' (practice exam)')));
  if (state.prefs.examDate) lines.push(...ev('test-day', state.prefs.examDate, 'USMLE Step 2 CK — test day'));
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function openPlanner() {
  const list = h('div', { class: 'plan-list' });
  const head = h('p', { class: 'hint' });
  const draw = () => {
    const ex = state.prefs.examDate;
    head.replaceChildren(ex ? 'Test day: ' + fmtLong(ex) + ' (' + inDays(ex) + ').' : 'Set your test date to spread forms out automatically. ',
      ex ? '' : h('button', { class: 'linkish', onclick: () => { closeSheet(); openSettings('#st-exam'); } }, 'Set test date'));
    const groups = GROUPS.map((g) => [g, untaken().filter((f) => f.g === g)]).filter(([, fs]) => fs.length);
    list.replaceChildren(...(groups.length ? groups.map(([g, fs]) => h('div', { class: 'plan-group' }, h('h4', { text: g.name }),
      fs.map((f) => {
        const p = item(f.id).plan;
        const inp = h('input', { type: 'date', value: p, 'aria-label': 'Planned date for ' + f.full, 'data-plan': f.id });
        inp.addEventListener('change', () => { setPlan(f, isDate(inp.value)); save(); render(); draw(); });
        return h('div', { class: 'plan-row' + (p && daysUntil(p) < 0 ? ' overdue' : '') },
          h('span', { class: 'nm' }, f.full, f.old ? h('span', { class: 'old', text: 'older' }) : null), inp,
          h('small', { text: p ? inDays(p) : '' }));
      }))) : [h('p', { class: 'sub', text: 'Every assessment is taken — nothing left to plan.' })]));
  };
  draw();
  openSheet('planner', 'Plan dates', [
    sheetHead('Assessments', 'Plan dates'),
    head,
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn primary', id: 'plan-spread', onclick: () => {
        if (!state.prefs.examDate) { toast('Set your test date first'); return; }
        const undo = snapshot();
        const n = spreadPlan(); save(); render(); draw();
        toast(n ? 'Planned ' + plural(n, 'form') + ' before test day' : 'Nothing to plan — every form already has a date', n ? undo : null);
      } }, 'Spread unplanned forms'),
      h('button', { class: 'btn', id: 'plan-ics', onclick: () => {
        if (!plannedForms().length && !state.prefs.examDate) { toast('Plan some dates first'); return; }
        download('step2ck-plan.ics', planIcs(), 'text/calendar');
        toast('Calendar file downloaded — open it to add the dates to your calendar');
      } }, 'Add to calendar (.ics)'),
      h('button', { class: 'btn ghost danger', onclick: () => {
        const undo = snapshot();
        untaken().forEach((f) => { if (item(f.id).plan) setPlan(f, ''); });
        save(); render(); draw(); toast('Plan cleared', undo);
      } }, 'Clear plan')),
    h('p', { class: 'hint', text: 'Spreading skips older forms and puts Free 120s in your final week. Taken forms drop off the plan; planned days show on the activity calendar.' }),
    list,
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'Done')),
  ], draw, '#plan-spread');
}
$('plan-btn').addEventListener('click', openPlanner);
