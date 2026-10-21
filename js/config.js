// Public cloud settings only. Never put a client secret, refresh token or Worker secret here.
// Same shared Worker and Google OAuth client as ThunderShadow; the app ID gives this tracker its own
// Drive file (thundertracker-state.json) so it never reads or writes ThunderShadow's data.
window.THUNDERTRACKER_CONFIG = Object.freeze({
  cloud: Object.freeze({
    appId: 'thundertracker',
    workerUrl: 'https://study-tools-auth-worker.summerofdawn20.workers.dev',
    returnUrl: 'https://dawnsommer.github.io/thundertracker/',
    driveScope: 'https://www.googleapis.com/auth/drive.appdata',
  }),
});
