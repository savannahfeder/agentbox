// THE APP UPDATES ITSELF, so nobody is ever asked to download it twice.
//
// There is a signed, notarised build on astral.ac now, so the horse is in
// front.
//
// WHAT IT DOES, in the order it happens. A few seconds after the window is up
// it asks GitHub whether there is a newer Agentbox. If there is, it downloads it
// quietly in the background, and when the download finishes it says so in
// Settings and in ⌘K. Nothing restarts under her. The restart is the button she
// pressed, which is the half she asked for by name.
//
// FOUR THINGS ABOUT THE SHAPE, each load-bearing:
//
// 1. IT NEVER OPENS A DIALOG AND NEVER STEALS FOCUS. electron-updater will pop
//    a native box on some paths if you let it; every one of those is off here.
//    An app that interrupts her to tell her it is healthy is the thing her
//    whole inbox exists to stop.
// 2. IT IS SILENT WHEN IT FAILS. A laptop on a plane, a GitHub outage, a
//    corporate proxy: none of those are her problem and none of them get a
//    banner. The failure is recorded, `state` reports it, and the Settings row
//    is the one place that ever says so, because that is the screen you open
//    when you want to know something.
// 3. IT DOES NOTHING AT ALL FROM SOURCE. `autoUpdater.isUpdaterActive` is false
//    when `app.isPackaged` is false, so a dev run skips the check rather than
//    erroring against a feed it has no business reading. We report that state
//    as `unsupported` with a reason rather than pretending to be idle.
// 4. IT INSTALLS ON QUIT TOO. If she never presses the button and just quits,
//    the downloaded update is applied then, so the next launch is current. The
//    button is the fast path, not the only path.
//
// WHERE THE UPDATE COMES FROM. `Astral-Agent/astral-releases`, the same public
// repo astral.ac/download already redirects to, configured in package.json's
// `build.publish`. electron-updater reads `releases/latest`, then
// `latest-mac.yml` on that release, and compares its `version` against this
// build's. It downloads the `.zip`, NOT the `.dmg`: Squirrel. Mac swaps an .app
// bundle and cannot read a disk image, which is why `build.mac.target` gained a
// zip beside the dmg and why a release that ships only a dmg fails with
// ERR_UPDATER_ZIP_FILE_NOT_FOUND. `scripts/publish-download.mjs` is what puts
// all three files on the release together.
//
// AND THE ONE THING THAT IS NOT TRUE ANY MORE. `main/analytics.mjs` opens by
// calling itself the only place anything leaves this machine. Since this file
// exists that is no longer so: an update check is a request to github.com. It
// carries no identity, no key and no account, and it is not routed through
// PostHog, but it IS traffic, and `legal/privacy.html` should say so in a
// sentence. That page is in the website repo, not this one.

import { createRequire } from 'node:module';
import { Name } from '../shared/product-name.mjs';

const require = createRequire(import.meta.url);

// How long after launch the first check happens. Long enough that it is never
// competing with the window painting or the supervisor waking its sessions up.
const FIRST_CHECK_MS = 20_000;
// And then this often, for the app somebody leaves open for days, which is the
// normal way Agentbox is used.
const EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * PURE, and the whole of what the screens are allowed to know.
 *
 * Kept separate from the class below so the states can be tested without an
 * Electron app, a network, or a packaged build.
 */
export function describe(state) {
  const { phase, currentVersion, newVersion, percent, error, checkedAt, readyAt } = state;
  return {
    phase,
    currentVersion,
    newVersion: newVersion ?? null,
    // Whole percent, because a progress number with decimals on it reads as
    // machinery rather than as an answer.
    percent: typeof percent === 'number' ? Math.max(0, Math.min(100, Math.round(percent))) : null,
    error: error ?? null,
    checkedAt: checkedAt ?? null,
    // WHEN THE DOWNLOAD FINISHED, which is the moment the news is true. The
    // inbox row this feeds wears it at its right end like every other row, and
    // every other row's right end answers "how old is this". Built off the
    // clock instead it would read "now" forever, which is the app looking busy
    // about something that has been sitting on the disk since lunchtime.
    readyAt: phase === 'ready' ? (readyAt ?? null) : null,
    // The one question every screen actually asks. A screen should not have to
    // learn which phase strings mean "there is a button to press".
    ready: phase === 'ready',
  };
}

