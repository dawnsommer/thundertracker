// Optional Google sync. The tracker stays local-first: every change saves to this browser first and
// syncs in the background. Sign-in goes through the shared Cloudflare Worker (it holds the Google
// refresh token); this page only keeps the Worker session, and Google access tokens live in memory.
// Data is one JSON file in the Drive appDataFolder, merged record by record (see merge() in app.js).
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
  };
  // ThunderShadow keeps its Worker session under this key on dawnsommer.github.io. It is only read,
  // to reuse an existing Google sign-in; this file never writes or clears it.
  const SHADOW_SESSION = 'cloudflareWorkerSession';
  const FILE_NAME = APP_ID + '-state.json';
  const DRIVE = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const DEBOUNCE_MS = 4000, FOREGROUND_MS = 60000, TOKEN_SKEW_MS = 60000;

  const get = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const put = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} };

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

  let app = null, token = '', tokenExp = 0, tokenP = null, syncP = null, again = false, timer = null, lastForeground = 0;
  let st = { state: 'signedout', message: '' };
  const subs = new Set();

  const configured = () => !!(CFG.appId && CFG.workerUrl && CFG.returnUrl && CFG.driveScope);
  const onSite = () => location.protocol === 'https:' && location.href.toLowerCase().startsWith(String(CFG.returnUrl).toLowerCase());
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
      account: get(K.account), lastSync: get(K.last), shared: get(K.shared) === '1', returnUrl: CFG.returnUrl,
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
    [K.session, K.shared, K.account, K.last, K.sig, K.dirty].forEach((k) => put(k, ''));
  }

  async function getToken(force) {
    if (!force && token && tokenExp > Date.now() + TOKEN_SKEW_MS) return token;
    if (tokenP) return tokenP;
    const s = session();
    if (!s) throw authError('Not signed in.');
    tokenP = (async () => {
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
      const email = String(body.email || body.account_email || body.accountEmail || (body.account && body.account.email) || '');
      if (email) put(K.account, email);
      return token;
    })().finally(() => { tokenP = null; });
    return tokenP;
  }

  async function drive(url, opts = {}, retry = true) {
    const headers = new Headers(opts.headers || {});
    headers.set('Authorization', 'Bearer ' + await getToken());
    const res = await timed(url, Object.assign({}, opts, { headers, cache: 'no-store' }), 20000);
    if (res.status === 401 && retry) { token = ''; await getToken(true); return drive(url, opts, false); }
    return res;
  }
  async function driveJson(url, opts, what) {
    const res = await drive(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body.error && body.error.message) || what + ' failed (' + res.status + ').');
    return body;
  }
  const sigOf = (f) => [f.id, f.modifiedTime || '', f.md5Checksum || ''].join(':');

  async function findFile() {
    const params = new URLSearchParams({
      spaces: 'appDataFolder', q: "name = '" + FILE_NAME + "' and trashed = false", orderBy: 'modifiedTime desc',
      pageSize: '10', fields: 'files(id,name,modifiedTime,md5Checksum,appProperties)',
    });
    const body = await driveJson(DRIVE + '/files?' + params, {}, 'Reading Google Drive');
    return (body.files || []).find((f) => !f.appProperties || !f.appProperties.appId || f.appProperties.appId === APP_ID) || null;
  }
  async function download(file) {
    const res = await drive(DRIVE + '/files/' + encodeURIComponent(file.id) + '?alt=media');
    if (!res.ok) throw new Error('Downloading from Google Drive failed (' + res.status + ').');
    return res.json().catch(() => null);
  }
  async function upload(file, doc) {
    const fields = 'id,modifiedTime,md5Checksum';
    if (file) {
      return driveJson(UPLOAD + '/files/' + encodeURIComponent(file.id) + '?uploadType=media&fields=' + fields,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(doc) }, 'Saving to Google Drive');
    }
    const boundary = 'thundertracker-' + deviceId().slice(0, 8) + Date.now().toString(36);
    const meta = { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json', appProperties: { appId: APP_ID, kind: 'state', formatVersion: '1' } };
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + boundary +
      '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(doc) + '\r\n--' + boundary + '--';
    return driveJson(UPLOAD + '/files?uploadType=multipart&fields=' + fields,
      { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body }, 'Saving to Google Drive');
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
      const dirtyAt = get(K.dirty), first = !get(K.last);
      const file = await findFile();
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
        const saved = await upload(file, { app: APP_ID, kind: 'state', formatVersion: 1, updatedAt: new Date().toISOString(), device: deviceId(), state: merged });
        sigNow = sigOf(saved);
      }
      put(K.sig, sigNow);
      if (get(K.dirty) === dirtyAt) put(K.dirty, ''); else again = true;
      put(K.last, new Date().toISOString());
      const acct = get(K.account);
      set('synced', 'Synced with your Google account' + (acct ? ' (' + acct + ')' : '') + '.');
    })().catch((e) => {
      if (!(e && e.auth)) {
        if (!navigator.onLine) set('offline', 'Offline — changes are saved on this device and will sync when you’re back online.');
        else set('error', 'Couldn’t sync with Google — your progress is safe on this device. ' + ((e && e.message) || ''));
      }
      if (opts.manual) throw e;
    }).finally(() => {
      syncP = null;
      if (again) { again = false; schedule(800); }
    });
    return syncP;
  }
  function schedule(ms) {
    clearTimeout(timer);
    if (!session()) return;
    timer = setTimeout(() => { timer = null; syncNow().catch(() => {}); }, ms == null ? DEBOUNCE_MS : ms);
  }
  function markDirty() {
    put(K.dirty, String(Date.now()));
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
    location.assign(worker('/oauth/start') + '?' + params);
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

  function foreground() {
    if (!session() || !navigator.onLine) return;
    if (get(K.dirty) || Date.now() - lastForeground > FOREGROUND_MS) { lastForeground = Date.now(); syncNow().catch(() => {}); }
  }

  function init(api) {
    if (app) return;
    app = api;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') foreground(); });
    window.addEventListener('focus', foreground);
    window.addEventListener('online', () => syncNow().catch(() => {}));
    window.addEventListener('offline', () => { if (session()) set('offline', 'Offline — changes are saved on this device and will sync when you’re back online.'); });
    if (callbackError) set('error', 'Google sign-in didn’t finish: ' + callbackError);
    else if (session()) { set('connecting', 'Restoring Google sync…'); lastForeground = Date.now(); syncNow().catch(() => {}); }
    else set('signedout', '');
  }

  window.CKCloud = {
    init, connect, disconnect, syncNow, markDirty, status,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    justConnected: () => { const j = justConnected; justConnected = false; return j; },
  };
})();
