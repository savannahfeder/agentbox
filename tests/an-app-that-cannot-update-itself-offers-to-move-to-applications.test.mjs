// TWO INSTALLS HAVE BEEN STUCK ON 0.1.11 SINCE THE LAUNCH, AND NOTHING IN THE
// APP EVER SAID SO.
//
// Measured in PostHog on 2026-10-12, reading every `crash_report` of the three
// weeks before it. 23 of the 26 `main-rejection` reports carry one message,
// and the report has carried it all along (`properties.error.message`):
//
//   "Cannot update while running on a read-only volume. The application is on
//    a read-only volume. Please move the application and try again. If you'll
//    need to move the application out of the Downloads directory."
//
// That is Squirrel.Mac refusing to update an app that is being run out of the
// disk image, or out of Downloads under macOS App Translocation. Every one is
// 0.1.11, from two installs, one report every six hours, which is `EVERY_MS`
// in main/updater.mts. The app carries on running; the reports stopped being
// filed as crashes in 292d419.
//
// THE REPORT WAS NEVER THE PROBLEM. These two Macs cannot update themselves
// from where they are, so no release reaches them, and the app's only word
// about it was Squirrel's paragraph in the Settings row — if anybody opened
// Settings. Nothing offered to move the app, which is the one press that fixes
// it for good.
//
// So: the app reads where it is running from, and when that is a place macOS
// will not let it update from, the Settings row, the sidebar card and ⌘K all
// offer to move it into Applications (Electron's own
// `moveToApplicationsFolder`, which moves the bundle and relaunches).
//
// THE CASES THAT MUST NOT MATCH ARE THE POINT OF HALF THIS FILE. An app
// already in Applications, an app in an ordinary writable folder, a copy run
// from a checkout, and a Linux install all update themselves perfectly well,
// and an offer to move any of them is a sentence about nothing.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlace, placeOfApp, sayWhere } from '../shared/where-it-runs-from.mjs';
import { createUpdater, shortError } from '../main/updater.mts';
import { MOVE_SAY, updateLook } from '../renderer/src/update-row.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// The three paths, as macOS actually hands them over.
const ON_THE_DISK_IMAGE = '/Volumes/Agentbox 0.1.13/Agentbox.app/Contents/MacOS/Agentbox';
const TRANSLOCATED = '/private/var/folders/q7/8n2x0000gn/T/AppTranslocation/3F9C1A22-6B4E-4F7A-9C11-72A0E2E1D5B8/d/Agentbox.app/Contents/MacOS/Agentbox';
const IN_APPLICATIONS = '/Applications/Agentbox.app/Contents/MacOS/Agentbox';

const mac = (over = {}) => ({ platform: 'darwin', packaged: true, inApplications: false, ...over });

