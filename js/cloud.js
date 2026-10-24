// Optional Google sync. The tracker stays local-first: every change saves to this browser first and
// syncs in the background. Sign-in goes through the shared Cloudflare Worker (it holds the Google
// refresh token); this page keeps the Worker session and the current short-lived Google access token.
// Data is one JSON file in the Drive appDataFolder, merged record by record (see merge() in app.js).
//
// Network use is kept to what's needed:
// - The Worker is called only to sign in/out and when the access token (about an hour) runs out.
//   The token is reused across reloads and tabs, so opening the app doesn't call the Worker.
// - Edits are batched: a sync runs 10 s after you stop editing (at most 60 s after the first edit),
//   and straight away when you leave the page.
// - With no local edits, Drive is checked for other devices' changes when the app opens, and when you
//   return to it at most every 5 minutes. A check is one small file listing; download and upload
//   happen only when something actually changed.
// - Failures back off (30 s, 1, 2, 4… up to 15 minutes) instead of retrying in a loop.
// - Once a day a dated copy is saved next to it (the last 10 are kept) so you can restore an older version.
// - Other parts of the app can sync a document of their own in its own file (BlockFlow's session history:
//   thundertracker-blockflow.json). It rides along with the same listing and only uploads when it changed;
//   erasing or restoring the tracker's data never touches it.
(() => {
  'use strict';

  const CFG = (window.THUNDERTRACKER_CONFIG || {}).cloud || {};
  const APP_ID = CFG.appId || 'thundertracker';
  // Own keys, all under "thundertracker:" so nothing collides with ThunderShadow on the same origin.
  const K = {
    session: 'thundertracker:cloud-session',
    shared: 'thundertracker:cloud-shared',
    account: 'thundertracker:cloud-account',
    last: 'thundertracker:cloud-last-sync',
    sig: 'thundertracker:cloud-remote-sig',
    dirty: 'thundertracker:cloud-dirty',
    device: 'thundertracker:cloud-device-id',
    token: 'thundertracker:cloud-token',
    snap: 'thundertracker:cloud-last-history',
  };
  // ThunderShadow keeps its Worker session under this key on dawnsommer.github.io. It is only read,
  // to reuse an existing Google sign-in; this file never writes or clears it.
  const SHADOW_SESSION = 'cloudflareWorkerSession';
  const FILE_NAME = APP_ID + '-state.json';
  // Version history: one dated copy a day, `thundertracker-history-YYYY-MM-DD.json`, last HISTORY_KEEP kept.
  const HIST_PREFIX = APP_ID + '-history-', HISTORY_KEEP = 10;
  const DRIVE = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const DEBOUNCE_MS = 10000, MAX_WAIT_MS = 60000, CHECK_EVERY_MS = 5 * 60000, TOKEN_SKEW_MS = 60000, MAX_BACKOFF_MS = 15 * 60000;

  const get = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const put = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} };
  // "changes waiting to sync" is also kept in memory: with browser storage full, the flag can't be
  // written, but the edits are still in memory and should still reach Google.
  let memDirty = '';
  const dirty = () => get(K.dirty) || memDirty;
  // extra documents: { name, file, get, norm, merge, same, apply, empty }; each with its own dirty flag and Drive signature
  const docs = [];
  const dk = (d, k) => K[k] + ':' + d.name;
  const anyDirty = () => dirty() || docs.some((d) => get(dk(d, 'dirty')));
  const setDirty = (v) => { memDirty = v; put(K.dirty, v); };

  let justConnected = false, callbackError = '';
  // The Worker sends the browser back to returnUrl#cloud-auth=<session>. Take it out of the address
  // bar straight away, before the app reads the hash for tab routing. Never log or export it.
  (() => {
    const raw = location.hash.replace(/^#/, '');
    if (!/(^|&)cloud-(auth|error)=/.test(raw)) return;
    const params = new URLSearchParams(raw);
    const session = params.get('cloud-auth') || '';
    callbackError = params.get('cloud-error') || '';
    params.delete('cloud-auth'); params.delete('cloud-error');
    const rest = params.toString();
    try { history.replaceState(null, document.title, location.pathname + location.search + (rest ? '#' + rest : '')); } catch (e) {}
    if (session) { put(K.session, session); put(K.shared, ''); put(K.last, ''); put(K.sig, ''); justConnected = true; }
  })();

  let app = null, token = '', tokenExp = 0, tokenP = null, syncP = null, again = false, timer = null;
  let lastCheck = 0, firstDirtyAt = 0, failures = 0, retryAt = 0;
  const stats = { workerCalls: 0, driveCalls: 0 };
  let st = { state: 'signedout', message: '' };
  const subs = new Set();

  const configured = () => !!(CFG.appId && CFG.workerUrl && CFG.returnUrl && CFG.driveScope);
  const onSite = () => location.href.toLowerCase().startsWith(String(CFG.returnUrl).toLowerCase());
  const worker = (path) => String(CFG.workerUrl).replace(/\/$/, '') + path;
  const session = () => get(K.session);
  const authError = (msg) => Object.assign(new Error(msg), { auth: true });
  function deviceId() {
    let d = get(K.device);
    if (!d) { d = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); put(K.device, d); }
    return d;
  }

  const SHORT = { connecting: 'Connecting…', syncing: 'Syncing…', synced: 'Synced with Google', offline: 'Offline · saved here', error: 'Sync paused · saved here', expired: 'Sign in again to sync' };
  function status() {
    return {
      configured: configured(), connected: !!session(), state: st.state, message: st.message, short: SHORT[st.state] || '',
      account: get(K.account), lastSync: get(K.last), shared: get(K.shared) === '1', returnUrl: CFG.returnUrl, pending: !!anyDirty(),
      canSignIn: configured() && (onSite() || !!get(SHADOW_SESSION)),
    };
  }
  function set(state, message) {
    st = { state, message };
    subs.forEach((fn) => { try { fn(status()); } catch (e) {} });
  }

  async function timed(url, opts, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, Object.assign({}, opts, { signal: ctl.signal })); }
    catch (e) { throw ctl.signal.aborted ? new Error('Google didn’t answer in time.') : e; }
    finally { clearTimeout(t); }
  }
  function forget() {
    token = ''; tokenExp = 0;
    [K.session, K.shared, K.account, K.last, K.sig, K.dirty, K.token, K.snap].forEach((k) => put(k, ''));
    docs.forEach((d) => { put(dk(d, 'sig'), ''); put(dk(d, 'dirty'), ''); });
    memDirty = '';
  }
  // The cached token is tied to the session it came from (by a short fingerprint, not the session itself).
  const fingerprint = (x) => { let h = 0; for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  function cachedToken() {
    try {
      const c = JSON.parse(get(K.token) || 'null');
      if (c && c.f === fingerprint(session()) && c.exp > Date.now() + TOKEN_SKEW_MS && c.token) { token = c.token; tokenExp = c.exp; return true; }
    } catch (e) {}
    return false;
  }

  async function getToken(force) {
    if (!force && token && tokenExp > Date.now() + TOKEN_SKEW_MS) return token;
    if (!force && cachedToken()) return token;
    if (tokenP) return tokenP;
    const s = session();
    if (!s) throw authError('Not signed in.');
    tokenP = (async () => {
      stats.workerCalls++;
      const res = await timed(worker('/token'), { method: 'POST', headers: { Authorization: 'Bearer ' + s, Accept: 'application/json' }, cache: 'no-store' }, 15000);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          forget();
          set('expired', 'Your Google sign-in expired. Sign in again to resume syncing — your progress is safe on this device.');
          throw authError('Google sign-in expired.');
        }
        throw new Error((body.error && body.error.message) || body.message || 'Sign-in service error (' + res.status + ').');
      }
      const t = String(body.access_token || body.accessToken || body.google_access_token || body.token || '');
      if (!t) throw new Error('The sign-in service returned no Google access token.');
      token = t;
      const abs = body.expires_at ?? body.expiresAt;
      const secs = Number(body.expires_in ?? body.expiresIn ?? 3600);
      tokenExp = abs != null ? (typeof abs === 'number' ? (abs > 1e10 ? abs : abs * 1000) : Date.parse(abs)) : Date.now() + Math.max(60, secs || 3600) * 1000;
      if (!Number.isFinite(tokenExp)) tokenExp = Date.now() + 3e6;
      put(K.token, JSON.stringify({ f: fingerprint(s), token, exp: tokenExp }));
      const email = String(body.email || body.account_email || body.accountEmail || (body.account && body.account.email) || '');
      if (email) put(K.account, email);
      return token;
    })().finally(() => { tokenP = null; });
    return tokenP;
  }

  async function drive(url, opts = {}, retry = true) {
    const headers = new Headers(opts.headers || {});
    headers.set('Authorization', 'Bearer ' + await getToken());
    stats.driveCalls++;
    const res = await timed(url, Object.assign({}, opts, { headers, cache: 'no-store' }), 20000);
    if (res.status === 401 && retry) { token = ''; put(K.token, ''); await getToken(true); return drive(url, opts, false); }
    return res;
  }
  async function driveJson(url, opts, what) {
    const res = await drive(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body.error && body.error.message) || what + ' failed (' + res.status + ').');
    return body;
  }
  const sigOf = (f) => [f.id, f.modifiedTime || '', f.md5Checksum || ''].join(':');

  // One listing returns the state file and the history copies (only this app's files).
  async function listFiles() {
    const params = new URLSearchParams({
      spaces: 'appDataFolder', q: "(name = '" + FILE_NAME + "' or " + docs.map((d) => "name = '" + d.file + "' or ").join('') + "name contains '" + HIST_PREFIX + "') and trashed = false", orderBy: 'modifiedTime desc',
      pageSize: '100', fields: 'files(id,name,modifiedTime,md5Checksum,size,appProperties)',
    });
    const body = await driveJson(DRIVE + '/files?' + params, {}, 'Reading Google Drive');
    const mine = (body.files || []).filter((f) => !f.appProperties || !f.appProperties.appId || f.appProperties.appId === APP_ID);
    return { state: mine.find((f) => f.name === FILE_NAME) || null, history: mine.filter((f) => f.name.startsWith(HIST_PREFIX)),
      docs: Object.fromEntries(docs.map((d) => [d.name, mine.find((f) => f.name === d.file) || null])) };
  }
  async function removeFile(file) {
    const res = await drive(DRIVE + '/files/' + encodeURIComponent(file.id), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error('Deleting an old version failed (' + res.status + ').');
  }
  const localDay = () => { const t = new Date(); return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const docOf = (state) => ({ app: APP_ID, kind: 'state', formatVersion: 1, updatedAt: new Date().toISOString(), device: deviceId(), state });
  // Once a day after a good sync: save a dated copy and drop copies beyond the last HISTORY_KEEP.
  // A problem here never fails the sync itself.
  async function keepDailyCopy(history, state) {
    const day = localDay();
    if (get(K.snap) === day) return;
    try {
      const name = HIST_PREFIX + day + '.json';
      if (!history.some((f) => f.name === name)) await upload(null, docOf(state), name, 'history');
      const older = history.filter((f) => f.name !== name).sort((a, b) => b.name.localeCompare(a.name)).slice(HISTORY_KEEP - 1);
      for (const f of older) await removeFile(f);
      put(K.snap, day);
    } catch (e) {}
  }
  // For Settings: your saved copies, newest first.
  async function listVersions() {
    if (!session()) throw new Error('Sign in with Google first.');
    const { history } = await listFiles();
    return history.map((f) => ({ id: f.id, date: f.name.slice(HIST_PREFIX.length, HIST_PREFIX.length + 10), size: Number(f.size) || 0, modifiedTime: f.modifiedTime }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  async function getVersion(id) {
    const doc = await download({ id });
    if (!doc || doc.app !== APP_ID || !doc.state) throw new Error('That copy couldn’t be read.');
    return doc.state;
  }
  async function download(file) {
    const res = await drive(DRIVE + '/files/' + encodeURIComponent(file.id) + '?alt=media');
    if (!res.ok) throw new Error('Downloading from Google Drive failed (' + res.status + ').');
    return res.json().catch(() => null);
  }
  async function upload(file, doc, name = FILE_NAME, kind = 'state') {
    const fields = 'id,modifiedTime,md5Checksum';
    if (file) {
      return driveJson(UPLOAD + '/files/' + encodeURIComponent(file.id) + '?uploadType=media&fields=' + fields,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(doc) }, 'Saving to Google Drive');
    }
    const boundary = 'thundertracker-' + deviceId().slice(0, 8) + Date.now().toString(36);
    const meta = { name, parents: ['appDataFolder'], mimeType: 'application/json', appProperties: { appId: APP_ID, kind, formatVersion: '1' } };
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + boundary +
      '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(doc) + '\r\n--' + boundary + '--';
    return driveJson(UPLOAD + '/files?uploadType=multipart&fields=' + fields,
      { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body }, 'Saving to Google Drive');
  }

  // An extra document: same pattern as the state file (download only if changed, upload only if needed).
  // A failure here leaves its changes queued and doesn't fail the tracker's own sync.
  async function syncDoc(d, file, first) {
    try {
      const dirtyAt = get(dk(d, 'dirty')), local = d.get();
      let remote = null, merged = local;
      if (file && (first || sigOf(file) !== get(dk(d, 'sig')))) {
        const doc = await download(file);
        if (doc && doc.app === APP_ID && doc.kind === d.name && doc.data) { remote = d.norm(doc.data); merged = d.merge(local, remote); }
      }
      if (!d.same(merged, local)) d.apply(merged);
      let sig = file ? sigOf(file) : '';
      if (file ? dirtyAt || (remote && !d.same(merged, remote)) : dirtyAt || !d.empty(merged)) {
        const doc = { app: APP_ID, kind: d.name, formatVersion: 1, updatedAt: new Date().toISOString(), device: deviceId(), data: merged };
        sig = sigOf(await upload(file, doc, d.file, d.name));
      }
      put(dk(d, 'sig'), sig);
      if (get(dk(d, 'dirty')) === dirtyAt) put(dk(d, 'dirty'), ''); else again = true;
    } catch (e) { if (e && e.auth) throw e; }
  }

  // One round trip when nothing changed (a file listing). Downloads only when the Drive copy changed,
  // uploads only when this device has edits or the merge produced something Drive doesn't have.
  function syncNow(opts = {}) {
    if (!app) return Promise.resolve();
    if (!session()) return opts.manual ? connect() : Promise.resolve();
    if (!navigator.onLine) { set('offline', 'Offline — changes are saved on this device and will sync when you’re back online.'); return Promise.resolve(); }
    if (syncP) { again = true; return syncP; }
    clearTimeout(timer); timer = null;
    syncP = (async () => {
      set('syncing', 'Syncing with your Google account…');
      app.flush();
      const dirtyAt = dirty(), first = !get(K.last);
      const files = await listFiles(), file = files.state;
      const local = app.getState();
      let remote = null, merged = local;
      if (file && (first || sigOf(file) !== get(K.sig))) {
        const doc = await download(file);
        if (doc && doc.app === APP_ID && doc.state) {
          remote = app.norm(doc.state);
          merged = app.merge(local, remote, { first });
        }
      }
      if (!app.same(merged, local)) app.applyRemote(merged);
      let sigNow = file ? sigOf(file) : '';
      if (!file || first || dirtyAt || (remote && !app.same(merged, remote))) {
        const saved = await upload(file, docOf(merged));
        sigNow = sigOf(saved);
      }
      for (const d of docs) await syncDoc(d, files.docs[d.name], first);
      await keepDailyCopy(files.history, merged);
      put(K.sig, sigNow);
      if (dirty() === dirtyAt) { setDirty(''); firstDirtyAt = 0; } else again = true;
      put(K.last, new Date().toISOString());
      lastCheck = Date.now(); failures = 0; retryAt = 0;
      const acct = get(K.account);
      set('synced', 'Synced with your Google account' + (acct ? ' (' + acct + ')' : '') + '.');
    })().catch((e) => {
      if (!(e && e.auth)) {
        if (!navigator.onLine) set('offline', 'Offline — changes are saved on this device and will sync when you’re back online.');
        else {
          // back off instead of hammering the Worker/Drive; edits stay queued locally
          failures++;
          const wait = Math.min(MAX_BACKOFF_MS, 30000 * 2 ** (failures - 1));
          retryAt = Date.now() + wait;
          set('error', 'Couldn’t sync with Google — your progress is safe on this device. Trying again in ' + (wait < 60000 ? Math.round(wait / 1000) + ' s' : Math.round(wait / 60000) + ' min') + '. ' + ((e && e.message) || ''));
          if (anyDirty()) { clearTimeout(timer); timer = setTimeout(() => { timer = null; syncNow().catch(() => {}); }, wait); }
        }
      }
      if (opts.manual) throw e;
    }).finally(() => {
      syncP = null;
      if (again) { again = false; schedule(); }
    });
    return syncP;
  }
  // Debounced: waits for a pause in editing, but never more than MAX_WAIT_MS after the first edit.
  function schedule() {
    if (!session()) return;
    clearTimeout(timer);
    const now = Date.now();
    if (!firstDirtyAt) firstDirtyAt = now;
    // while backing off after a failure, wait for the retry time
    const wait = Math.max(retryAt - now, 0, Math.min(DEBOUNCE_MS, firstDirtyAt + MAX_WAIT_MS - now));
    timer = setTimeout(() => { timer = null; syncNow().catch(() => {}); }, wait);
  }
  function markDirty() {
    setDirty(String(Date.now()));
    schedule();
  }

  async function connect() {
    if (session()) return syncNow({ manual: true });
    // Already signed in to ThunderShadow in this browser? Reuse that Google sign-in, no redirect.
    const shadow = get(SHADOW_SESSION);
    if (shadow) {
      put(K.session, shadow); put(K.shared, '1');
      set('connecting', 'Using your ThunderShadow Google sign-in…');
      try { await getToken(true); return await syncNow({ manual: true }); }
      catch (e) { if (!e.auth) throw e; } // expired there too: fall through to a normal sign-in
    }
    if (!configured()) throw new Error('Google sync isn’t configured.');
    if (!onSite()) throw new Error('Google sign-in works on the published site: ' + CFG.returnUrl);
    if (app) app.flush();
    set('connecting', 'Opening Google sign-in…');
    const params = new URLSearchParams({ app_id: APP_ID, return_url: CFG.returnUrl, device_id: deviceId() });
    const url = worker('/oauth/start') + '?' + params;
    // Ask the Worker first, so a refusal (e.g. this app's address not on its allow-list) is explained here
    // instead of leaving you on a raw error page. If the reply can't be read, go ahead as normal.
    try {
      const res = await timed(url, { redirect: 'manual', cache: 'no-store', credentials: 'omit' }, 8000);
      if (res.type !== 'opaqueredirect' && res.status >= 400) {
        const body = await res.json().catch(() => ({}));
        const code = String(body.error || body.message || 'HTTP ' + res.status);
        const msg = /return_url|redirect/i.test(code)
          ? 'Google sign-in isn’t set up for Thunder tracker yet: the sign-in service doesn’t have ' + CFG.returnUrl + ' on its allow-list (“' + code + '”). ' +
            'Until it’s added, sign in to ThunderShadow in this same browser, then tap Sign in here — the tracker can use that sign-in.'
          : 'The sign-in service refused the request (“' + code + '”). Your progress is safe on this device.';
        set('error', msg);
        throw Object.assign(new Error(msg), { refused: true });
      }
    } catch (e) { if (e.refused) throw e; }
    location.assign(url);
  }

  async function disconnect() {
    const s = session(), shared = get(K.shared) === '1';
    let reached = true;
    // A borrowed ThunderShadow session is only forgotten here, never revoked, so ThunderShadow stays signed in.
    if (s && !shared && navigator.onLine) {
      try {
        const res = await timed(worker('/disconnect'), { method: 'POST', headers: { Authorization: 'Bearer ' + s, Accept: 'application/json' }, cache: 'no-store' }, 15000);
        reached = res.ok;
      } catch (e) { reached = false; }
    }
    clearTimeout(timer); timer = null;
    forget();
    set('signedout', shared ? 'Signed out of sync here. ThunderShadow stays signed in.'
      : reached ? 'Signed out. Your progress stays on this device and in your Google account.'
      : 'Signed out on this device (the sign-in service couldn’t be reached).');
  }

  // Opening or returning to the app: push pending edits, otherwise look for other devices' changes
  // only if the last check is more than CHECK_EVERY_MS old (this also covers reloads and other tabs).
  function lastSeen() { return Math.max(lastCheck, Date.parse(get(K.last)) || 0); }
  function foreground() {
    if (!session() || !navigator.onLine || Date.now() < retryAt) return;
    if (anyDirty() || Date.now() - lastSeen() > CHECK_EVERY_MS) syncNow().catch(() => {});
  }

  function init(api) {
    if (app) return;
    app = api;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') foreground();
      // leaving the page: send pending edits now rather than waiting for the debounce
      else if (anyDirty() && session() && navigator.onLine && !syncP) { app.flush(); syncNow().catch(() => {}); }
    });
    window.addEventListener('online', () => { failures = 0; retryAt = 0; if (anyDirty()) syncNow().catch(() => {}); else foreground(); });
    window.addEventListener('offline', () => { if (session()) set('offline', 'Offline — changes are saved on this device and will sync when you’re back online.'); });
    if (callbackError) set('error', 'Google sign-in didn’t finish: ' + callbackError);
    else if (session()) {
      // opening the app checks Drive once; with a fresh cached token this doesn't call the Worker
      set('connecting', 'Restoring Google sync…'); syncNow().catch(() => {});
    }
    else set('signedout', '');
  }

  // register an extra document (before or after init); markDocDirty(name) queues its upload
  function addDoc(d) { if (!docs.some((x) => x.name === d.name)) docs.push(d); }
  function markDocDirty(name) { const d = docs.find((x) => x.name === name); if (d) { put(dk(d, 'dirty'), String(Date.now())); schedule(); } }

  window.CKCloud = {
    init, connect, addDoc, markDocDirty, disconnect, syncNow, markDirty, status, listVersions, getVersion, stats: () => Object.assign({}, stats),
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    justConnected: () => { const j = justConnected; justConnected = false; return j; },
  };
})();
