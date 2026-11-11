# Handoff: state of Thunder tracker (11 Nov 2026)

**Live:** version 25 at https://dawnsommer.github.io/thundertracker/ (deployed 2 Nov 2026; pages build and Tests both green). **Version 26** (one-page print for up to 20 forms with a larger trend) is on the work branch, not deployed yet.  
**Version 28** (work branch, not deployed): the **AMBOSS tracker** extra (tab + overview card), read live from the user's AMBOSS tracker page. Version 27 (OB/GYN 11–12) is live.  
Versions 21–23 added retakes; 24–26 redesigned the printed summary (weakness waffle, one line per form).  
Version 17 added the Passive study card on the overview and redesigned the AMBOSS articles card.  
**Versions 18–20 (24 Oct 2026)** added the BlockFlow exam timer (18), its simplified setup card (19), and its synced session history, two-column layout and the scrollbar-jump fix (20).

Rules, architecture and conventions are in `CLAUDE.md`; user docs are in `README.md`.

## What exists (built Oct 2026, roughly in order)
| Area | What it does |
|---|---|
| Assessments | NBME 6–16, UWSA 1–3, Free 120 (2019/2021/2023), AMBOSS SA 1. Score, %, date, status, notes (own line under weak systems), weak systems with errors/unstable counts. **Edit list** removes and restores forms (scores kept). Planned dates, spread plan, .ics export. **Retakes** (one per form, `retake` on the item: score, %, date): shown under the first attempt as ↻ in the list (also CMS chips), as its own point on the overview trend (`trendPoints(mode, true)`; `re: true`, dashed link to the first attempt), in the activity calendar, print and CSV (`retakeOf(f)` in data.js). Averages, outlook and projection use first attempts only. |
| Score calculator | Assessments tab, hidden until opened. Built-in unofficial per-form conversions (`js/score-models.js`): Excel formulas for NBME 6–8, NBMEScore.com for 9–15 (plus Reddit fits for 15), NBMEcalc chart for 16, two sources each for UWSA 1/2, the user's formula for Free 120 2023. Sources side by side, choose one per form, user conversions, a fit to the user's own forms. Expected values tested. |
| CMS | 8 subjects, Oct 2026 releases (Neuro 10–11, EM 4, FM 6–7), Nov 2026 (OB/GYN 11–12, 7–8 retired); retired forms count as older (hidden unless taken or Show older forms). Edit list. |
| Systems | Status, confidence, UWorld %, notes. **Resources** picker (Sketchy, CKNotes, Inner Circle, Self-Made Notes, UWincorrects, Bootcamp Notes, FirstAid; synced; default: the first 3). |
| Qbanks | UWorld and AMBOSS plus custom ones; sessions; finish early; weak systems with %. |
| AMBOSS articles | Checklist with 5 read-throughs, custom articles and sections, arrange, grid/list view. |
| Overview | Countdown, outlook and projection, trend chart, CMS bars, Up next, activity calendar (with planned days), weakness matrix (shaded by errors·unstable on assessments, % on qbanks). Right of the matrix: AMBOSS articles card (ring, read-through mix, section bars split by read-throughs, last read) and, when unlocked, the Passive study summary card (`pvSummary()` in passive.js, shared with the Passive tab). |
| Passive study | Hidden tab, unlocked with a code in Settings → Extras (synced; Hide keeps progress). Divine Intervention (6 sections, 37 episodes from the user's checklist docx, add-ons and optional left out), PHYSEO (6 parts), plus **your own sections or podcasts and episodes**. 5 boxes each, notes switch, overview. Not part of Up next, the pace or the tiles; its summary card shows on the overview. |
| BlockFlow timer | Header stopwatch (or `b`) → `#timer` page (like Settings, not a tab). NBME mode (200 q, 10 × 20-q blocks of 30 min, 300 min, NBME section marks at Q50/100/150) and Custom (questions, s/question, per block, optional total shared by questions). Two clocks only: A = block, then the break countdown; B = total, paused through breaks and break overrun. Continue / Take break / Extend / finish early / pause (Space) / End (two taps). Planned breaks, optional auto mode, warning, Web Audio chimes pre-scheduled on the audio clock, notifications, Document PiP. `js/timer-engine.js` (pure) + `js/blockflow.js`. Settings and the live session local only (`thundertracker:blockflow(-session)`); **History** column (latest 3; “All N sessions” opens a side sheet: by month, name search; finished sessions: optional name or Session NN, date, s/question, per-block bars against plan) synced as its own Drive file `thundertracker-blockflow.json` via `CKCloud.addDoc`. No Back button (the stopwatch toggles). `html{scrollbar-gutter:stable}` stops the sideways jump when the short timer page drops the scrollbar; a Web Lock picks one tab to sound alerts; other tabs follow via storage events. |
| AMBOSS tracker | Extra (Settings → Extras, shown once the code has unlocked Extras; `prefs.amboss`, synced; Passive and AMBOSS each have Show/Hide, both hidden → the code box again). Reads `../amboss-tracker/` (the user's public `dawnsommer/amboss-tracker` page, one HTML file with its data on a `const D = {...};` line, rebuilt and pushed by their local MogiAmboss tool) with `fetch(no-cache)`, at most every 5 min while the tab or overview is on screen, plus Refresh; kept in memory only (the service worker's network-first cache gives an offline copy). `js/amboss-data.js` (pure, Node-tested: parse, normalise, KPIs, series, focus, why, heat, groups, browse) + `js/amboss.js` (tab: Dashboard/Questions, Current/All/Legacy; overview card under Passive). A port of the AMBOSS tracker page's own sections, restyled; no Chart.js (own SVG). If MogiAmboss changes the page's data shape, `normDashboard` is where to adapt. |
| Data | localStorage first; optional Google Drive sync (shared ThunderShadow sign-in) with daily version history (10 kept, restore in Settings); JSON and CSV backups; Exam Simulator import; printable summary (`p`): one page while it fits both Letter and A4 (measured off screen at each printable size in `fitsOnePage`), otherwise two (`buildSummary(true)`, the waffle moves to page 2). Designed for the user's 18–20 forms: every form on one line (retake inline, weak count; no weak names or notes), beside it a large trend (250×150 viewBox; first/best/latest labelled), CMS and qbanks; articles only as a stat tile; the weakness waffle across the bottom (cells 12 px once there are 13+ systems). Worst case tested: 20 forms + retakes + 17 systems + 3 qbanks on one page (`weakWaffle`, shading from `weakShade` in data.js, shared with the overview matrix). `.pr-*` styles live outside `@media print` so the measurement sees them. |
| Performance | Cache-first versioned files (repeat load: 1 request), module preloads, cached date formatters (overview 26 → 10 ms). |

## Open items and questions
- **AMBOSS SA question count:** set to 160 but not confirmed. Ask the user; it only affects the "x/qs correct" hint. To change it: `GROUPS` in `js/catalog.js`.
- **Two-tab race (known, minor):** with the app open in two tabs, an edit in one within 300 ms of an edit in the other can be ignored (the storage-event handler skips while a save is pending).
- Score conversion formulas can't be verified from this environment (the sites are blocked); they come from the user's ChatGPT-made dataset (Oct 2026).
- AMBOSS tracker: weak systems from it aren't fed into the overview's weakness matrix (could be, if wanted).
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
