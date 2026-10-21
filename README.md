# Thunder tracker

A study tracker for USMLE Step 2 CK that runs in your browser. Everything you log is saved on your device first, so it works offline and installs as an app. You can also sign in with Google to keep your progress in your Google account and use it on every device.

## What it tracks

- **Self-assessments**: NBME CCSSA Forms 6–16, UWSA 1–3 and Free 120 (2019, 2021, 2023). For each one you can log the 3-digit score, % correct, the date, notes, a review status (taken → reviewed → Anki cards made) and the systems you were weak in. You can add newer forms or releases, and hide the ones you won't take.
- **CMS forms**: all eight Clinical Mastery Series subjects, with % correct per form, a filter for older forms and an editable form list.
- **Systems**: 17 systems. For each you can set a status and a confidence rating (1–5), mark resources done (Sketchy, UWorld, AMBOSS, Anki), record your UWorld % correct and keep notes. You can add your own topics and sort the list several ways.
- **Qbanks**: a card each for UWorld and AMBOSS, plus any you add. Enter the bank size and where you are now (questions done, or % of the bank, and % correct). Sessions you log (date, questions, % correct) add on top. Mark a qbank **Finished** when you're done with it, even below 100%; it then leaves the pace, and you can tick its weak systems. The tab shows completion, questions left, accuracy weighted by questions, the last 7 days, your streak and a 12-week volume chart.
- **AMBOSS articles**: the AMBOSS Step 2 CK master checklist (26 articles in 6 sections; its "Step 2 Prep Condensed" list is left out). Each article has 5 boxes, ticked once per read-through, plus a last-read date, notes and a link to AMBOSS. A summary at the top shows articles read, read-throughs, how many sit at each count, and a bar per section. The compact grid fits every article on screen (a list view is there too). You can sort articles within sections, collapse sections, and put sections in your own order with **Arrange sections** (the order syncs). You can add your own articles to any section, with an optional AMBOSS link, and add your own sections (for example one per system).

The overview page brings this together:

- **Countdown** to your test date.
- **Score outlook**: a trend-line projection of your 3-digit score to test day, plus your latest, best and recent-average scores.
- **Score trend chart**: switches between 3-digit score and % correct, with lines for the passing score (218) and your target.
- **CMS progress** by subject.
- **Recurring weak systems**: a matrix with a row per system and a column per marked NBME/UWSA/Free 120 (oldest to newest), plus finished qbanks. A filled square means you were weak there. Rows are sorted by how often a system came up, systems weak 2 or more times are highlighted, and a dot marks systems weak in your last two assessments. It scrolls sideways when you have many forms.
- **AMBOSS articles** progress by section.
- **Activity calendar** covering the last 20 weeks. Qbank questions fill a day's square (darker means more), a self-assessment adds a yellow diamond, a CMS form a teal border and a system update a pink dot. Tap a day to see what you did.
- **"Up next" suggestions**: the next assessment to take, the pace you need (assessments and questions per day for each qbank), forms still to review, unread articles, your weakest subject, low-confidence systems and a backup reminder.

Use the moon/sun button in the header (or press `t`) to switch between light mode, dark mode and matching your device. **Settings** (the gear, or `,`) is a full page covering your plan, Google sync, appearance, qbanks, backup and import, shortcuts and erasing data.

## Your data

Progress is always saved in this browser first (`localStorage`, key `ck-tracker`).

- **Google sync (optional).** Go to Settings → Google account → **Sign in with Google**. Your progress is saved to a private app folder in your Google Drive (`appDataFolder`, which doesn't appear in your Drive files) and kept in sync across your devices. It's careful with network use:
  - **The Worker** is only called to sign in or out, and about once an hour while you use the app, to renew the Google access token. The token is reused across reloads and tabs.
  - **Your edits** are batched into one upload, about 10 seconds after you stop editing and at most 60 seconds after the first change. They also go up right away when you leave the app.
  - **Other devices' changes** are checked when the app opens, and when you return to it at most every 5 minutes. A check is one small file listing; downloads and uploads happen only when something changed.
  - **If Google can't be reached**, it waits longer between tries (30 seconds up to 15 minutes). Each record carries a change timestamp, so edits made on two devices are merged rather than overwritten. Deletions carry over to your other devices, and restoring or erasing applies everywhere.
- **Backups.** Settings → **Export backup** saves a JSON file you can import on any device. **Export CSV** gives you a spreadsheet. If you used the earlier single-file version, import its backup file and your forms, systems and notes carry over.
- **Step Exam Simulator.** Settings → **Import from Exam Simulator** (also on the Assessments tab) reads the simulator's progress backup `.zip`. You can also pick the `*_progress_save.json` files directly. You see a preview before anything is saved.
  - `N-xx` becomes an NBME form, `UWSAx` becomes a UWSA and `C-IM-03`-style IDs become CMS forms. % correct uses your first attempt, and the 3-digit score comes from `progress_metadata.json`.
  - Your own values are kept unless you tick *Replace my values*. Unfinished tests are skipped.
  - Custom question sets can be logged as qbank sessions.
  - Importing the same file again changes nothing.

### How Google sign-in works (same setup as ThunderShadow)

Sign-in goes through the shared `study-tools-auth-worker` Cloudflare Worker. The page sends you to the Worker's `/oauth/start` with `app_id=thundertracker`, and the Worker returns you to the app with a session in `#cloud-auth=`. The page keeps only that session. It exchanges it at `/token` for a short-lived Google access token, which is held in memory only. Google refresh tokens and the client secret stay in the Worker. Public settings live in `config.js`; never put secrets there.

The tracker shares ThunderShadow's Google OAuth client and Drive scope (`drive.appdata`), but never touches ThunderShadow's data:

- **Drive file.** The tracker uses a single file, `thundertracker-state.json`, tagged `appId: thundertracker`. ThunderShadow only reads `thundershadow-*` files.
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

Browser tests live in `tests/` and run in a real Chromium against the static files. They cover the app, Google sync (against a stand-in Worker and Drive), Exam Simulator import (with a made-up backup built by `tests/fixtures/sim-backup.mjs`), qbanks, articles, the weakness matrix, settings, app updates and sign-in errors.

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
| `app.js` | App logic: catalog, storage, sync merge, simulator import, rendering |
| `cloud.js` | Optional Google sign-in (via the Worker) and Drive sync |
| `config.js` | Public cloud settings: app ID, Worker URL, return URL, Drive scope |
| `sw.js` | Service worker for offline use (network-first, so new deploys show up straight away) |
| `manifest.webmanifest`, `icons/` | Install metadata and app icons |

The form catalog (`GROUPS` and `SUBJ` at the top of `app.js`) is where you update the default lists when new NBME or CMS forms come out.

**Releasing a change:** bump the version in three places together: `VERSION` in `sw.js`, the `?v=` on the four file links in `index.html`, and `APP_VERSION` in `app.js`. The service worker always revalidates app files with GitHub Pages, so a reload shows the new release (no waiting out the 10-minute browser cache), and open tabs get an "updated — Reload" notice. Settings → App version → **Reload latest version** refetches everything and clears only the tracker's own `ck-tracker-…` cache. Your progress, your Google sign-in and ThunderShadow's data on the same domain are left alone.
