// THE APP KEEPS ITSELF CURRENT, AND THE RESTART IS THE ONLY THING THE USER
// PRESSES.
//
// The shape was approved earlier, when the only thing missing was a signed
// build.
//
// What these pin is the half that is easy to get wrong quietly. An updater that
// never fires looks exactly like an updater that has nothing to offer, so every
// one of the ways it can silently do nothing gets a test:
//
//   * a release with no zip on it (Squirrel cannot install a dmg)
//   * a release with no latest-mac.yml (the app cannot tell it is behind)
//   * a version that did not move (the app compares numbers, so nobody updates)
//   * a build that quietly uploaded itself from a laptop
//
// The state machine itself is tested through `describe`, which is pure and
// takes no Electron, no network and no packaged build.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe as describeState, shortError } from '../main/updater.mjs';
import { announcesUpdate } from '../renderer/src/update-row.ts';
import { NAME, Name } from '../shared/product-name.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const updater = read('main/updater.mjs');
const publish = read('scripts/publish-download.mjs');
const ipc = read('main/ipc.mjs');
const preload = read('preload.cjs');

/* ------------------------- what a release must carry ---------------------- */

describe('the build produces the files an update needs', () => {
  // THE ONE THAT SILENTLY BREAKS EVERYTHING. electron-updater's MacUpdater does
  // `findFile(files, "zip", ["pkg", "dmg"])` and throws
  // ERR_UPDATER_ZIP_FILE_NOT_FOUND when there is no zip, because Squirrel. Mac
  // swaps an .app bundle and cannot read a disk image. Read out of
  // electron-updater 6.8.9's out/MacUpdater.js on 2026-08-28.
  it('builds a zip beside the dmg, because a dmg cannot be installed as an update', () => {
    const targets = pkg.build.mac.target.map((t) => t.target);
    expect(targets).toContain('dmg');
    expect(targets).toContain('zip');
  });

  // Without this electron-builder writes no latest-mac.yml and bakes no
  // app-update.yml into the app, so the app has nowhere to look.
  it('says where updates come from, and it is the repo the website already uses', () => {
    expect(pkg.build.publish).toBeTruthy();
    const [feed] = pkg.build.publish;
    expect(feed.provider).toBe('github');
    expect(feed.owner).toBe('Astral-Agent');
    expect(feed.repo).toBe('astral-releases');
    // The same place scripts/publish-download.mjs uploads to. If these two ever
    // drift the app looks for its updates somewhere nothing is published.
    expect(publish).toContain(`const REPO = '${feed.owner}/${feed.repo}'`);
  });

  it('ships the updater as a real dependency, not a dev one', () => {
    expect(pkg.dependencies['electron-updater']).toBeTruthy();
    expect(pkg.devDependencies?.['electron-updater']).toBeUndefined();
  });
});

/* ---------------------------- publishing refuses -------------------------- */

describe('publishing refuses the ways an update silently reaches nobody', () => {
  it('refuses a build with no update feed in it', () => {
    expect(publish).toContain('would ever learn about this build');
  });

  it('refuses a feed that names no zip', () => {
    expect(publish).toContain('names no .zip');
  });

  // The trap that is invisible for months: a new app on the website, and not
  // one existing copy offered anything, because the numbers matched.
  it('refuses to republish the version that is already out', () => {
    expect(publish).toContain('because the app compares version numbers');
    expect(publish).toContain('npm version patch');
  });

  it('checks the zip really matches the hash the feed advertises', () => {
    expect(publish).toContain('does not match the hash in');
  });

  // The app inside the zip is what replaces the one on somebody's disk. If
  // Gatekeeper refuses it they are left with nothing that runs, which is worse
  // than never updating at all.
  it('checks the app inside the zip the way a stranger’s Mac will', () => {
    expect(publish).toContain('would be refused by Gatekeeper');
  });

  // `releases/latest` skips drafts, so the website and every running app go on
  // seeing the whole old release for the several minutes the uploads take.
  it('uploads into a draft and publishes it last', () => {
    expect(publish).toContain("'--draft'");
    expect(publish.indexOf("'--draft'"))
      .toBeLessThan(publish.indexOf("'--draft=false'"));
  });

  // A green upload log is not a published feed. The website check cannot stand
  // in for this one: the redirect can be perfect while the feed is missing, and
  // then strangers get the new app and everybody who has it gets nothing.
  it('proves the feed is really being served before it says it shipped', () => {
    expect(publish).toContain('nobody who already has ${NAME} will be offered this');
    expect(publish).toContain('served !== version');
  });
});

