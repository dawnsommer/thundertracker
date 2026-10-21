// Builds a small, made-up Step Exam Simulator progress backup (.zip) in the simulator's real format,
// so the import can be tested without anyone's personal data in the repo.
import zlib from 'zlib';
import fs from 'fs';

const attempt = (formId, title, blocks, completedAt) => {
  const results = blocks.map(([total, correct], i) => ({ blockIndex: i + 1, blockName: 'Block ' + (i + 1), total, correct, percent: Math.round(correct / total * 100), completedAt }));
  return {
    fileType: 'StepExamSimulatorV10ProgressBundle', saveVersion: 10, formSlot: formId,
    session: { title: title + ' — All Questions', libraryFormName: title, startedAt: completedAt, completedAt, blocks: blocks.map(() => ({})), results, attemptId: 'attempt_' + formId },
    bundle: { attempts: [{ attemptId: 'attempt_' + formId, type: 'initial', completedAt, session: { title, libraryFormName: title, completedAt, blocks: blocks.map(() => ({})), results, attemptId: 'attempt_' + formId } }] },
  };
};
const unfinished = (formId, title) => ({ fileType: 'StepExamSimulatorV10ProgressBundle', saveVersion: 10, formSlot: formId,
  session: { title, startedAt: '2026-08-19T10:05:40.646Z', completedAt: null, blocks: [{}], results: [null] }, bundle: { attempts: [{ type: 'initial', completedAt: null, session: { blocks: [{}], results: [] } }] } });

export const FILES = {
  'README_RESTORE.txt': 'Portable Step Exam Simulator Progress Backup (test fixture).',
  'progress_metadata.json': { schemaVersion: 2, fileType: 'StepExamSimulatorProgressMetadata', forms: [
    { formId: 'N-06', threeDigitScore: '245' }, { formId: 'N-11', threeDigitScore: '238' }, { formId: 'UWSA3', threeDigitScore: '211' },
    { formId: 'C-IM-03', threeDigitScore: '' }, { formId: 'C-FM-01', threeDigitScore: '' }, { formId: 'CKNotes01', threeDigitScore: '' }, { formId: 'C-IM-01', threeDigitScore: '' }] },
  'progress/N-06_progress_save.json': attempt('N-06', 'NBME 6 - Retired', [[20, 17], [20, 17], [20, 17], [20, 17], [20, 19], [20, 18], [20, 18], [20, 19], [20, 18], [4, 3]], '2026-09-27T02:55:07.743Z'),
  'progress/N-11_progress_save.json': attempt('N-11', 'NBME 11', [[50, 36], [50, 36], [50, 36], [50, 36]], '2026-08-20T15:00:00.000Z'),
  'progress/UWSA3_progress_save.json': attempt('UWSA3', 'UWSA-03', [[40, 23], [40, 23], [40, 22], [40, 23]], '2026-07-05T12:00:00.000Z'),
  'progress/C-IM-03_progress_save.json': attempt('C-IM-03', 'CMS IM Form 3 - Retired', [[20, 17], [20, 17], [10, 8]], '2026-06-28T12:00:00.000Z'),
  'progress/C-FM-01_progress_save.json': attempt('C-FM-01', 'C-FM-01 - Retired', [[20, 16], [20, 17], [10, 8]], '2026-09-30T14:26:41.743Z'),
  'progress/CKNotes01_progress_save.json': attempt('CKNotes01', '1. Autoimmune & Other Diseases', [[20, 20]], '2026-07-04T12:00:00.000Z'),
  'progress/C-IM-01_progress_save.json': unfinished('C-IM-01', 'C-IM-01 - Retired'),
  'progress/C-IM-01_suspended_test.json': { fileType: 'StepExamSimulatorV7SuspendedTest', formSlot: 'C-IM-01', session: {} },
  'progress/QBANK_MODE_progress.json': { fileType: 'StepExamSimulatorV10QbankProgress', sessions: [] },
};

// Minimal zip writer: JSON entries deflated, text stored, with a central directory.
export function makeSimZip(path) {
  const locals = [], centrals = [];
  let offset = 0;
  const add = (name, data, method) => {
    const n = Buffer.from(name), raw = Buffer.from(data), body = method === 8 ? zlib.deflateRawSync(raw) : raw, crc = zlib.crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, body); centrals.push(ch, n);
    offset += 30 + n.length + body.length;
  };
  add('progress/', '', 0);
  for (const [name, v] of Object.entries(FILES)) add(name, typeof v === 'string' ? v : JSON.stringify(v), name.endsWith('.json') ? 8 : 0);
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(path, Buffer.concat([...locals, cd, end]));
  return path;
}
