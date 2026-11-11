// A made-up AMBOSS tracker page, shaped like the one the user's MogiAmboss tool builds
// (dawnsommer.github.io/amboss-tracker/: one HTML file with its data on a `const D = {...};` line).
// Synthetic only: never put the user's real dashboard here.

const SYS = ['CVS', 'Pulm', 'Repro', 'Psych', 'Biostat', 'Renal', 'ID'];
const ERR = ['K', 'T', 'S', 'D', 'R'];

export function makeAmbossData({ blocks = 12, legacy = 6 } = {}) {
  const scores = [], questions = [], batches = [], sets = [];
  const pcts = [80, 70, 75, 65, 85, 70, 60, 75, 80, 70, 85, 90, 75, 80, 65, 70, 85, 80, 75, 90];
  for (let i = 0; i < blocks; i++) {
    const era = i < legacy ? 'legacy' : 'current', set = 'S' + (Math.floor(i / 2) + 1);
    scores.push({ seq: i + 1, date: '2026-10-' + String(10 + i).padStart(2, '0'), pct: pcts[i % pcts.length], n_q: 20, targeted: i % 3 !== 0,
      doc: era === 'current' ? set : '', era, note: '', systems: i < 3 ? SYS.slice(0, 4) : SYS.slice(0, 5),
      ...(era === 'current' ? { batch_stable: 60 + (i % 4) * 2.5 } : {}) });
  }
  for (let s = 1; s <= Math.ceil(blocks / 2); s++) {
    const set = 'S' + s, era = (s - 1) * 2 < legacy ? 'legacy' : 'current';
    sets.push(set);
    let I = 0, U = 0;
    for (let j = 0; j < 6; j++) {
      const status = j % 3 === 2 ? 'U' : 'I';
      status === 'I' ? I++ : U++;
      questions.push({ id: set + '-' + String(j + 1).padStart(2, '0'), set, era, status, qtype: j % 2 ? 'Diagnosis' : 'Next step',
        subject: ['Med', 'Surg', 'Peds', 'OBGYN', 'Psych'][j % 5], system: j === 0 ? 'CVS' : SYS[(s + j) % SYS.length],
        topic: j === 0 ? 'Fake topic alpha' : 'Topic ' + set + '-' + j, error: ERR[(s + j) % 5],
        call: 'Next step + made-up stem ' + set + '-' + j + ' → made-up answer', hinge: 'Made-up hinge with $10 / 20 = 50\\%$',
        trap: 'Made-up trap ' + j, selected: j % 2 ? 'B (wrong) - red ✗' : '' });
    }
    batches.push({ set, era, I, U, reviewed: I + U, blocks: era === 'current' ? [s * 2 - 1, s * 2] : [], n_q: era === 'current' ? 40 : null,
      pct: era === 'current' ? 75 : null, stable_pct: era === 'current' ? 65 : null });
  }
  return {
    questions, scores, sets, batches,
    timeline: [{ at_block: '1', system: 'CVS', action: 'add' }, { at_block: '4', system: 'Biostat', action: 'add' }],
    sys_est: SYS.map((system, i) => ({ system, seen: 6 + i * 2, I: 3 + i, U: 1, acc: 55 + i * 5 })),
    sys_unplaced: 1,
    errors: { K: 'Knowledge gap', T: 'Trap bait', S: 'Sequencing / next step order', D: 'Detail / cutoff', R: 'Misread / reasoning' },
    systems: { CVS: 'Cardiovascular System', Pulm: 'Pulmonary & Critical Care', Repro: 'Obs + Gyne + Male Reproduction', Psych: 'Psychiatric/Behavioral', Biostat: 'Biostatistics & Epidemiology', Renal: 'Renal + Urology', ID: 'Infectious Diseases' },
    subjects: { Med: 'Medicine', Surg: 'Surgery', Peds: 'Pediatrics', OBGYN: 'Obstetrics & Gynecology', Psych: 'Psychiatry' },
    statuses: { I: 'Incorrect', U: 'Unstable', '?': 'Unknown' },
    built: '2026-11-01 09:30',
  };
}

export const makeAmbossPage = (data = makeAmbossData()) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>AMBOSS Tracker</title></head>
<body><div id="meta"></div>
<script>
const D = ${JSON.stringify(data)};
const css = n => n;
document.getElementById("meta").textContent = "Updated " + D.built;
</script>
</body></html>
`;
