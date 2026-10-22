# Thunder tracker

A study tracker for USMLE Step 2 CK that runs in your browser. Everything you log is saved on your device first, so it works offline and installs as an app. You can also sign in with Google to keep your progress in your Google account and use it on every device.

## What it tracks

- **Self-assessments**: NBME CCSSA Forms 6–16 (200 questions; Forms 6 and 8 have 184, Form 7 has 176), UWSA 1–3, Free 120 (2019, 2021, 2023) and the AMBOSS Self-Assessment. For each one you can log the 3-digit score, % correct, the date, notes, a review status (taken → reviewed → Anki cards made) and the systems you were weak in. You can add newer forms or releases. **Edit list** removes the ones you won't take (and brings them back); your scores are kept.
  - **Score calculator** (the **Score calculator** button on the Assessments tab, hidden until you open it): turns your result (% correct, questions wrong or questions correct) into an estimated 3-digit score. Built-in conversions, all unofficial, live in `js/score-models.js`:
    - **NBME 6–8** (184 questions; Form 7 has 176): a legacy Excel calculator's formulas (no score past 91 wrong).
    - **NBME 9–14**: NBMEScore.com's published per-form regressions. **NBME 15**: NBMEScore.com, plus the r/Step2 author's straight-line and curved fits.
    - **NBME 16**: NBMEcalc's chart (made for the equated % correct on the NBME report; with a self-counted % it's a rough guide).
    - **UWSA 1**: NBMEScore.com's anchors, or NBMECalculator.com's table. **UWSA 2**: NBMEScore.com's `280 − 0.85 × wrong`, or NBMECalculator.com's table (≈ `280 − 1.08 × wrong`).
    - **Free 120 (2023)**: `1.165 × % + 166.17`. UWSA 3 and the 2019 and 2021 Free 120s have no published conversion.

    For a chosen form the calculator lists every source side by side and flags when they differ by 10+ points; tap one to use it for that form (it syncs). Nothing is extrapolated past a source's range. An estimate comes from, in order: your own conversion for that form, the form's built-in source, your conversion for the exam type, then a straight-line fit to your own forms with both numbers (3 or more; Free 120 borrows your NBME fit). A form with % correct but no score shows `≈score`. A score you type yourself is never changed; the editor shows how far it is from the estimate.
  - **Planned dates**: **Plan dates** sets a date for each form you haven't taken (also in each form's editor). **Spread unplanned forms** spaces them out between tomorrow and two days before your test, skipping older forms and putting the Free 120s in your last week. **Add to calendar (.ics)** downloads the plan for Google Calendar, Apple Calendar or Outlook. Planned days show on the activity calendar and in Up next, and overdue ones are flagged.
- **CMS forms**: all eight Clinical Mastery Series subjects, with % correct per form, a filter for older forms and an editable form list. Includes the October 2026 releases (Neurology 10–11, Emergency Medicine 4, Family Medicine 6–7); retired forms (Neurology 6–7, Emergency Medicine 1, Family Medicine 1–3) count as older.
- **Systems**: 17 systems. For each you can set a status and a confidence rating (1–5), tick off resources (choose which with **Resources**: Sketchy, CKNotes, Inner Circle, Self-Made Notes, UWincorrects, Bootcamp Notes, FirstAid; Sketchy, CKNotes and Inner Circle by default), record your UWorld % correct and keep notes. You can add your own topics and sort the list several ways.
- **Qbanks**: a card each for UWorld and AMBOSS, plus any you add. Enter the bank size and where you are now (questions done, or % of the bank, and % correct). Sessions you log (date, questions, % correct) add on top. Mark a qbank **Finished** when you're done with it, even below 100%; it then leaves the pace, and you can tick its weak systems. The tab shows completion, questions left, accuracy weighted by questions, the last 7 days, your streak and a 12-week volume chart.
- **AMBOSS articles**: the AMBOSS Step 2 CK master checklist (26 articles in 6 sections; its "Step 2 Prep Condensed" list is left out). Each article has 5 boxes, ticked once per read-through, plus a last-read date, notes and a link to AMBOSS. A summary at the top shows articles read, read-throughs, how many sit at each count, and a bar per section. The compact grid fits every article on screen (a list view is there too). You can sort articles within sections, collapse sections, and put sections in your own order with **Arrange sections** (the order syncs). You can add your own articles to any section, with an optional AMBOSS link, and add your own sections (for example one per system).
- **Passive study** (hidden until you unlock it): Settings → **Extras**, enter the code, and a **Passive** tab appears on your devices (it syncs; **Hide** puts it away and keeps your progress). It tracks Divine Intervention Podcasts episodes from the Step 2 CK master checklist (v3 with the Ep 573 core additions, 6 sections and 37 episodes; its "Recommended add-ons" and "Optional" lists are left out) and PHYSEO's Emergency Medicine, Neurology, Ethics, Biostatistics, Pediatrics and OB/Gyn. **+ Add a section or podcast** adds your own (another podcast, a topic) with your own episodes. Each item has 5 boxes, one per time through; each episode also has a notes switch, so you can tell video-only from video + notes. An overview shows episodes and hours listened, notes done, PHYSEO passes and your last activity, and you can filter to To do, Video only or With notes. It's optional: it stays out of Up next, the pace and the overview. The code only hides the tab; it's not a password.

