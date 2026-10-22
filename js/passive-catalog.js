// What the Passive study tab tracks: Divine Intervention Podcasts (DIP) episodes from the Step 2 CK master
// checklist (v3, with the Ep 573 core additions; its 'Recommended add-ons' list is left out) and PHYSEO parts.
// Each DIP item: [episode, title, minutes (null if it varies), approximate?]. Ids are stable: dip-<episode> or dip-<slug>.

export const PV_PASSES = 5; // times through each item, as in the checklist

export const DIP_SECTIONS = [
  { id: 'core', name: 'Core must-listen', stars: 5, items: [
    ['dip-573', '573', 'How to Use Divine for Step 2 (2025)', 35, true],
    ['dip-137', '137', 'Next Best Step', 40, true],
    ['dip-230', '230', 'Quality & Safety', 55, true],
    ['dip-234', '234', 'Transition of Care', 40, true],
    ['dip-275', '275', 'Diagnostic Errors', 35, true],
    ['dip-276', '276', 'Ethics', 50, true],
    ['dip-228', '228', 'Palliative Care I', 45, true],
    ['dip-268', '268', 'Palliative Care II', 45, true],
    ['dip-325', '325', 'Screening Guidelines', 60, true],
    ['dip-250', '250', 'Vaccinations', 45, true],
    ['dip-204', '204', 'USMLE Military Podcast Part 1', 30, true],
    ['dip-231', '231', 'USMLE Military Podcast Part 2', 38, false],
    ['dip-37', '37', 'Risk Factors I', 40, true],
    ['dip-97', '97', 'Risk Factors II', 40, true],
    ['dip-184', '184', 'Risk Factors III', 45, true],
  ] },
  { id: 'shelf', name: 'Comprehensive shelf reviews', stars: 4, items: [
    ['dip-19', '19', 'Comprehensive Neurology Shelf Review', 120, true],
    ['dip-20', '20', 'Neurology Companion Review', 60, true],
    ['dip-21', '21', 'Comprehensive Pediatrics Shelf Review', 120, true],
    ['dip-22', '22', 'Comprehensive OB/GYN Shelf Review', 120, true],
    ['dip-23', '23', 'Comprehensive Psychiatry Shelf Review', 120, true],
    ['dip-24', '24', 'Comprehensive Surgery Shelf Review', 120, true],
    ['dip-29', '29', 'Comprehensive Medicine Shelf Review I', 120, true],
    ['dip-30', '30', 'Comprehensive Medicine Shelf Review II', 120, true],
    ['dip-31', '31', 'Comprehensive Medicine Shelf Review III', 120, true],
    ['dip-32', '32', 'Comprehensive Medicine Shelf Review IV', 120, true],
  ] },
  { id: 'hy', name: 'High-yield clinical', stars: 4, items: [
    ['dip-26', '26', 'Radiology', 60, true],
    ['dip-36', '36', 'Ophthalmology', 45, true],
    ['dip-41', '41', 'Antibiotics', 60, true],
    ['dip-100', '100', 'Clutch Microbiology', 60, true],
    ['dip-143', '143', 'Biostatistics', 60, true],
  ] },
  { id: 'em', name: 'Emergency medicine', stars: 4, items: [
    ['dip-571', '571', 'Emergency Medicine I', 45, true],
    ['dip-572', '572', 'Emergency Medicine II', 45, true],
    ['dip-574', '574', 'Emergency Medicine III', 45, true],
  ] },
  { id: 'bonus', name: 'New clutch & bonus', stars: 3, items: [
    ['dip-569', '569', 'Weird High-Yield Basic Science', 40, true],
    ['dip-570', '570', 'Skin & Soft Tissue Infections', 45, true],
  ] },
  { id: 'add573', name: 'Ep 573 core additions', stars: 5, items: [
    ['dip-400', '400', 'Get Your Head In The Game: Psychological Aspects of Test Day', 41, false],
    ['dip-446', '446', 'Divine Patch: Updates/Corrections from Past Episodes', 35, true],
  ] },
  { id: 'opt', name: 'Optional series', stars: 2, items: [
    ['dip-f120-review', '', 'Free 120 Review Series', null, false],
    ['dip-free137', '', 'Step 3 Free 137 Discussion Series', null, false],
    ['dip-rapid-review', '', 'Remaining Rapid Review Episodes', null, false],
  ] },
].map((s) => Object.assign(s, { items: s.items.map(([id, ep, name, mins, approx]) => ({ id, ep, name, mins, approx, sec: s.id })) }));

export const PHYSEO = [['em', 'Emergency Medicine'], ['neuro', 'Neurology'], ['ethics', 'Ethics'], ['biostats', 'Biostatistics'], ['peds', 'Pediatrics'], ['obgyn', 'OB/Gyn']]
  .map(([k, name]) => ({ id: 'ph-' + k, name }));
export const DIP_ITEMS = DIP_SECTIONS.flatMap((s) => s.items);
export const PV_IDS = new Set(DIP_ITEMS.map((x) => x.id).concat(PHYSEO.map((x) => x.id)));