/* ------------------------------ the behaviour ----------------------------- */

describe('what the app does on its own, and what it waits to be told', () => {
  it('downloads by itself and never restarts by itself', () => {
    expect(updater).toContain('autoUpdater.autoDownload = true');
    // The restart happens in `install`, which is only ever reached from a
    // press. Nothing else in the file calls quitAndInstall.
    expect(updater.match(/quitAndInstall/g).length).toBe(1);
    const install = updater.slice(updater.indexOf('function install()'));
    expect(install).toContain('quitAndInstall');
  });

  // If she never presses anything, quitting applies it, so the next launch is
  // current. The button is the fast path, not the only path.
  it('applies a downloaded update on quit too', () => {
    expect(updater).toContain('autoUpdater.autoInstallOnAppQuit = true');
  });

  it('never opens a dialog or steals focus', () => {
    expect(updater).not.toContain('dialog.');
    expect(updater).not.toContain('showMessageBox');
  });

  it('does not offer betas', () => {
    expect(updater).toContain('autoUpdater.allowPrerelease = false');
  });
});

describe('the state the screens are given', () => {
  const base = {
    phase: 'idle', currentVersion: '0.1.0', newVersion: null,
    percent: null, error: null, checkedAt: null,
  };

  it('says ready only when there is really something to install', () => {
    expect(describeState({ ...base, phase: 'ready' }).ready).toBe(true);
    for (const phase of ['idle', 'checking', 'current', 'downloading', 'error', 'unsupported']) {
      expect(describeState({ ...base, phase }).ready).toBe(false);
    }
  });

  // A progress number with decimals on it reads as machinery rather than as an
  // answer, and one outside 0..100 is a rendering bug on her screen.
  it('rounds progress and keeps it inside 0 to 100', () => {
    expect(describeState({ ...base, percent: 47.3819 }).percent).toBe(47);
    expect(describeState({ ...base, percent: -4 }).percent).toBe(0);
    expect(describeState({ ...base, percent: 140 }).percent).toBe(100);
    expect(describeState({ ...base, percent: null }).percent).toBe(null);
  });

  it('carries the version it would move you to', () => {
    expect(describeState({ ...base, phase: 'ready', newVersion: '0.2.0' }).newVersion).toBe('0.2.0');
    expect(describeState(base).newVersion).toBe(null);
  });

  // THE INBOX ROW WEARS THIS AT ITS RIGHT END, where every other row says how
  // old it is. In any other phase there is nothing waiting, so there is nothing
  // to be old, and a stamp left over from a previous ready would date the next
  // row wrongly.
  it('remembers when the download finished, and only while one is waiting', () => {
    const at = 1_756_000_000_000;
    expect(describeState({ ...base, phase: 'ready', readyAt: at }).readyAt).toBe(at);
    for (const phase of ['idle', 'checking', 'current', 'downloading', 'error', 'unsupported']) {
      expect(describeState({ ...base, phase, readyAt: at }).readyAt).toBe(null);
    }
  });

  // A second `update-downloaded` for the same version must not make the row
  // young again and float it back to the top of her list for news she has read.
  it('stamps the moment once rather than on every event', () => {
    expect(updater).toContain("state.phase === 'ready' && state.readyAt ? state.readyAt : Date.now()");
  });
});

