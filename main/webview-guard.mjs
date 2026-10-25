// What an embedded page may do, decided here rather than on the tag that
// asked for it. The preload is the one that matters: `preload.cjs` is the
// bridge the app's own page talks to the store through, so a page off the web
// holding it holds everything the person holds.
//
// The partition is deliberately left alone. It says WHERE a page's sign-ins
// go rather than what the page may reach, and flattening it would merge the
// website pane's store into the default one (shared/websites.mjs).
//
// Pinned by tests/a-website-in-the-pane-cannot-reach-the-app.test.mjs.

/**
 * Pin one attaching webview to the floor. `webPreferences` and `params` are
 * Electron's own objects from `will-attach-webview`, mutated in place, which
 * is how that event is answered.
 */
export function hardenAttachedWebview(webPreferences, params) {
  if (webPreferences) {
    // Nothing of ours reaches the page.
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.nodeIntegrationInWorker = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.experimentalFeatures = false;
    webPreferences.enableBlinkFeatures = '';

    // No embedded page starts sound before a click in it. Electron's default
    // lets any page start media the moment it loads.
    webPreferences.autoplayPolicy = 'document-user-activation-required';
  }
  if (params) {
    // A window the guest opens for itself would be a window with none of the
    // above. Links that want one go out to the real browser instead
    // (setWindowOpenHandler in main/main.mjs).
    params.allowpopups = false;
    params.nodeintegration = false;
    params.nodeintegrationinsubframes = false;
  }
  return webPreferences;
}