export function createUpdater({ app, log = console, onChanged = () => {} }) {
  let state = {
    phase: 'idle',
    currentVersion: app.getVersion(),
    newVersion: null,
    percent: null,
    error: null,
    checkedAt: null,
    readyAt: null,
  };
  let timer = null;
  let stopped = false;

  const set = (next) => {
    state = { ...state, ...next };
    try { onChanged(describe(state)); } catch {}
  };

  // Loaded lazily and inside a try, so a build that somehow shipped without the
  // dependency degrades to "no updates" instead of failing to boot at all. The
  // app not starting is a strictly worse outcome than the app not updating.
  let autoUpdater = null;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    set({ phase: 'unsupported', error: 'This build has no updater in it.' });
    log.warn?.('[updater] electron-updater is not available:', e?.message ?? e);
  }

  if (autoUpdater) {
    // Quiet by construction. `autoDownload` is the only one of these that is
    // already the default; the rest are here because their defaults interrupt.
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    // electron-updater logs to console by default, which is fine, but its
    // `logger` is also what it uses to report errors it swallows. Ours keeps
    // them out of the crash reporter and in the terminal where a build is
    // being watched.
    autoUpdater.logger = {
      info: (...a) => log.info?.('[updater]', ...a),
      warn: (...a) => log.warn?.('[updater]', ...a),
      error: (...a) => log.error?.('[updater]', ...a),
      debug: () => {},
    };

    autoUpdater.on('checking-for-update', () => set({ phase: 'checking', error: null }));
    autoUpdater.on('update-not-available', () => set({
      phase: 'current', newVersion: null, percent: null, error: null, checkedAt: Date.now(),
    }));
    autoUpdater.on('update-available', (info) => set({
      phase: 'downloading', newVersion: info?.version ?? null, percent: 0, error: null, checkedAt: Date.now(),
    }));
    autoUpdater.on('download-progress', (p) => set({ phase: 'downloading', percent: p?.percent ?? null }));
    // STAMPED ONCE, not on every redraw: a second `update-downloaded` for the
    // same version would otherwise make the row young again and move it back to
    // the top of her list for news she has already read.
    autoUpdater.on('update-downloaded', (info) => set({
      phase: 'ready', newVersion: info?.version ?? state.newVersion, percent: 100, error: null,
      readyAt: state.phase === 'ready' && state.readyAt ? state.readyAt : Date.now(),
    }));
    // SILENT ON PURPOSE. See point 2 at the top of this file.
    autoUpdater.on('error', (e) => set({
      phase: 'error',
      // The message only. electron-updater puts a whole stack on some of these
      // and Settings shows this string to a person.
      error: shortError(e),
      checkedAt: Date.now(),
    }));
  }

  async function check({ manual = false } = {}) {
    if (stopped || !autoUpdater) return describe(state);
    if (!autoUpdater.isUpdaterActive()) {
      // A build run from source. Say which it is rather than reporting a
      // healthy "up to date" that was never checked.
      set({
        phase: 'unsupported',
        error: `${Name} only updates itself when it is installed as an app.`,
        checkedAt: Date.now(),
      });
      return describe(state);
    }
    // Once it is downloaded there is nothing left to check for; checking again
    // would walk the state backwards under a button that says Restart.
    if (state.phase === 'ready') return describe(state);
    if (state.phase === 'checking' || (state.phase === 'downloading' && !manual)) return describe(state);
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      set({ phase: 'error', error: shortError(e), checkedAt: Date.now() });
    }
    return describe(state);
  }

  // THE BUTTON. Quit, swap the app, come back up on the new one.
  function install() {
    if (!autoUpdater || state.phase !== 'ready') return false;
    // `isSilent` true so macOS does not put its own progress window over her
    // screen; `isForceRunAfter` true so the app comes back, which is the whole
    // point of pressing a button that says Restart.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  }

  function start() {
    if (stopped || timer) return;
    const tick = () => { void check(); };
    setTimeout(tick, FIRST_CHECK_MS).unref?.();
    timer = setInterval(tick, EVERY_MS);
    timer.unref?.();
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, check, install, state: () => describe(state) };
}

// electron-updater's errors arrive as Error objects whose `message` is
// occasionally the entire server response. One line, and a sentence a person
// can read, for the few we can name.
export function shortError(e) {
  const raw = String(e?.message ?? e ?? 'Something went wrong.').split('\n')[0].trim();
  // AND THE NAME IS ON `code`, NOT IN THE MESSAGE. electron-updater builds
  // these through builder-util-runtime's `newError`, which puts the
  // ERR_UPDATER_ name on the error's `code` and leaves the message as prose
  // with the whole URL in it. Matching the message alone reached none of them.
  // Measured 2026-08-29 in a packaged build against the real GitHub feed: the
  // published v0.1.0 carries only the .dmg, so the check 404s on
  // latest-mac.yml and Settings read "Cannot find latest-mac.yml in the latest
  // release artifacts (https://github.com/Astral-Agent/astral-releases/
  // releases/download/v0.1.0/latest-mac.yml): HttpErr…" to her. The sentence
  // for exactly that failure was already on the line below it.
  const named = `${e?.code ?? ''} ${raw}`;
  if (/ERR_UPDATER_ZIP_FILE_NOT_FOUND/.test(named)) return 'That release has no app in it to install.';
  if (/ERR_UPDATER_CHANNEL_FILE_NOT_FOUND/.test(named)) return 'That release is missing its update file.';
  if (/ERR_UPDATER_NO_PUBLISHED_VERSIONS|LATEST_VERSION_NOT_FOUND/.test(named)) return 'No published version to update to yet.';
  if (/ENOTFOUND|EAI_AGAIN|ENETDOWN|ETIMEDOUT|ECONNREFUSED|ECONNRESET/.test(raw)) return 'Could not reach the internet.';
  // AND THE SAME FAILURE UNDER CHROMIUM'S NAME FOR IT. The line above catches
  // Node's codes, and electron-updater does not always use Node: the check
  // runs through Electron's own `net` module, whose errors read
  // `net::ERR_CONNECTION_REFUSED`. That is not `ECONNREFUSED`, so it fell
  // through to the last line and Settings said `net::ERR_CONNECTION_REFUSED`
  // to her. Measured on 2026-08-29, in a packaged build with the update feed
  // switched off mid-run: that exact string was on the screen.
  if (/^net::ERR_/.test(raw)) return 'Could not reach the internet.';
  return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
}
