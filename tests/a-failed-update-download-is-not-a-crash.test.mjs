// HALF THE CRASH REPORTS OF LAUNCH WEEK WERE THIS, AND NOT ONE OF THEM WAS A
// CRASH.
//
// Measured in PostHog on 2026-10-08, reading every `crash_report` since the
// Oct 6 launch. Of the 14 real crashes, 7 are `main-rejection` and all 7 are
// the updater:
//
//   5 say "Cannot update while running on a read-only volume. The application
//     is on a read-only volume. Please move the application and try again."
//     That is Squirrel.Mac's own error, arriving with `code: 8`, and it means
//     the app is being run out of the disk image or out of Downloads under
//     macOS App Translocation. Two installs, three and two reports each, one
//     every six hours, which is `EVERY_MS`.
//   2 say `net::ERR_CONNECTION_RESET`: the download dropped mid-transfer.
//
// WHY THEY ESCAPED. `check()` awaits `checkForUpdates()` and catches it, and
// `autoUpdater.on('error')` already puts the failure in Settings, so the
// visible half was right. But with `autoDownload` on, electron-updater starts
// the download inside `doCheckForUpdates` and hands the promise back on the
// result object as `downloadPromise` (electron-updater's AppUpdater.js), where
// `downloadUpdate` dispatches the error event and then RE-THROWS. Nobody was
// holding that promise. So a failed download became an unhandledRejection,
// `main/crash-report.mjs` filed it as a crash, and an app that had not crashed
// reported itself as having done so every six hours for as long as it was open.
//
// The three facts that decide the fix: the person already sees the right
// thing, the app is still running, and the report is the only thing wrong. So
// the download promise is taken hold of and its failure swallowed in `check`,
// after the error event has already carried the news to the screen.

import { afterEach, describe, expect, it } from 'vitest';
import { createUpdater } from '../main/updater.mjs';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const app = { getVersion: () => '0.1.12' };

// Enough of electron-updater's surface for `createUpdater` to drive, and no
// more. `checkForUpdates` answers the shape the real one does: a result object
// whose `downloadPromise` is the auto-download already in flight, which
// dispatches `error` and then re-throws, exactly as `downloadUpdate` does.
function fakeUpdater({ download }) {
  const listeners = new Map();
  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: true,
    logger: null,
    on(event, fn) { listeners.set(event, fn); return this; },
    emit(event, ...args) { listeners.get(event)?.(...args); },
    isUpdaterActive: () => true,
    async checkForUpdates() {
      this.emit('checking-for-update');
      this.emit('update-available', { version: '0.1.13' });
      const downloadPromise = download().catch((err) => {
        this.emit('error', err);
        throw err;
      });
      return { isUpdateAvailable: true, updateInfo: { version: '0.1.13' }, downloadPromise };
    },
  };
}

// Every rejection Node could not place, for the length of one test.
function watchRejections() {
  const seen = [];
  const onRejection = (reason) => seen.push(reason);
  process.on('unhandledRejection', onRejection);
  return { seen, stop: () => process.removeListener('unhandledRejection', onRejection) };
}

let stopWatching = null;
afterEach(() => { stopWatching?.(); stopWatching = null; });

// A rejection is reported on a later turn than the one it happened on, so an
// assertion made straight after the await would pass whatever the code did.
const settle = () => new Promise((r) => setTimeout(r, 20));

// Squirrel's words, as they reached PostHog, minus the URL at the end.
const READ_ONLY = 'Cannot update while running on a read-only volume. '
  + 'The application is on a read-only volume. Please move the application and try again.';

describe('a download that fails is reported to the person, not to the crash reporter', () => {
  // THE REPORTED ONE. Two launch installs, five reports, zero crashes.
  it('does not leave the read-only volume failure as an unhandled rejection', async () => {
    const watch = watchRejections();
    stopWatching = watch.stop;
    const autoUpdater = fakeUpdater({
      download: () => Promise.reject(Object.assign(new Error(READ_ONLY), { code: 8 })),
    });

    await createUpdater({ app, log: quiet, autoUpdater }).check();
    await settle();

    expect(watch.seen).toEqual([]);
  });

  // THE OTHER TWO, which are one bug wearing a different message: a download
  // that starts and then drops is the same unheld promise.
  it('does not leave a dropped connection as an unhandled rejection', async () => {
    const watch = watchRejections();
    stopWatching = watch.stop;
    const autoUpdater = fakeUpdater({
      download: () => Promise.reject(new Error('net::ERR_CONNECTION_RESET')),
    });

    await createUpdater({ app, log: quiet, autoUpdater }).check();
    await settle();

    expect(watch.seen).toEqual([]);
  });

  // THE HALF THAT WAS ALREADY RIGHT, pinned so the fix cannot be a swallow that
  // also hides the failure from the one screen meant to say so.
  it('still tells Settings the update failed, in a sentence', async () => {
    const autoUpdater = fakeUpdater({
      download: () => Promise.reject(new Error('net::ERR_CONNECTION_RESET')),
    });

    const u = createUpdater({ app, log: quiet, autoUpdater });
    await u.check();
    await settle();

    expect(u.state().phase).toBe('error');
    expect(u.state().error).toBe('Could not reach the internet.');
  });

  // THE CASE THAT MUST NOT CHANGE. A download that works is a download that
  // works, and swallowing a failure may not turn a success into one.
  it('leaves a download that succeeds alone', async () => {
    const watch = watchRejections();
    stopWatching = watch.stop;
    const autoUpdater = fakeUpdater({ download: () => Promise.resolve(['/tmp/one.zip']) });

    const u = createUpdater({ app, log: quiet, autoUpdater });
    await u.check();
    autoUpdater.emit('update-downloaded', { version: '0.1.13' });
    await settle();

    expect(watch.seen).toEqual([]);
    expect(u.state().phase).toBe('ready');
    expect(u.state().ready).toBe(true);
  });

  // AND THE ONE WITH NO DOWNLOAD AT ALL. `checkForUpdates` answers null when
  // the feed has nothing newer, so the fix may not assume a result object is
  // there to read `downloadPromise` off.
  it('survives a check that answers nothing at all', async () => {
    const autoUpdater = fakeUpdater({ download: () => Promise.resolve([]) });
    autoUpdater.checkForUpdates = async () => null;

    await expect(createUpdater({ app, log: quiet, autoUpdater }).check()).resolves.toBeTruthy();
  });
});
