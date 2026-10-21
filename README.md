# Step 2 CK Tracker

A study tracker for USMLE Step 2 CK that runs entirely in your browser. There's no account and no server: everything you log is saved on your device. You can install it as an app, and it works offline.

## What it tracks

- **Self-assessments**: NBME CCSSA Forms 6–16, UWSA 1–3 and Free 120 (2019, 2021, 2023). For each one you can log the 3-digit score, % correct, the date, notes and a review status (taken → reviewed → Anki cards made). You can add newer forms or releases, and hide the ones you won't take.
- **CMS forms**: all eight Clinical Mastery Series subjects, with % correct per form, a filter for older forms and an editable form list.
- **Systems**: 17 systems. For each you can set a status and a confidence rating (1–5), mark resources done (Sketchy, UWorld, AMBOSS, Anki), record your UWorld % correct and keep notes. You can add your own topics and sort the list several ways.
- **Qbank**: log each study session (date, number of questions, % correct, which qbank). It shows your completion of the bank, accuracy weighted by questions, the last 7 days, your streak and a 12-week volume chart.

The overview page brings this together:

- **Countdown** to your test date.
- **Score outlook**: a trend-line projection of your 3-digit score to test day, plus your latest, best and recent-average scores.
- **Score trend chart**: switches between 3-digit score and % correct, with lines for the passing score (218) and your target.
- **CMS progress** by subject.
- **Activity calendar** covering the last 20 weeks.
- **"Up next" suggestions**: the next assessment to take, the pace you need, forms still to review, your weakest subject, low-confidence systems and a backup reminder.

## Your data

Progress is stored in your browser's `localStorage`. Use **Settings → Export backup** regularly. The backup is a JSON file that you can import on any device to move your progress there, or to restore it. **Export CSV** gives you a spreadsheet of everything.

If you used the earlier single-file version, import its backup file. Your forms, systems and notes carry over.

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

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `styles.css` | Styles: light and dark themes, phone layout |
| `app.js` | All app logic: catalog, storage, rendering |
| `sw.js` | Service worker for offline use (network-first, so new deploys show up straight away) |
| `manifest.webmanifest`, `icons/` | Install metadata and app icons |

The form catalog (`GROUPS` and `SUBJ` at the top of `app.js`) is where you update the default lists when new NBME or CMS forms come out. Bump `CACHE` in `sw.js` when you change the list of cached files.
