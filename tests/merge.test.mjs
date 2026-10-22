// The sync merge (js/model.js) on its own: a device's first sync must not let either side's lists or
// plan replace the other's.
import { merge, norm } from '../js/model.js?v=test';
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };

// the account: test date, target, NBME 17 added, a score on it
const account = norm({ items: { 'nbme-17': { status: 1, score: '250', t: 100 } }, extraAssess: { nbme: [17] }, lt: 100, pt: 100,
  prefs: { examDate: '2026-12-01', target: '255' } });
// a new phone where you only ticked "Show older forms" (newer list and plan stamps) before signing in
const phone = norm({ items: { 'uwsa-1': { status: 1, pct: '70', t: 500 } }, removed: ['uwsa-3'], lt: 500, pt: 500, prefs: { showOld: true, passive: true } });
const m = merge(phone, account, { first: true });
ok(m.prefs.examDate === '2026-12-01' && m.prefs.target === '255', 'first sync keeps the account’s test date and target: ' + m.prefs.examDate + ' / ' + m.prefs.target);
ok(m.prefs.showOld === true && m.prefs.passive === true, 'and keeps what the phone set that the account hadn’t');
ok(JSON.stringify(m.extraAssess) === '{"nbme":[17]}' && m.removed.includes('uwsa-3'), 'form lists combined: NBME 17 kept, UWSA 3 still hidden');
ok(m.items['nbme-17'] && m.items['uwsa-1'], 'records from both sides kept');
ok(m.lt === 500 && m.pt === 500, 'merged stamps are the newest, so other devices take the merged result');
// that merged copy then reaches the laptop (an ordinary sync): nothing lost there either
const laptop = merge(account, m);
ok(laptop.prefs.examDate === '2026-12-01' && JSON.stringify(laptop.extraAssess) === '{"nbme":[17]}' && laptop.prefs.showOld === true, 'the laptop gets the combined result');
// ordinary syncs still let the newest change win (clearing the test date on purpose is respected)
const cleared = norm(Object.assign({}, JSON.parse(JSON.stringify(account)), { pt: 900, prefs: { examDate: '', target: '255' } }));
ok(merge(account, cleared).prefs.examDate === '', 'after the first sync, the newest plan change wins (a cleared date stays cleared)');
