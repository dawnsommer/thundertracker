// What the app tracks: assessments, CMS subjects, systems, qbanks, AMBOSS articles, labels and constants.

import { slug } from './util.js?v=11';

// Self-assessments. `base` is the default list; newer releases can be added from the Assessments tab.
export const GROUPS = [
  { key: 'nbme', name: 'NBME CCSSA', short: 'NBME', qs: 200, qsFor: (n) => (n === 7 ? 176 : n <= 8 ? 184 : 200), scaled: true, min: 1, max: 99,
    desc: '200 questions in 4 blocks of 50 (Forms 6 and 8: 184, Form 7: 176) · log the 3-digit score and % correct',
    base: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], old: (n) => n <= 8,
    label: (n) => 'Form ' + n, full: (n) => 'NBME ' + n, tag: (n) => 'N' + n, addHint: 'Form #' },
  { key: 'uwsa', name: 'UWorld Self-Assessment', short: 'UWSA', qs: 160, scaled: true, min: 1, max: 9,
    desc: '160 questions in 4 blocks of 40 · log the 3-digit score and % correct',
    base: [1, 2, 3],
    label: (n) => 'UWSA ' + n, full: (n) => 'UWSA ' + n, tag: (n) => 'U' + n, addHint: 'UWSA #' },
  { key: 'f120', name: 'Free 120', short: 'Free 120', qs: 120, scaled: false, min: 2010, max: 2040,
    desc: '120 questions in 3 blocks of 40 · log % correct',
    base: [2019, 2021, 2023],
    label: (n) => n + ' release', full: (n) => 'Free 120 (' + n + ')', tag: (n) => 'F' + String(n).slice(2), addHint: 'Year' },
];

export const SUBJ = [
  { key: 'med',   name: 'Internal Medicine', latest: 10 },
  { key: 'surg',  name: 'Surgery',           latest: 9 },
  { key: 'peds',  name: 'Pediatrics',        latest: 9 },
  { key: 'obgyn', name: 'OB/GYN',            latest: 10 },
  { key: 'psych', name: 'Psychiatry',        latest: 8 },
  { key: 'neuro', name: 'Clinical Neurology',latest: 9 },
  { key: 'fm',    name: 'Family Medicine',   latest: 5 },
  { key: 'em',    name: 'Emergency Medicine',latest: 3 },
];
export const SYSTEMS = [
  ['cardio','Cardiovascular'],['resp','Pulmonary & Critical Care'],['gi','Gastrointestinal & Hepatology'],
  ['renal','Renal, Urology & Electrolytes'],['endo','Endocrine & Diabetes'],['heme','Hematology & Oncology'],
  ['id','Infectious Disease'],['immuno','Immunology, Allergy & Dermatology'],['rheum','Rheumatology & Musculoskeletal'],
  ['neuro','Neurology, Ophthalmology & ENT'],['psych','Psychiatry & Behavioral'],
  ['repro','Reproductive: OB, Gyn & Male'],
  ['peds','Pediatrics & Genetics'],['surg','Surgery & Trauma'],['emtox','Emergency Medicine & Toxicology'],
  ['biostat','Biostatistics & Epidemiology'],['ethics','Ethics, Communication & Patient Safety'],
].map(([id, name]) => ({ id: 'sys-' + id, name }));
// old system ids folded into the merged ones
export const MERGE = { 'sys-male': 'sys-repro', 'sys-ob': 'sys-repro', 'sys-gyn': 'sys-repro', 'sys-ent': 'sys-neuro', 'sys-derm': 'sys-immuno' };
export const TAGS = ['Sketchy', 'UWorld', 'AMBOSS', 'Anki'];
// Built-in qbanks; you can add more on the Qbank tab. Sessions point at a qbank by name.
export const QBANKS = [{ id: 'uworld', name: 'UWorld' }, { id: 'amboss', name: 'AMBOSS' }];
export const PASSES = 5; // read-throughs per AMBOSS article, as in the checklist

export const FORM_ST = ['Not taken', 'Taken', 'Reviewed', 'Anki made'];
export const SYS_ST = ['Not started', 'Learning', 'Qbank done', 'Revised'];
export const TABS = ['overview', 'nbme', 'cms', 'systems', 'qbank', 'articles'];
export const PASS = 218;
export const APP_VERSION = 11; // matches VERSION in sw.js and every ?v= (tools/release.mjs keeps them in step)
// The app's script files, for “Reload latest version”.
export const APP_FILES = ['js/articles.js', 'js/assessments.js', 'js/backup.js', 'js/calculator.js', 'js/catalog.js', 'js/cloud.js', 'js/cms.js', 'js/config.js', 'js/data.js', 'js/main.js', 'js/model.js', 'js/overview.js', 'js/planner.js', 'js/print.js', 'js/qbank.js', 'js/score-models.js', 'js/settings.js', 'js/sheets.js', 'js/shell.js', 'js/sim-import.js', 'js/store.js', 'js/systems.js', 'js/updates.js', 'js/util.js'];
export const KEY = 'ck-tracker';

// AMBOSS articles from the Step 2 CK master checklist, in its order (its "Step 2 Prep Condensed"
// list is left out). Your own sections come after these; your own articles can go in any section.
export const ARTICLE_SECTIONS = [
  ['psqi', 'High-Yield Patient Safety & Quality Improvement', ['Patient safety', 'Quality improvement']],
  ['screen', 'High-Yield Screening & Vaccination', ['Screening', 'Vaccination']],
  ['ethics', 'High-Yield Ethics', ['Challenging clinical and ethical scenarios']],
  ['biostat', 'High-Yield Biostatistics & Epidemiology', ['Epidemiology', 'Population health', 'Statistical analysis of data', 'Interpreting medical evidence', 'Research ethics']],
  ['nutrition', 'High-Yield Nutrition', ['Principles of nutrition', 'Vitamins', 'Trace elements', 'Acute primary malnutrition in children',
    'Unintentional weight loss and malnutrition in adults', 'Overweight and obesity', 'Specialized nutrition support']],
  ['extra', 'Recommended Extra Articles', ['Preventive medicine', 'Health care system', 'Infection prevention and control', 'Overview of palliative medicine',
    'Death', 'Grief and end-of-life counseling', 'Pain management', 'Managing chronic conditions', 'Logistics of US health care and hospitals']],
].map(([key, name, list]) => ({ id: 'sec-' + key, name, builtIn: true,
  articles: list.map((n) => ({ id: ('amb-' + key + '-' + slug(n)).slice(0, 48).replace(/-+$/, ''), name: n, sec: 'sec-' + key, builtIn: true })) }));