// SHE READS THESE. electron-updater's errors arrive with stacks and error codes
// on them, and Settings puts this string in front of a person.
describe('what a failure says to her', () => {
  it('turns the ones we can name into English', () => {
    expect(shortError(new Error('ERR_UPDATER_ZIP_FILE_NOT_FOUND: ...')))
      .toBe('That release has no app in it to install.');
    expect(shortError(new Error('getaddrinfo ENOTFOUND github.com')))
      .toBe('Could not reach the internet.');
  });

  // THE ONE THAT REACHED THE SCREEN. The check goes through Electron's own net
  // module, so an unreachable feed arrives as Chromium's name for it and not as
  // Node's. Seen in a packaged 0.2.0 on 2026-08-29 with the feed switched off:
  // Settings read "net::ERR_CONNECTION_REFUSED" under "the app could not check
  // for a new version".
  it('says the same thing when the failure arrives in Chromium’s words', () => {
    expect(shortError(new Error('net::ERR_CONNECTION_REFUSED')))
      .toBe('Could not reach the internet.');
    expect(shortError(new Error('net::ERR_INTERNET_DISCONNECTED')))
      .toBe('Could not reach the internet.');
    expect(shortError(new Error('net::ERR_NAME_NOT_RESOLVED')))
      .toBe('Could not reach the internet.');
  });

  // THE SECOND ONE THAT REACHED THE SCREEN, and the first time this was read
  // off the real GitHub feed rather than a local one. A packaged build on
  // 2026-08-29 checked github.com, found the published v0.1.0, and 404'd on
  // latest-mac.yml because that release carries only the .dmg. The name of the
  // failure is on `code`; the message is prose with the whole URL inside it.
  it('reads the name off the error’s code, not only its message', () => {
    const e = new Error(
      'Cannot find latest-mac.yml in the latest release artifacts '
      + '(https://github.com/Astral-Agent/astral-releases/releases/download/v0.1.0/latest-mac.yml): '
      + 'HttpError: 404 ',
    );
    e.code = 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND';
    expect(shortError(e)).toBe('That release is missing its update file.');
    expect(shortError(e)).not.toContain('github.com');

    const zip = new Error('some prose about a missing file');
    zip.code = 'ERR_UPDATER_ZIP_FILE_NOT_FOUND';
    expect(shortError(zip)).toBe('That release has no app in it to install.');

    const none = new Error('no versions here');
    none.code = 'ERR_UPDATER_NO_PUBLISHED_VERSIONS';
    expect(shortError(none)).toBe('No published version to update to yet.');
  });

  it('never hands her a stack', () => {
    const e = new Error('something broke');
    e.stack = 'Error: something broke\n    at Object.<anonymous> (/x/y.js:1:1)';
    expect(shortError(e)).toBe('something broke');
    expect(shortError(e)).not.toContain('at Object');
  });

  it('does not run on past the end of a line', () => {
    expect(shortError(new Error('x'.repeat(400))).length).toBeLessThanOrEqual(160);
  });
});

/* ------------------------------- the seams -------------------------------- */

describe('how the screens reach it', () => {
  // It rides the snapshot for the same reason restartNeeded does: it becomes
  // true hours into a session, on a screen she may already be looking at.
  it('puts the state on the snapshot the inbox already polls', () => {
    expect(ipc).toContain('update: updater.state()');
  });

  it('offers exactly two verbs, and neither of them starts a download', () => {
    expect(preload).toContain("updateCheck: () => ipcRenderer.invoke('zero:update-check')");
    expect(preload).toContain("updateInstall: () => ipcRenderer.invoke('zero:update-install')");
    expect(preload).not.toContain('update-download');
  });

  // A build run from source has no business reading the feed, and must not
  // report a healthy "up to date" that nothing ever checked.
  it('says plainly that a copy run from source does not update itself', () => {
    expect(updater).toContain('isUpdaterActive');
    expect(updater).toContain('only updates itself when it is installed as an app');
  });
});

