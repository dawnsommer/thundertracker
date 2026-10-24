# Handoff: state of Thunder tracker (23 Oct 2026)

**Live:** version 19 at https://dawnsommer.github.io/thundertracker/ (deployed 24 Oct 2026). All checks pass locally and on GitHub Actions.  
Version 17 added the Passive study card on the overview and redesigned the AMBOSS articles card.  
**Version 19 (24 Oct 2026)** added the BlockFlow exam timer (18) and its simplified setup card (19): summary numbers, a block strip that is also the break planner, one options row, the rest under More.

Rules, architecture and conventions are in `CLAUDE.md`; user docs are in `README.md`.

## What exists (built Oct 2026, roughly in order)
| Area | What it does |
|---|---|
| Assessments | NBME 6–16, UWSA 1–3, Free 120 (2019/2021/2023), AMBOSS SA 1. Score, %, date, status, notes (own line under weak systems), weak systems with errors/unstable counts. **Edit list** removes and restores forms (scores kept). Planned dates, spread plan, .ics export. |
| Score calculator | Assessments tab, hidden until opened. Built-in unofficial per-form conversions (`js/score-models.js`): Excel formulas for NBME 6–8, NBMEScore.com for 9–15 (plus Reddit fits for 15), NBMEcalc chart for 16, two sources each for UWSA 1/2, the user's formula for Free 120 2023. Sources side by side, choose one per form, user conversions, a fit to the user's own forms. Expected values tested. |
| CMS | 8 subjects, Oct 2026 releases (Neuro 10–11, EM 4, FM 6–7); retired forms count as older (hidden unless taken or Show older forms). Edit list. |
| Systems | Status, confidence, UWorld %, notes. **Resources** picker (Sketchy, CKNotes, Inner Circle, Self-Made Notes, UWincorrects, Bootcamp Notes, FirstAid; synced; default: the first 3). |
| Qbanks | UWorld and AMBOSS plus custom ones; sessions; finish early; weak systems with %. |
| AMBOSS articles | Checklist with 5 read-throughs, custom articles and sections, arrange, grid/list view. |
| Overview | Countdown, outlook and projection, trend chart, CMS bars, Up next, activity calendar (with planned days), weakness matrix (shaded by errors·unstable on assessments, % on qbanks). Right of the matrix: AMBOSS articles card (ring, read-through mix, section bars split by read-throughs, last read) and, when unlocked, the Passive study summary card (`pvSummary()` in passive.js, shared with the Passive tab). |
| Passive study | Hidden tab, unlocked with a code in Settings → Extras (synced; Hide keeps progress). Divine Intervention (6 sections, 37 episodes from the user's checklist docx, add-ons and optional left out), PHYSEO (6 parts), plus **your own sections or podcasts and episodes**. 5 boxes each, notes switch, overview. Not part of Up next, the pace or the tiles; its summary card shows on the overview. |
| BlockFlow timer | Header stopwatch (or `b`) → `#timer` page (like Settings, not a tab). NBME mode (200 q, 10 × 20-q blocks of 30 min, 300 min, NBME section marks at Q50/100/150) and Custom (questions, s/question, per block, optional total shared by questions). Two clocks only: A = block, then the break countdown; B = total, paused through breaks and break overrun. Continue / Take break / Extend / finish early / pause (Space) / End (two taps). Planned breaks, optional auto mode, warning, Web Audio chimes pre-scheduled on the audio clock, notifications, Document PiP. `js/timer-engine.js` (pure) + `js/blockflow.js`. Settings and the live session local only (`thundertracker:blockflow(-session)`); **History** column (finished sessions: optional name or Session NN, date, s/question, per-block bars against plan) synced as its own Drive file `thundertracker-blockflow.json` via `CKCloud.addDoc`. No Back button (the stopwatch toggles). `html{scrollbar-gutter:stable}` stops the sideways jump when the short timer page drops the scrollbar; a Web Lock picks one tab to sound alerts; other tabs follow via storage events. |
| Data | localStorage first; optional Google Drive sync (shared ThunderShadow sign-in) with daily version history (10 kept, restore in Settings); JSON and CSV backups; Exam Simulator import; printable one-page summary (`p`). |
| Performance | Cache-first versioned files (repeat load: 1 request), module preloads, cached date formatters (overview 26 → 10 ms). |

## Open items and questions
- **AMBOSS SA question count:** set to 160 but not confirmed. Ask the user; it only affects the "x/qs correct" hint. To change it: `GROUPS` in `js/catalog.js`.
- **Two-tab race (known, minor):** with the app open in two tabs, an edit in one within 300 ms of an edit in the other can be ignored (the storage-event handler skips while a save is pending).
- Score conversion formulas can't be verified from this environment (the sites are blocked); they come from the user's ChatGPT-made dataset (Oct 2026).
- Ideas offered but not built: a sync status in side panels (deliberately removed), CSV/print for Passive study.

## Releasing checklist
1. Make the change and add or adjust tests.
2. `npm test` (everything passes).
3. `node tools/release.mjs` (version +1) when app files changed.
4. Commit and push the work branch.
5. On "deploy": `git fetch origin main && git merge-base --is-ancestor origin/main HEAD && git push origin HEAD:main`, then confirm the "pages build and deployment" and "Tests" runs on that commit (GitHub MCP `actions_list`).
6. Tell the user to tap "updated — Reload" (or Settings → App version → Reload latest version).

## Fixing the user's other web apps (same update problem)
The fix this app uses (versioned URLs, the service worker strategy, the update notice, Reload latest version, cache prefixes per app on the shared origin) is written up as a self-contained prompt in `docs/update-fix-prompt.md`. The user gives it to Codex (or a new Claude session with that repo attached).