describe('where this copy is running from', () => {
  // THE REPORTED ONE. Two installs, 23 reports, no updates since Oct 6.
  it('knows an app run out of the disk image cannot update itself', () => {
    const where = placeOfApp(mac({ exePath: ON_THE_DISK_IMAGE }));
    expect(where.place).toBe('disk-image');
    expect(where.canUpdate).toBe(false);
    expect(where.offerMove).toBe(true);
  });

  // THE OTHER HALF OF THE SAME MESSAGE: Squirrel names Downloads because macOS
  // runs a quarantined app from a read-only copy of its own instead.
  it('knows a translocated copy cannot update itself either', () => {
    const where = placeOfApp(mac({ exePath: TRANSLOCATED }));
    expect(where.place).toBe('translocated');
    expect(where.canUpdate).toBe(false);
    expect(where.offerMove).toBe(true);
  });

  // THE BOUNDARY ON THE OTHER SIDE. An app in Applications is the whole point
  // of the offer, so it is the one place that must never be offered it.
  it('offers nothing to an app already in Applications', () => {
    const where = placeOfApp(mac({ exePath: IN_APPLICATIONS, inApplications: true }));
    expect(where.place).toBe('applications');
    expect(where.canUpdate).toBe(true);
    expect(where.offerMove).toBe(false);
  });

  // AND THE CASE THAT LOOKS LIKE THE BUG AND IS NOT ONE. A copy sitting in
  // Downloads that macOS did NOT translocate is on a writable disk and
  // Squirrel updates it happily. Reading "Downloads" out of Squirrel's
  // sentence and offering on that would nag these people for nothing.
  it('leaves an app in an ordinary writable folder alone', () => {
    const where = placeOfApp(mac({ exePath: '/Users/alex/Downloads/Agentbox.app/Contents/MacOS/Agentbox' }));
    expect(where.place).toBe('elsewhere');
    expect(where.canUpdate).toBe(true);
    expect(where.offerMove).toBe(false);
  });

  // A CHECKOUT IS NOT AN INSTALL. It updates by `git fetch`
  // (main/source-updater.mts) and it has no bundle to move.
  it('never offers to move a copy run from a checkout', () => {
    const where = placeOfApp(mac({ packaged: false, exePath: '/Volumes/work/agentbox/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron' }));
    expect(where.place).toBe('source');
    expect(where.offerMove).toBe(false);
  });

  // `moveToApplicationsFolder` is macOS only, and a Linux install has no
  // Applications folder to be moved into.
  it('never offers to move a Linux install', () => {
    const where = placeOfApp({ platform: 'linux', packaged: true, inApplications: false, exePath: '/opt/agentbox/agentbox' });
    expect(where.place).toBe('not-mac');
    expect(where.offerMove).toBe(false);
  });

  // Nothing known is not an offer.
  it('offers nothing when it cannot tell where it is', () => {
    expect(placeOfApp().offerMove).toBe(false);
    expect(placeOfApp(mac({ exePath: null })).offerMove).toBe(false);
  });
});

// Enough of Electron's `app` for `createPlace` to read, and no more.
function fakeApp({ exe = ON_THE_DISK_IMAGE, inApplications = false, move = () => true, platform = 'darwin' } = {}) {
  const calls = [];
  return {
    calls,
    isPackaged: true,
    platform,
    getPath: (what) => (what === 'exe' ? exe : '/'),
    isInApplicationsFolder: () => inApplications,
    moveToApplicationsFolder: (...args) => { calls.push(args); return move(); },
  };
}

const quiet = { info() {}, warn() {}, error() {}, debug() {} };

describe('moving the app into Applications', () => {
  it('asks Electron to move the bundle, once', () => {
    const app = fakeApp();
    const place = createPlace({ app, log: quiet });
    expect(place.state().offerMove).toBe(true);
    expect(place.move()).toEqual({ moved: true, error: null });
    expect(app.calls.length).toBe(1);
  });

  // THE PERSON SAID NO. Electron answers false when they cancel its own
  // replace-the-other-copy box, and a cancel is not a failure to report.
  it('reports a move the person cancelled as not moved, with nothing wrong', () => {
    const app = fakeApp({ move: () => false });
    expect(createPlace({ app, log: quiet }).move()).toEqual({ moved: false, error: null });
  });

  // AND THE REAL FAILURE: `moveToApplicationsFolder` throws. One line, a
  // sentence a person can read, because Settings shows this string to them.
  it('keeps the reason a move failed, in one line', () => {
    const app = fakeApp({ move: () => { throw new Error('Permission denied\n  at moveToApplicationsFolder'); } });
    const got = createPlace({ app, log: quiet }).move();
    expect(got.moved).toBe(false);
    expect(got.error).toBe('Permission denied');
  });

  // The guard that keeps this from ever being a surprise: a copy with nothing
  // to fix does not get moved by a stray call.
  it('refuses to move a copy that is already where it should be', () => {
    const app = fakeApp({ exe: IN_APPLICATIONS, inApplications: true });
    const place = createPlace({ app, log: quiet });
    expect(place.state().offerMove).toBe(false);
    expect(place.move().moved).toBe(false);
    expect(app.calls).toEqual([]);
  });
});

