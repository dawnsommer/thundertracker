# Thunder tracker: notes for Claude

A static USMLE Step 2 CK tracker. Live at https://dawnsommer.github.io/thundertracker/ (GitHub Pages, `main`, root).
The repo is **public**. Read `docs/HANDOFF.md` for the current state, history and open items. User-facing docs are in `README.md`.

## Hard rules
- **Never commit personal data.** That includes the user's Exam Simulator backup, real scores and uploaded files; use the synthetic fixture in `tests/fixtures/sim-backup.mjs`. No secrets in the frontend (`js/config.js` holds only public settings).
- **Don't write the Passive study unlock code anywhere in the repo.** It's checked as a hash in `js/passive.js`; the user knows it.
- **Shared origin.** dawnsommer.github.io also hosts ThunderShadow and other apps, and they all share one localStorage and one Cache Storage. This app only touches:
  - the `ck-tracker` localStorage key and `thundertracker:*` keys (BlockFlow: `thundertracker:blockflow` settings and `thundertracker:blockflow-session`, local only; `thundertracker:blockflow-history`, synced);
  - Drive appDataFolder files named `thundertracker-*` (the state, its daily copies, and `thundertracker-blockflow.json` for BlockFlow's history);
  - caches named `ck-tracker-*`.

  ThunderShadow's `cloudflareWorkerSession` is read-only (shared sign-in). Never clear all storage or caches.
- **Deploying = the user says "deploy".** Then fast-forward `main` to the work branch, push, and confirm both GitHub Actions runs (pages build and deployment, and Tests) succeed. Do this only when asked, or when the user says to deploy in the same turn. Commit and push to the session's work branch as you go.
- Before deploying an app change, run `node tools/release.mjs`. It bumps `VERSION` in sw.js, `APP_VERSION`, and every `?v=` in index.html and all imports. It also rewrites the service worker's offline file list, `APP_FILES` and the modulepreload links. A docs-only change needs no bump.
- Run `npm test` before pushing. Every bug fix gets a test that fails without it (check by running the test against the old code).

## Architecture (no build step)
- `index.html` loads `js/config.js` and `js/cloud.js` (classic, deferred) and `js/main.js` (an ES module). main.js imports everything else.
  - **Every import carries the same `?v=N`**, otherwise a module loads twice with separate state. `tests/static.test.mjs` checks this.
- Modules (one per concern):
  - Core: `util` (helpers, `h()` element builder, cached date formatters), `catalog` (forms, CMS subjects, systems, resources, version), `model` (data shape: `norm`, change stamps, `merge`, `REC`), `store` (live `state`, `save`, `flush`, `toast`, `ui`), `data` (derived lists and stats), `sheets` (side panels, weak-system picker), `shell` (tabs, `render()`, `tabsNow()`).
  - One module per page: `overview`, `assessments`, `cms`, `systems`, `qbank`, `articles`, `settings`, `passive` (data in `passive-catalog`).
  - Features: `calculator` plus `score-models` (score estimates), `planner` (planned dates, .ics), `print` (one-page summary), `sim-import` (Exam Simulator), `backup`, `updates` (service worker registration, update notice, Reload latest version), `blockflow` (the exam timer page `#timer`, opened from the header stopwatch; one session, saved locally, drawn in the page and an optional Document Picture-in-Picture window) with its pure clock maths in `timer-engine` (timestamps, never tick counting; Node-tested).
  - Cycles are fine: function declarations are hoisted. Reassign another module's state only through its setters (`setState`, `setSaved`, `setSettingsRefresh`).
- **Rendering.** `render()` redraws the visible tab from `state`. Sheets redraw through their `refresh` callback; settings through `settingsRefresh`, which must not interrupt typing. `ui` holds view-only state; `state.prefs` is saved.
- **Saving.** `save()` batches for 300 ms, then `flush()`: stamp, write localStorage, then `cloud().markDirty()`.
- **Sync** (`js/cloud.js`, Google Drive via ThunderShadow's shared Cloudflare Worker):
  - Merges record by record. Every record has a `t` stamp; deletions leave tombstones in `deleted` (`<tag>:<id>`); a restore or erase bumps `base`.
  - Record kinds live in `REC` in model.js. **A new synced record kind needs:** a `REC` entry, its tag in the tombstone regex in `norm`, normalising in `norm`, and an entry in `blank()`.
  - Synced prefs are listed in `SYNC_PREFS` and merge as a unit (newest wins). On a device's first sync, the account's values win where set and lists are combined.
  - Traffic is budgeted: 10 s debounce (60 s max), a 5-minute foreground check, backoff 30 s → 15 min. `tests/sync-traffic.test.mjs` guards this.
  - Version history: a dated copy once a day, last 10 kept.
  - Extra documents with their own Drive file: `CKCloud.addDoc({ name, file, get, norm, merge, same, apply, empty })` and `markDocDirty(name)`. They ride the same listing, have their own dirty flag and signature, and a failure in one never fails the tracker's sync. BlockFlow's history is the only one (merge: newest `t` wins, tombstones in `del`; in `timer-engine.js`).
- **Service worker** (`sw.js`):
  - Versioned `?v=` files are cache-first.
  - The page is network-first with `cache: 'no-cache'` (beats GitHub's max-age=600), falling back to the cache after 3 s. A page that arrives late isn't stored.
  - It only deletes its own `ck-tracker-` caches.
- **Score estimates:** a form's own conversion beats its built-in source (per-form models in `score-models.js`, the user can pick the source), which beats an exam-wide conversion, which beats a fit to the user's own forms. Never extrapolate past a source's range. A typed score always wins.

## Tests
- `npm test` runs every `tests/*.test.mjs` (Playwright and Chromium; set `CHROMIUM_PATH` if needed). `npm test -- sync core` runs only files whose names start with those words.
- `tests/run.mjs` serves the app plus a GitHub-Pages-like server (max-age, 304). That server has `GET /__log` (the requests it received) and `GET /__slow?ms=N` (delays the page).
- Tests print `PASS`/`FAIL` lines. Wait for focus moves done in `setTimeout` (`waitForFunction`) instead of checking right away. Use specific selectors: several tabs have an "Edit list" button.
- Pure-Node tests: `merge.test.mjs`, `score-models.test.mjs` (the published expected values for every built-in conversion).

## Working with this user
- Plain, short reports. Show screenshots of UI changes (Playwright to the scratchpad, then SendUserFile).
- UI style they ask for: compact, "materialistic", minimal, visually pleasing. Verify layouts at desktop and phone width (no sideways scroll).
- Facts they've corrected:
  - NBME 7 has 176 questions; NBME 6 and 8 have 184.
  - The user-supplied Free 120 formula (1.165 × % + 166.17) is for the **2023** release.
  - FM 1–3, EM 1 and Neuro 6–7 are retired CMS forms.
- Don't invent score conversion formulas; use sources the user gives. Reddit and the calculator sites are blocked from this environment.