The overview page brings this together:

- **Countdown** to your test date.
- **Score outlook**: a trend-line projection of your 3-digit score to test day, plus your latest, best and recent-average scores.
- **Score trend chart**: switches between 3-digit score and % correct, with lines for the passing score (218) and your target.
- **CMS progress** by subject.
- **Recurring weak systems**: a matrix with a row per system and a column per marked NBME/UWSA/Free 120 (oldest to newest), plus finished qbanks. A filled square means you were weak there. Squares can be shaded (optional, in the weak-system picker): on an assessment, by the questions you got wrong (errors) and right-but-unsure (unstable) in that system, from your review; an unstable question counts half, and under 3 is light, 3–4 medium, 5+ dark, with errors·unstable printed in it. On a qbank, by your % correct: under 55% dark, 55–64% medium, 65%+ light (UWorld falls back to the UWorld % you logged for that system). Rows are sorted by how often a system came up, systems weak 2 or more times are highlighted, and a dot marks systems weak in your last two assessments. It scrolls sideways when you have many forms.
- **AMBOSS articles** progress by section.
- **Activity calendar** covering the last 20 weeks. Qbank questions fill a day's square (darker means more), a self-assessment adds a yellow diamond, a CMS form a teal border and a system update a pink dot. The next 8 weeks show your planned assessments and test day. Tap a day to see what you did (or what's planned).
- **"Up next" suggestions**: the next assessment to take, the pace you need (assessments and questions per day for each qbank), forms still to review, unread articles, your weakest subject, low-confidence systems and a backup reminder.

The printer button in the header (or `p`, or Settings → **Print summary**) prints a **one-page summary**: test date, target and outlook, every assessment with its score and weak systems, planned forms, the score trend, CMS by subject, qbanks, recurring weak systems and articles. It always prints black on white, even in dark mode, and your browser's own Print gives the same page.

Use the moon/sun button in the header (or press `t`) to switch between light mode, dark mode and matching your device. **Settings** (the gear, or `,`) is a full page covering your plan, Google sync, appearance, qbanks, backup and import, shortcuts and erasing data.

## Your data

Progress is always saved in this browser first (`localStorage`, key `ck-tracker`).