describe('what the updater tells the screens about it', () => {
  const app = { getVersion: () => '0.1.11' };
  // No electron-updater: `createUpdater` degrades to `unsupported`, which is
  // all this part needs, because the place is read at construction.
  const updaterWith = (place, over = {}) => createUpdater({
    app, log: quiet, place, autoUpdater: { isUpdaterActive: () => false, on() { return this; } }, ...over,
  });

  it('carries the offer and where it is, so every surface draws one answer', () => {
    const state = updaterWith({ state: () => ({ place: 'disk-image', canUpdate: false, offerMove: true }), move: () => ({ moved: true, error: null }) }).state();
    expect(state.canMove).toBe(true);
    expect(state.place).toBe('disk-image');
    expect(state.moveError).toBe(null);
  });

  it('says nothing about a place that updates itself', () => {
    const state = updaterWith({ state: () => ({ place: 'applications', canUpdate: true, offerMove: false }), move: () => ({ moved: false, error: null }) }).state();
    expect(state.canMove).toBe(false);
    expect(state.place).toBe(null);
  });

  it('has no offer at all with no place behind it', () => {
    const state = updaterWith(null).state();
    expect(state.canMove).toBe(false);
    expect(state.place).toBe(null);
  });

  // A FAILED MOVE REACHES THE SCREEN THE WAY EVERYTHING ELSE DOES: through the
  // state and the push, so the row and the sidebar say the same thing.
  it('pushes the reason a move failed, and keeps the offer standing', () => {
    const pushed = [];
    const u = updaterWith(
      { state: () => ({ place: 'translocated', canUpdate: false, offerMove: true }), move: () => ({ moved: false, error: 'Permission denied' }) },
      { onChanged: (s) => pushed.push(s) },
    );
    expect(u.move()).toEqual({ moved: false, error: 'Permission denied' });
    expect(u.state().moveError).toBe('Permission denied');
    expect(u.state().canMove).toBe(true);
    expect(pushed.at(-1).moveError).toBe('Permission denied');
  });
});

// Squirrel's own paragraph used to be what Settings showed: 160 characters of
// it, cut mid-sentence, with a URL in the middle.
describe('the words Squirrel sends', () => {
  it('becomes one sentence about where the app is', () => {
    const said = shortError(Object.assign(new Error(
      'Cannot update while running on a read-only volume. The application is on a read-only volume. '
      + 'Please move the application and try again. If you\'ll need to move the application out of the '
      + 'Downloads directory. See https://github.com/Squirrel/Squirrel.Mac for more information.',
    ), { code: 8 }));
    expect(said).toBe(MOVE_SAY.cannotUpdateHere);
    expect(said).not.toContain('http');
    expect(said.length).toBeLessThan(120);
  });

  it('leaves the failures that have nothing to do with the place alone', () => {
    expect(shortError(new Error('net::ERR_CONNECTION_RESET'))).toBe('Could not reach the internet.');
  });
});

describe('what the screens say', () => {
  const state = (over = {}) => ({
    phase: 'idle', currentVersion: '0.1.11', newVersion: null, percent: null, error: null,
    checkedAt: null, readyAt: null, ready: false, source: false, changes: [], behind: null,
    installing: false, place: null, canMove: false, moveError: null, ...over,
  });

  it('offers the move instead of another check, and names the disk image', () => {
    const look = updateLook(state({ phase: 'error', error: MOVE_SAY.cannotUpdateHere, place: 'disk-image', canMove: true }));
    expect(look.move).toBe(true);
    expect(look.button).toBe(MOVE_SAY.button);
    expect(look.restart).toBe(false);
    expect(look.busy).toBe(false);
    expect(look.sentence).toContain('disk image');
    expect(look.sentence).toContain('Applications');
    expect(look.sentence).not.toContain('up to date');
  });

  it('says a translocated copy is one macOS made, not one you put there', () => {
    const look = updateLook(state({ place: 'translocated', canMove: true }));
    expect(look.move).toBe(true);
    expect(look.sentence).toContain('macOS');
    expect(look.sentence).toContain('Applications');
    expect(look.sentence).not.toContain('disk image');
  });

  it('keeps the reason a move failed, and says a second press retries', () => {
    const look = updateLook(state({ place: 'disk-image', canMove: true, moveError: 'Permission denied' }));
    expect(look.sentence).toContain('Permission denied');
    expect(look.sentence).toContain('tries again');
    expect(look.move).toBe(true);
  });

  // THE CASES THAT MUST NOT BECOME A MOVE. A version on the disk is a restart,
  // a check in flight is a check, and neither is about where the app lives.
  it('still offers the restart when a version is waiting', () => {
    const look = updateLook(state({ phase: 'ready', ready: true, newVersion: '0.1.13', canMove: true }));
    expect(look.move).toBe(false);
    expect(look.restart).toBe(true);
  });

  it('offers nothing to press while a check or a rebuild is running', () => {
    expect(updateLook(state({ canMove: true }), { checking: true }).move).toBe(false);
    expect(updateLook(state({ installing: true, canMove: true })).move).toBe(false);
  });

  it('is silent about the place on every copy that can update itself', () => {
    for (const phase of ['idle', 'current', 'checking', 'downloading', 'error', 'unsupported']) {
      const look = updateLook(state({ phase }));
      expect(look.move).toBe(false);
      expect(look.sentence).not.toContain('Applications');
    }
  });
});