/* ---------------------------- it arrives as a row -------------------------- */
// So the news lands in the list like everything else in this product, built by
// `updateRow` and dropped into the inbox by App.tsx. What these pin is the part
// that is easy to break quietly later: the row is not in any ledger, so every
// verb that writes has to leave it alone, and the three announcements that
// were not picked have to stay deleted.
describe('a ready update arrives in her inbox as a row', () => {
  const app = read('renderer/src/App.tsx');
  const row = read('renderer/src/update-row.ts');
  const list = read('renderer/src/components/List.tsx');
  const focus = read('renderer/src/components/Focus.tsx');

  it('says the same sentence in the row and in the pane', () => {
    // The row's title is the pane's heading, and the row's second line is the
    // pane's first paragraph. One message, or she reads half of it in the list
    // and a different one when she opens it.
    expect(row).toContain('ready: `A new version of ${NAME} is ready`');
    expect(row).toContain('Restart ${NAME} when you are ready.');
    expect(row).toContain("restart: 'Restart to update'");
  });

  it('exists only when there is really something to install', () => {
    expect(announcesUpdate({ ready: false, newVersion: null }, { walking: false, closed: '' })).toBe(false);
    expect(announcesUpdate(null, { walking: false, closed: '' })).toBe(false);
    expect(announcesUpdate({ ready: true, newVersion: '0.2.0' }, { walking: false, closed: '' })).toBe(true);
  });

  // The version she has already pressed E on. It hides the row and nothing
  // else; see the block below on saying no.
  it('stays away for the one version she closed, and comes back for the next', () => {
    expect(announcesUpdate({ ready: true, newVersion: '0.2.0' }, { walking: false, closed: '0.2.0' })).toBe(false);
    expect(announcesUpdate({ ready: true, newVersion: '0.3.0' }, { walking: false, closed: '0.2.0' })).toBe(true);
  });

  it('is dated when the download finished, not when it was drawn', () => {
    expect(row).toContain('state?.readyAt ?? now');
  });

  // No ledger has a row called `update` in it, so a write against it would go
  // nowhere and quietly look like it worked.
  it('is refused by every verb that would write to a ledger', () => {
    const guards = app.match(/if \(item\.agent \|\| isTroubleRow\(item\) \|\| isUpdateRow\(item\)\) return;/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(6);
  });

  // It cannot be ticked into a batch either, for the same reason, so it wears
  // the rule at its left edge instead of a select box.
  it('wears the made-row rule rather than a select box', () => {
    expect(list).toContain('isTroubleRow(item) || isUpdateRow(item)');
    expect(list).toContain("id === TROUBLE_ID || id === UPDATE_ID ? all.filter((k) => k.key !== 'R')");
  });

  it('opens with the restart on it and no reply box', () => {
    expect(focus).toContain('const update = isUpdateRow(item);');
    expect(focus).toContain('{UPDATE_SAY.restart}');
  });

  // THE THREE THAT WERE NOT PICKED. Keeping any of them switchable is a
  // decision that would have to be made again, and an approval closes the
  // option set.
  it('has no line, no toast and no dot on the cog left in the app', () => {
    expect(app).not.toContain('UpdateSay');
    expect(app).not.toContain('whichWay');
    expect(app).not.toContain('UpdateLine');
    expect(app).not.toContain('UpdateToast');
    expect(app).not.toContain('CogDot');
    expect(fs.existsSync(path.join(root, 'renderer/src/components/UpdateSay.tsx'))).toBe(false);
  });
});

/* --------------------------- saying no to it ------------------------------ */
// So the whole of "reject" is closing the ROW, which is one version string in
// the renderer, and this is what it is NOT allowed to be. There is no dismiss
// verb over the bridge and no dismiss on the updater, because the update is not
// a message that can be thrown away: it is a file on the disk, and the row is
// only the app mentioning it. If a later round ever adds `updateDismiss` to the
// preload, this fails, and it should: the state would then live in the main
// process, where Settings reads it, and a rejected update could go missing from
// the one screen it is meant to survive on.
describe('saying no to the row never loses the update', () => {
  const app = read('renderer/src/App.tsx');
  const settings = read('renderer/src/components/Settings.tsx');

  it('has nothing over the bridge that could throw an update away', () => {
    expect(preload).not.toContain('update-dismiss');
    expect(updater).not.toContain('dismiss');
  });

  // The close lives in the renderer's own head and hides the ROW only. Settings
  // reads `state.phase`, which no close can reach.
  it('gates the row and not the state behind it', () => {
    expect(app).toContain("localStorage.setItem('zero.updateClosed', version)");
    expect(read('renderer/src/api.ts')).not.toContain('updateClosed');
    expect(settings).not.toContain('updateClosed');
  });

  // A NEWER VERSION IS NEW NEWS. The close is kept against the version she
  // closed, so it stops matching the moment a later one comes down.
  it('comes back when a newer version arrives', () => {
    expect(app).toContain('announcesUpdate(u, { walking, closed: updateClosed })');
    expect(announcesUpdate({ ready: true, newVersion: '0.3.0' }, { walking: false, closed: '0.2.0' })).toBe(true);
  });

  // SETTINGS NO LONGER CARRIES AN UPDATES GROUP (w-5737fe67cf, the update
  // section was removed). Whatever was pressed still loses nothing: ⌘K offers the
  // restart for as long as a version is waiting, and quitting installs it.
  it('leaves the restart in ⌘K and on quit whatever she pressed', () => {
    expect(read('renderer/src/components/Palette.tsx')).toContain('label: `Restart to update ${NAME}`');
    expect(read('main/updater.mjs')).toContain('autoUpdater.autoInstallOnAppQuit = true');
    expect(settings).not.toContain("restart: 'Restart to update'");
  });
});

/* ------------------- and never in the middle of the walk ------------------- */
// The walk is a made list with one row in it, and every sentence on the screen
// points at that row. `walkRows` (renderer/src/onboarding.ts) holds back
// everything else, but it filters the LEDGER, and this row is not in any
// ledger: the app builds it. So the walk has to be named where the row is
// built, and it is named once, in `announcesUpdate`.
describe('nothing about a new version reaches the walk', () => {
  const app = read('renderer/src/App.tsx');
  const ready = { ready: true, newVersion: '0.2.0' };

  it('says nothing at all while somebody is being walked through the app', () => {
    expect(announcesUpdate(ready, { walking: true, closed: '' })).toBe(false);
  });

  // The download is already on the disk. Nothing is thrown away here and
  // nothing waits on another check: the walk ends and the row is in the list.
  it('is waiting in her inbox the moment the walk is over', () => {
    expect(announcesUpdate(ready, { walking: false, closed: '' })).toBe(true);
  });

  // BOTH WAYS IN. `walkAgain` is the full first run and `startTutorial` is the
  // practice on its own, and both set the same `run`, which is what `walking`
  // reads. The tutorial is the one where the problem was first seen.
  it('reads the same flag the practice tutorial sets', () => {
    expect(app).toContain("const walking = !!run && run.step !== 'landed';");
    expect(app).toContain('setRun(tutorialRun(product))');
  });

  // ⌘K IS A BEAT OF THE WALK. It is the surface the tutorial teaches, so an
  // extra command about a new version turns up in the middle of the lesson.
  it('keeps the restart out of the palette during the walk too', () => {
    expect(app).toContain("announcesUpdate(snap.update, { walking, closed: '' })");
  });

  // And the palette is NOT gated on the close, which is the other half of the
  // rule: rejecting the row loses nothing (see the block above).
  it('still offers the restart in the palette for a version she closed', () => {
    expect(announcesUpdate(ready, { walking: false, closed: '' })).toBe(true);
  });
});

/* The Settings page's Updates group, and the tests of how it looked, went
   together in w-5737fe67cf, which removed the update section. */