- **Google sync (optional).** Go to Settings → Google account → **Sign in with Google**. Your progress is saved to a private app folder in your Google Drive (`appDataFolder`, which doesn't appear in your Drive files) and kept in sync across your devices. It's careful with network use:
  - **The Worker** is only called to sign in or out, and about once an hour while you use the app, to renew the Google access token. The token is reused across reloads and tabs.
  - **Your edits** are batched into one upload, about 10 seconds after you stop editing and at most 60 seconds after the first change. They also go up right away when you leave the app.
  - **Other devices' changes** are checked when the app opens, and when you return to it at most every 5 minutes. A check is one small file listing; downloads and uploads happen only when something changed.
  - **If Google can't be reached**, it waits longer between tries (30 seconds up to 15 minutes). Each record carries a change timestamp, so edits made on two devices are merged rather than overwritten. Deletions carry over to your other devices, and restoring or erasing applies everywhere.
  - **Version history.** The first sync each day also saves a dated copy (`thundertracker-history-YYYY-MM-DD.json`, in the same private app folder), and the last 10 are kept. Settings → Google sync → **Version history** lists them; **Restore** brings one back on every device, and you can undo right after.
- **Backups.** Settings → **Export backup** saves a JSON file you can import on any device. **Export CSV** gives you a spreadsheet. If you used the earlier single-file version, import its backup file and your forms, systems and notes carry over.
- **Step Exam Simulator.** Settings → **Import from Exam Simulator** (also on the Assessments tab) reads the simulator's progress backup `.zip`. You can also pick the `*_progress_save.json` files directly. You see a preview before anything is saved.
  - `N-xx` becomes an NBME form, `UWSAx` becomes a UWSA and `C-IM-03`-style IDs become CMS forms. % correct uses your first attempt, and the 3-digit score comes from `progress_metadata.json`.
  - Your own values are kept unless you tick *Replace my values*. Unfinished tests are skipped.
  - Custom question sets can be logged as qbank sessions.
  - Importing the same file again changes nothing.

### How Google sign-in works (same setup as ThunderShadow)

Sign-in goes through the shared `study-tools-auth-worker` Cloudflare Worker. The page sends you to the Worker's `/oauth/start` with `app_id=thundertracker`, and the Worker returns you to the app with a session in `#cloud-auth=`. The page keeps only that session. It exchanges it at `/token` for a short-lived Google access token, which is held in memory only. Google refresh tokens and the client secret stay in the Worker. Public settings live in `config.js`; never put secrets there.

The tracker shares ThunderShadow's Google OAuth client and Drive scope (`drive.appdata`), but never touches ThunderShadow's data:

- **Drive files.** The tracker uses `thundertracker-state.json` plus its daily `thundertracker-history-*.json` copies, all tagged `appId: thundertracker`. ThunderShadow only reads `thundershadow-*` files.
- **Browser storage.** The tracker writes only `ck-tracker` and `thundertracker:*` keys.
- **Shared sign-in.** If you're already signed in to ThunderShadow in the same browser (both apps are on `dawnsommer.github.io`), the tracker reuses that sign-in instead of asking again. It only reads ThunderShadow's `cloudflareWorkerSession`, never changes it, and signing out of the tracker doesn't sign ThunderShadow out.

**One-time setup (required):** the Worker only accepts app IDs and return URLs it knows. Until `thundertracker` → `https://dawnsommer.github.io/thundertracker/` is registered, sign-in fails with `invalid_return_url`. Register it in the Worker's configuration next to the existing entries (`thundershadow` → `…/ThunderShadow/`, `exam-simulator2` → `…/exam-simulator2/`) and redeploy the Worker. No Google Cloud change is needed, because Google only sees the Worker's own `/oauth/callback`. Before redirecting, the app checks the Worker's answer and explains a refusal in Settings. Until the Worker is updated, the tracker can sync through an existing ThunderShadow sign-in in the same browser.

## Hosting on GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then pick `main` and `/ (root)`.
3. Open `https://<user>.github.io/<repo>/`. On a phone, use **Add to Home Screen** to install it as an app.

All paths are relative, so the app works from any sub-path.

## Developing

There's no build step. Serve the folder and open it:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

### Tests

Browser tests live in `tests/` and run in a real Chromium against the static files. They cover the app, Google sync and version history (against a stand-in Worker and Drive), the sync merge on its own (`tests/merge.test.mjs`), the service worker's caching (repeat loads, deploys, slow networks), fixes found in reviews (`tests/regressions.test.mjs`), the built-in score conversions (`tests/score-models.test.mjs`, against their published expected values), the score calculator and planner, the printed summary (including a one-page check on Letter and A4), Exam Simulator import (with a made-up backup built by `tests/fixtures/sim-backup.mjs`), qbanks, articles, the weakness matrix, settings, app updates and sign-in errors.

```sh
npm install
npx playwright install chromium   # once
npm test                          # everything, about 2 minutes
npm test -- sync core             # only tests whose file names start with these
```

`tests/run.mjs` starts the local servers the tests need and prints a summary; set `CHROMIUM_PATH` to use an existing Chromium. GitHub Actions runs the same suite on every push (`.github/workflows/tests.yml`).

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `styles.css` | Styles: light and dark themes, phone layout |
| `js/main.js` | Entry point (an ES module): keyboard shortcuts and start-up; loads the rest |
| `js/util.js`, `js/catalog.js` | Shared helpers; what the app tracks (forms, systems, qbanks, articles) |
| `js/model.js`, `js/store.js`, `js/data.js` | Saved-data shape, normalising and sync merge; live state and saving; derived stats |
| `js/shell.js`, `js/sheets.js` | Tabs and rendering; side panels |
| `js/overview.js`, `js/assessments.js`, `js/cms.js`, `js/systems.js`, `js/qbank.js`, `js/articles.js`, `js/settings.js` | One module per page |
| `js/passive.js`, `js/passive-catalog.js` | The Passive study tab and what it tracks |
| `js/score-models.js`, `js/calculator.js`, `js/planner.js`, `js/print.js` | Built-in score conversions; score calculator and estimates; planned dates and calendar file; one-page printed summary |
| `js/sim-import.js`, `js/backup.js`, `js/updates.js` | Exam Simulator import; backup and CSV; app updates |
| `js/config.js`, `js/cloud.js` | Public cloud settings; optional Google sign-in and Drive sync |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest`, `icons/` | Install metadata and app icons |
| `tests/`, `tools/release.mjs` | Browser tests; version bump for releases |

The form catalog (`GROUPS` and `SUBJ` in `js/catalog.js`) is where you update the default lists when new NBME or CMS forms come out.

**Releasing a change:** run `node tools/release.mjs`. It bumps `VERSION` in `sw.js`, `APP_VERSION` and every `?v=` (in `index.html`, `sw.js` and the imports between modules) together, and refreshes the offline file list. `npm test` checks that they all match. The service worker always revalidates app files with GitHub Pages, so a reload shows the new release (no waiting out the 10-minute browser cache), and open tabs get an "updated — Reload" notice. Settings → App version → **Reload latest version** refetches everything and clears only the tracker's own `ck-tracker-…` cache. Your progress, your Google sign-in and ThunderShadow's data on the same domain are left alone.