describe('the three surfaces that offer it', () => {
  it('is the Settings row`s own button, through one door', () => {
    const settings = read('renderer/src/components/Settings.tsx');
    expect(settings).toContain('api.updateMove()');
    expect(settings).toMatch(/import \{[^}]*updateLook[^}]*\} from '\.\.\/update-row'/);
  });

  it('is a card in the sidebar, which is where the app says things about itself', () => {
    expect(read('renderer/src/components/WorkspaceNavigation.tsx')).toContain('onMove');
    expect(read('renderer/src/components/SidebarUpdate.tsx')).toContain('MOVE_SAY');
    expect(read('renderer/src/App.tsx')).toContain('api.updateMove()');
  });

  // The card is one sidebar wide. Photographed on 2026-10-12, the row's own
  // sentence ran to six lines in it, which is the tallest thing in the sidebar
  // for something you are being asked to glance at.
  it('says it in half the words in the card, where there is no room for the row`s sentence', () => {
    for (const place of ['disk-image', 'translocated']) {
      const short = sayWhere(place, { short: true });
      const row = updateLook({ canMove: true, place }).sentence;
      expect(short.length).toBeLessThan(row.length / 2);
      expect(short.length).toBeLessThan(60);
    }
    expect(read('renderer/src/components/SidebarUpdate.tsx')).toContain('short: true');
  });

  it('is in ⌘K, so closing the card is not losing it', () => {
    const palette = read('renderer/src/components/Palette.tsx');
    expect(palette).toContain('onMoveToApplications');
    expect(palette).toContain('MOVE_SAY');
  });

  it('is found in Settings by the words a person would type', async () => {
    const { searchSettings } = await import('../renderer/src/settings-search.ts');
    // Every word typed has to match the start of a word in the index, so these
    // are the phrases as a person types them when updates have stopped.
    for (const q of ['move applications', 'applications folder', 'disk image', 'stuck']) {
      expect(searchSettings(q, { pages: ['general'] }).length).toBeGreaterThan(0);
    }
  });

  it('is not found by a word that is only inside another one', async () => {
    const { searchSettings } = await import('../renderer/src/settings-search.ts');
    expect(searchSettings('pplications', { pages: ['general'] })).toEqual([]);
  });

  it('reaches main through the same bridge as the other two update doors', () => {
    expect(read('shared/bridge-map.mjs')).toContain("updateMove: 'zero:update-move'");
    expect(read('preload.cjs')).toContain("zero:update-move");
    expect(read('main/ipc.mjs')).toContain("zero:update-move");
  });

  // The screen imports this file's sentences (update-row, SidebarUpdate, api),
  // so it must load in a browser. A `node:path` import here broke the browser
  // bundle tests/inline-links-keep-their-place builds, and blocked every ship
  // on 2026-10-12; in a dev window Vite throws on `path.sep` at load.
  it('the file the screen reads its sentences from imports nothing from Node', () => {
    expect(read('shared/where-it-runs-from.mjs')).not.toMatch(/from ['"]node:/);
  });
});
