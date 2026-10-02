// The app: the agent inbox. Electron shell around a keyboard-first renderer, a
// file-derived store, and a supervisor of headless sessions.

import { app, BrowserWindow, Menu, Notification, clipboard, crashReporter, dialog, ipcMain, nativeImage, net, powerMonitor, protocol, shell, session, safeStorage } from 'electron';
import * as workItemsDisk from './store/work-items.mjs';
import { createTeamService, teamStateFile } from './team/index.mjs';
import { loadCloudConfig, supabaseSession } from './team/session.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { configDir, loadConfig } from './config.mjs';
import { installMenu, applyZoom, requestFind } from './menu.mjs';
import { zoomDeltaFor } from './zoom-keys.mjs';
import { copySelection } from './copy-selection.mjs';
import { Store } from './store.mjs';
import { storeRootEnv } from './store/home.mjs';
import { Supervisor } from './supervisor.mjs';
import { startCodexWatch } from './codex-watch.mjs';
import { registerIpc } from './ipc.mjs';
import { carryHerBriefsAcross, joinMessageRules, setAsideShippedMessageRules } from './instruction-settings.mjs';
import * as approvals from './approvals.mjs';
import { recoveryToast } from '../shared/recovery.mjs';
import { dataFolderName, isNewUserBuild } from '../shared/side-build.mjs';
import { runningAsAFreshUser } from '../shared/fresh-user-home.mjs';
import { openFreshUser } from './fresh-user.mjs';
import { installCrashReports, reportFromRenderer, pending as pendingCrashes, setTransport } from './crash-report.mjs';
import { createAnalytics } from './analytics.mjs';
import { createUpdater } from './updater.mjs';
import { createSourceUpdater } from './source-updater.mjs';
import { installNotifier } from './notify.mjs';
import { DOC_SCHEMES, DocGrants, docPath } from './doc-scheme.mjs';
import { IMG_SCHEMES, imgPath, mediaResponse, mediaType, servable } from './img-scheme.mjs';
import { hotWindowVerdict, storeHasWork } from './dev-window.mjs';
import { IS_SHE_TYPING_IN_THE_PAGE, theAppKeepsThisInput, theAppKeepsThisLetterInAPage } from '../shared/artifact-keys.mjs';
import { NAME, Name, WAS } from '../shared/product-name.mjs';

// HOW LONG TO WAIT AFTER THE LID OPENS, and the wait is for the network rather
// than for the wake. `powerMonitor`'s resume event fires while wifi is still
// coming back, and a session resumed into a dead network dies in about a
// second, which the supervisor reads as a fast exit: three of those strike the
// subscription and arm a fleet-wide spawn cooldown of up to thirty minutes. So
// the repair would take the fleet down with it.
const WAKE_SETTLE_MS = Number(process.env.ZERO_WAKE_SETTLE_MS ?? 8000);

// THE DOCUMENT PANE'S OWN ORIGIN. This has to be said before the app is ready
// or the scheme is not a standard one, and a page served under a non-standard
// scheme has no origin for its own pictures to be same-origin with. `secure`
// keeps it out of the mixed-content rules; the grants in doc-scheme.mjs are
// what decide the pane may read a given file.
//
// THE SECOND ONE IS WHERE THE APP'S OWN PICTURES COME FROM: a pasted thumbnail
// and every screenshot in a message. They used to be file:// urls, which a
// dev-served window may not load, so the app she uses all day drew a broken
// image for every one of them.
//
// EVERY SPELLING THIS APP HAS USED IS REGISTERED, not only today's. A url on
// either scheme is stored: a product's logo is kept in the store as one, and
// every picture in a message she was sent months ago is one. An unregistered
// scheme does not degrade, it fails to load, so the old names stay served.
protocol.registerSchemesAsPrivileged([...DOC_SCHEMES.map((scheme) => ({
  scheme,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
})), ...IMG_SCHEMES.map((scheme) => ({
  // `corsEnabled` IS WHAT LETS A COPIED MESSAGE CARRY THE PICTURE ITSELF.: a
  // picture on this scheme taints a canvas like any other cross-origin image,
  // so the copy handler in the window could not read one back to put on the
  // clipboard, and a message copied into an email arrived with a dead url
  // where the screenshot was. With this flag, the header the handler sends and
  // `crossOrigin` on the <img>, a canvas reads it cleanly. MEASURED, all three
  // needed: without the flag the same <img> never loads at all, and without
  // `crossOrigin` the canvas throws SecurityError.
  scheme,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}))]);

// A local file answered so the window asks again next time instead of reusing
// what it drew before. Why, measured, is at the page scheme's handler below.
function noStore(res) {
  const headers = new Headers(res.headers);
  headers.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, headers });
}

// Which folders that scheme may read from. Filled in when the pane resolves a
// document (main/ipc.mjs) and empty until then, so nothing is readable until
// she opens something.
const docGrants = new DocGrants();

// The picture scheme's roots, as a function so it reads the live store. Nothing
// is servable until the window has been built, which is the same shape as the
// grants above: an empty list is a closed door, never an open one.
let imageRoots = () => [];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, '..');

// A SIDE BUILD IS STILL AGENTBOX, AND IT HAS TO BE, OR TWO SUPERVISORS RUN.
// `scripts/pack-side.mjs` packs this branch as its own bundle, "the app Rest",
// so a build she is trying out for a few days sits beside the real one in
// Finder instead of overwriting it. The bundle is separate; the DATA FOLDER
// must not be, and shared/side-build.mjs is where that rule and its reasons
// live. This has to happen before ANYTHING reads a path, because everything
// downstream keys off app.getName, the single-instance lock at the foot of
// this file included.
// THE TEAM VERSION RUNS BESIDE THE ONE IN USE TODAY (2026-10-01). Run from
// source, this checkout is named exactly like the solo app, so it would read
// her data folder, take her single-instance lock and quit on the spot. A
// profile (`AGENTBOX_PROFILE=team npx electron .`) gives it a name of its own,
// and with the name a data folder and a lock of its own. Letters, digits and
// dashes only, and never a space: "agentbox team" reads as a side build, and
// side builds share the real data folder on purpose.
const PROFILE = String(process.env.AGENTBOX_PROFILE ?? '').trim().replace(/[^a-z0-9-]/gi, '');
if (PROFILE) app.setName(`${NAME}-${PROFILE}`);
if (dataFolderName(app.getName()) !== app.getName()) app.setName(dataFolderName(app.getName()));

// "ASTRAL NEW USER" IS A STRANGER EVERY TIME IT OPENS.
//
// So this build does to itself what the ⌘K row does to the real one: it opens a
// second copy inside a brand new throwaway home, with Claude Code and its login
// linked through and nothing else of hers, then gets out of the way. Every
// launch is a person who has never opened Agentbox, on a bundle whose
// permission history is its own (`ac.agentbox.newuser`), which is what makes
// the first-run permission panels testable at all. Quitting it and opening it
// again starts over from zero on purpose.
//
// BEFORE ANY PATH IS READ, like the rename above: the copy that hands over must
// never take a lock, write a crash folder or read a config in her real home.
if (isNewUserBuild(app.getName()) && !runningAsAFreshUser()) {
  const opened = openFreshUser({ withAgents: true, packaged: app.isPackaged });
  if (!opened.ok) dialog.showErrorBox(`${Name} new user could not start`, opened.error ?? 'No reason was given.');
  app.exit(0);
}

// THE APP IS CALLED POWERUP NOW, AND CHROMIUM NAMES ITS DATA FOLDER AFTER THE
// APP. So the rename alone would have pointed this machine at an empty
// ~/Library/Application Support/Powerup and lost every renderer setting she has
// ever chosen: her look (theme and skin), her zoom, her project order. Nothing
// is moved here, because moving 1.3 GB of somebody's folder is a way to lose
// it. A copy that already has an older folder and no the app one keeps reading
// the older one, forever; a fresh install has neither and gets Powerup.
//
// THE LIST IS NEWEST FIRST AND IT GREW BY ONE ON 2026-09-04. This was written
// for the app -> the app and would have silently failed the second rename: every
// existing user's folder is called the app, not the app, so a bare the app check would
// have found nothing and handed them an empty Powerup. Whoever renames this app
// a third time adds one entry here and nothing else.
// A profile never falls back to an older folder: an older folder is hers.
if (!PROFILE) try {
  const named = path.join(app.getPath('appData'), app.getName());
  if (!fs.existsSync(named)) {
    // THESE ARE HISTORY AND NOT COPY. They are the folder names this app has
    // had, and a rename sweep that "helpfully" moves one of them to the current
    // name deletes the only reason this loop exists. scripts/rename-to-powerup
    // protects this line by name for exactly that reason; it rewrote it once.
    for (const was of WAS) {
      const legacy = path.join(app.getPath('appData'), was);
      if (legacy !== named && fs.existsSync(legacy)) { app.setPath('userData', legacy); break; }
    }
  }
} catch {}

// WHERE THE APP'S OWN WRITABLE STATE LIVES. Running from source it is the
// checkout, which is what every session and every test already assumes. Inside
// a packaged .app it cannot be: the bundle is signed, read-only in practice,
// and a write into it breaks the signature that notarisation just bought. So
// zero.config.json moves to the user's data folder when packaged, and nothing
// else does — the briefs we ship, the worker permissions and the renderer are
// read-only and stay in the bundle.
//
// AND A THROWAWAY COPY GETS THE USER DATA FOLDER WHATEVER IT WAS STARTED FROM,
// because a throwaway home moves that folder and does not move the checkout.
// `configDir` in main/config.mjs is the whole rule and says what she saw when
// it was missing.
const dataDir = configDir({ appDir, userData: app.getPath('userData'), packaged: app.isPackaged });

// AND WHERE WHAT SHE TYPES LIVES, WHICH IS NEVER THE CHECKOUT (w-3dc46f3a67,
// 2026-09-21). Her standing instructions and her writing rules used to be
// `dataDir/briefs`, so on her own machine, running from source, they were files
// in the git repository the whole fleet works in. Her report: ⌘K could not find
// the box by the word she types, and when we went looking the file's entire
// history was four agent commits with nothing of hers in any of them. A rules
// file inside the folder every worker may `git checkout` is a rules file an
// agent can undo by accident, silently, and she has no way to see it happen.
//
// This is the same folder a packaged build already used, so there is now ONE
// place her instructions live whichever way the app was started, and the copy
// below carries the text there once. What we SHIP still comes from appDir: the
// worker brief and the finishing rules are read from her folder first and the
// bundle second, so a release's new default still reaches her unless she has
// written over it herself.
const userDir = app.getPath('userData');
try {
  const carried = carryHerBriefsAcross(appDir, userDir);
  if (carried.length) console.log(`zero: carried ${carried.join(', ')} into ${userDir}`);
  // AND THE TWO OLD MESSAGE FILES BECOME ONE, ONCE (w-3dc46f3a67). It runs
  // after the carry above, so it finds whatever that just moved, and before the
  // supervisor exists, so nothing has read the new name yet.
  const joined = joinMessageRules(appDir, userDir);
  if (joined) console.log(`zero: joined the message rules into one file, ${joined.total} characters`);
  // AND A BOX THAT AN OLDER JOIN FILLED WITH ONLY OUR TEXT IS EMPTIED, ONCE
  // (w-3ec9f07978). Kept as a restore point; our rules ride from the checkout.
  if (setAsideShippedMessageRules(appDir, userDir)) console.log('zero: the message rules box held only the shipped rules; set aside as a restore point');
} catch (err) {
  console.warn(`zero: could not carry her instructions into ${userDir}: ${err.message}`);
}

// Before anything else can throw. A crash during boot is the one a stranger
// actually meets, and a reporter installed after the store and the supervisor
// have loaded is a reporter that cannot see it. It writes to disk here and
// NOTHING leaves yet: the transport is handed to it inside createWindow, once
// her config has been read and only if diagnostics are on and a key exists.
const crashDir = path.join(app.getPath('userData'), 'crash-reports');
installCrashReports({
  app,
  appDir,
  crashReporter,
  version: app.getVersion(),
  dir: crashDir,
});

let window = null;
// Set by ⌘R and read once by the renderer as it comes back up, so a reload can
// say so. A reload that lands on an identical screen and a chord that did
// nothing at all look exactly alike, and telling them apart is the whole
// complaint (2026-08-06). The build time comes with it: if it has not moved,
// nobody rebuilt the renderer, which is the other way ⌘R "does nothing".
let reloadRequested = false;

function builtAt() {
  try {
    return fs.statSync(path.join(appDir, 'renderer', 'dist', 'index.html')).mtimeMs;
  } catch {
    return 0;
  }
}

let lastReloadAt = 0;
// The wake sweep's one line, and whether there is a page to say it to yet.
let pendingRecovery = null;
let pageReady = false;

function reloadRenderer() {
  // The chord can now arrive twice, from the menu accelerator and from
  // before-input-event, depending on what holds focus. Reloading twice is
  // harmless but reads as a flicker, so the second one is dropped.
  const now = Date.now();
  if (now - lastReloadAt < 500) return;
  lastReloadAt = now;
  // Logged because "⌘R does nothing" has now been reported twice, and a chord
  // that never arrived is indistinguishable from one that reloaded an
  // identical build unless something records that it arrived at all.
  console.log(`zero: reload requested, renderer built ${new Date(builtAt()).toLocaleTimeString()}`);
  if (!window || window.isDestroyed()) return;
  reloadRequested = true;
  window.webContents.reloadIgnoringCache();
}

async function createWindow() {
  const config = loadConfig(dataDir);
  // The store modules read the app's own home variable at call time; setting it
  // here points auth session files, sync, and every store path at its root.
  // Written under every name this app has had, because a store server or a
  // script from before a rename is still out there reading the old one.
  Object.assign(process.env, storeRootEnv(config.storeRoot));

  // Menu needs the config (approval hotkeys answer the oldest pending card),
  // so it installs here rather than at whenReady. The spool watcher in ipc
  // pushes the change to the renderer; no direct renderer wiring needed.
  //
  // AND ITS ANSWER GOES THROUGH THE IPC LAYER'S ONE DOOR, LATE-BOUND.
  //
  // `installMenu` needs only the config, so it runs here; `registerIpc` needs
  // the window, the store and the supervisor, so it runs two hundred lines
  // below. That ordering is why these menu items used to write the answer FILE
  // themselves with `approvals.answer`, and on a Codex card a file is not an
  // answer at all: the thing waiting is Agentbox itself, in this process, so
  // nothing on that path ever reads one. Her click on Allow landed as a
  // FORGERY -- the file appeared for a request still waiting, `sweepForgery`
  // deleted it inside two seconds, the log said "an answer file appeared for
  // approval <id> that the founder did not write", her card came back and the
  // worker was denied fifteen minutes later by the deadline. It also spent the
  // one warning that is supposed to mean a worker attacked the spool.
  //
  // The variable is filled in the moment `registerIpc` returns, a few hundred
  // lines down. Until then there is nothing to answer with and nothing that
  // could have been pressed, and the stub says so rather than pretending.
  let answerApproval = (id, allow) => {
    console.warn(`zero: an approval (${id}) was answered ${allow ? 'yes' : 'no'} before the app had finished starting; nothing was decided`);
    return false;
  };
  installMenu({
    onApproval: (allow) => {
      const oldest = approvals.listPending(config.storeRoot)[0];
      if (oldest) answerApproval(oldest.id, allow);
    },
    onReload: reloadRenderer,
    // A click in the View menu names the window it was chosen from, so it zooms
    // the inbox rather than whatever happens to hold focus. If the click ever
    // arrives without one, this window is the answer, never nothing.
    onZoom: (delta, target) => applyZoom(delta, target ?? window?.webContents ?? null),
  });
  // ANALYTICS, AND EVERYTHING IT NEEDS TO BE HONEST. Off unless her switch is
  // on AND a key is configured, so a copy built from source sends nothing. The
  // crash reporter has been writing to disk since the top of this file; this is
  // where it is given a way out, and where the reports from the launch that
  // died are finally sent, because a report is written while the process is
  // dying and delivery cannot be synchronous.
  const analytics = createAnalytics({ config, version: app.getVersion(), dir: crashDir });
  // The seam is filled whenever there is somewhere to send to. Whether anything
  // actually goes is asked again inside, at every send, so her switch stops it
  // from the moment she moves it rather than at the next launch.
  if (analytics.hasDestination) setTransport((payload) => analytics.crashTransport(payload));
  if (analytics.enabled) {
    const drained = analytics.drainCrashes(pendingCrashes());
    if (drained) console.log(`zero: sent ${drained} crash report(s) from a previous launch`);
    analytics.track('app_opened');
  } else {
    console.log(`zero: diagnostics is ${analytics.reason}, nothing is sent`);
  }

  const store = await new Store(config).init();
  // Where the window's own pictures may come from (main/img-scheme.mjs). The
  // account root holds every product's docs, attachments, designs and the
  // `.staging` folder a pasted screenshot lands in; a product's repo is where a
  // worker writes `shots/…` and then names it on a card. Read fresh on every
  // request so a project made after launch is not a folder of broken images.
  imageRoots = () => [config.accountRoot, ...store.listProducts().map((p) => p.repoPath).filter(Boolean)];
  const supervisor = new Supervisor(config, store, appDir, dataDir, userDir);
  app.on('before-quit', () => supervisor.killAll());
  // THE TEAM. Off entirely on a build with no team cloud (the single-person
  // app). Otherwise it restores whoever was signed in, and from then on every
  // line this Mac writes says who wrote it and shared projects stay in sync.
  // Its session file sits beside the store, encrypted with the Mac's own
  // keychain-backed key, so each store root is its own signed-in person.
  const cloudConfig = loadCloudConfig(appDir, { packaged: app.isPackaged });
  const encrypt = safeStorage.isEncryptionAvailable() ? (text) => safeStorage.encryptString(text) : null;
  const decrypt = safeStorage.isEncryptionAvailable() ? (buf) => safeStorage.decryptString(buf) : null;
  const team = cloudConfig ? createTeamService({
    session: supabaseSession({
      cloudConfig,
      sessionFile: path.join(config.storeRoot, '.team-session'),
      encrypt, decrypt,
      packaged: app.isPackaged,
      openExternal: (url) => shell.openExternal(url),
    }),
    store,
    disk: workItemsDisk,
    accountRoot: config.accountRoot,
    stateFile: teamStateFile(config.storeRoot),
    // The window's push is declared further down and wired once the window
    // exists; until then a change has nobody to tell.
    onChange: () => { try { pushUpdate(); } catch { /* no window yet */ } },
    log: (line) => console.log(line),
  }) : null;
  if (team) {
    team.start().then(() => supervisor.wake?.()).catch((err) => console.warn(`team: ${err.message}`));
    app.on('before-quit', () => team.stop());
  }
  // HER CODEX CONVERSATIONS ASK TO COME IN. Once a minute: a new one in a
  // folder a project points at gets a row asking yes or no, and the ones she
  // said yes to follow Codex's latest answer.
  const codexWatch = startCodexWatch({ store });
  app.on('before-quit', () => codexWatch.stop());
  // Whatever is still queued goes with the app rather than dying in memory.
  app.on('will-quit', () => { analytics.flush(); });

  // Right-click. Electron ships no context menu at all, so links could not be
  // copied or opened by hand anywhere in the app. Built per click from what is
  // actually under the cursor. MUST register before the window exists:
  // web-contents-created only fires for contents created after it (the first
  // fix missed the main window for exactly that reason, 2026-08-04).
  const openLink = (url) => {
    if (url.startsWith('file://')) shell.openPath(decodeURIComponent(url.replace('file://', '')));
    else shell.openExternal(url);
  };

  // A PICTURE GOES ON THE CLIPBOARD AS A PICTURE AND AS NOTHING ELSE.
  //
  // What her email showed was a raw `file:///Users/you/Zero/accounts/...` line
  // where the picture should be.
  //
  // MEASURED, scripts/measure-copy-and-link-colour.mjs. `copyImageAt` alone
  // leaves TWO flavours on the clipboard:
  //
  //   formats  ["text/html", "image/png"]
  //   text/html  <img src="astral-img://file/tmp/one.png" alt="pasted-48629.png"/>
  //
  // Agentbox pastes the html and resolves that scheme, so inside the app it looks
  // perfect. Gmail also prefers the html, and `astral-img://` means nothing
  // outside this window, so it lands as a dead url. One copy, two answers, and
  // that is the whole of the inconsistency she is describing.
  //
  // So the picture is read off disk and written as the only thing on the
  // clipboard. `writeImage` clears what was there, which is what drops the html
  // flavour and leaves every app one unambiguous thing to paste. Reading the
  // file also skips `copyImageAt`'s round trip to the renderer, so there is no
  // window in which the clipboard holds half an answer.
  const copyPicture = (contents, params) => {
    // The same two rules the scheme itself enforces (main/img-scheme.mjs): it is
    // a picture, and it is inside a root the app owns. A context menu is not a
    // reason to widen them.
    const file = imgPath(params.srcURL);
    if (file && servable(file, imageRoots())) {
      const picture = nativeImage.createFromPath(file);
      if (!picture.isEmpty()) { clipboard.writeImage(picture); return; }
    }
    // Anything else — an http picture, a data: uri, a canvas — is
    // not ours to read off disk, so it goes the way it always did.
    contents.copyImageAt(params.x, params.y);
  };

  // AND A FILE GOES ON THE CLIPBOARD AS THE FILE.
  //
  // She was right, and the picture fix above does not touch it. Until now the
  // only file-shaped thing this menu could give her was "Copy Link Address" on
  // a worker's `file://` link, which hands over
  // `file:///Users/you/Zero/accounts/00000000-…/personas/one.md` — thirteen
  // folders of her home directory, and the exact line her Gmail showed in the
  // screenshot on this row. The chips under a message could not be copied at
  // all: they are buttons, so the menu had nothing to offer.
  //
  // MEASURED on this Mac, scripts/measure-copy-and-link-colour.mjs: writing
  // `public.file-url` puts a real file reference on the pasteboard —
  // `osascript -e 'the clipboard as record'` reads back «class furl»:file
  // Macintosh HD:… — which is what Finder, Mail and a browser's paste read as
  // a file rather than as words. `writeBuffer` clears everything else, and
  // that is wanted: the same rule the picture follows, one unambiguous thing
  // to paste, because one copy leaving two answers is the whole of the bug on
  // this row.
  const copyFile = (file) => {
    // The same rule the picture and the two schemes enforce: inside a root the
    // app owns. A right click is not a reason to widen it.
    if (!file || !servable(file, imageRoots())) return false;
    try {
      if (!fs.statSync(file).isFile()) return false;
      clipboard.writeBuffer('public.file-url', Buffer.from(pathToFileURL(file).toString(), 'utf8'));
      return true;
    } catch { return false; }
  };

  // The path under her pointer, when what is under it is a chip rather than a
  // link. `params` carries an href and an image src and nothing else, so the
  // window is asked. Tiny, guarded, and answered before the menu is drawn.
  const fileUnderPointer = async (contents, params) => {
    if (params.linkURL.startsWith('file://')) {
      try { return fileURLToPath(params.linkURL.split('#')[0]); } catch { return null; }
    }
    try {
      const found = await contents.executeJavaScript(
        `(() => { const el = document.elementFromPoint(${Number(params.x)}, ${Number(params.y)}); `
        + `const hit = el && el.closest && el.closest('[data-copy-file]'); `
        + `return hit ? hit.getAttribute('data-copy-file') : null; })()`, true);
      return typeof found === 'string' && found.startsWith('/') ? found : null;
    } catch { return null; }
  };
  app.on('web-contents-created', (_event, contents) => {
    contents.on('context-menu', async (_e, params) => {
      const items = [];
      const file = await fileUnderPointer(contents, params);
      // WHAT SHE SELECTED COMES FIRST, ABOVE ANYTHING ABOUT A LINK.
      //
      // — and what it had pasted was the single line
      // `mailto:hello@example.com`.
      //
      // That is this menu's own doing. `params.linkURL` is set whenever the
      // POINTER is over a link, whatever is selected, and the draft she was
      // copying has `hello@example.com` in the middle of it. So the menu she
      // got read "Open Link / Copy Link / --- / Copy": the first copy-shaped
      // word in it copied the href and threw her selection away. She took it,
      // and got the mailto.
      //
      // A selection is the more specific thing to have asked for and it now
      // sits at the top. The link keeps its items, under it, and "Copy Link
      // Address" says which of the two it is rather than leaving her to guess.
      //
      // AND IT COPIES FROM THE CONTENTS THIS MENU WAS RAISED ON, BY NAME.
      //
      // The founder, 2026-09-22 (w-b108b1d596): "Clicking copy doesnt seem to
      // actually copy it (links)", with a picture of this menu open over a
      // `mailto:` in a draft — "Copy / --- / Open Link / Copy Link Address",
      // so both branches below were taken and she took the top item.
      //
      // This item used to be `{ role: 'copy' }`, and a role is not a call. Read
      // out of the shipped Electron framework this session, lib/browser/api/
      // menu-item-roles.ts:
      //
      //   execute(role, window, contents) {
      //     if (!(hasRole(role) && (!isDarwin || roleList[role].nonNativeMacOSRole))) return false;
      //     ... if (webContentsMethod && contents != null) { webContentsMethod(contents); return true }
      //   }
      //
      // and `copy` carries no `nonNativeMacOSRole`, so on this Mac that guard
      // fails on the first line and `webContents.copy()` is NEVER REACHED.
      // What ships instead is a bare Cocoa `copy:` with no target, sent up the
      // responder chain, holding no reference to the window she right-clicked
      // in. Every other item in this menu carries its own closure over
      // `params` and works whatever the responder chain is doing; "Copy" was
      // the only one that did not, and "Copy" is the one she says does
      // nothing. When that selector finds nobody, nothing is written and the
      // clipboard keeps whatever it held, which is exactly what she describes.
      //
      // MEASURED, scripts/measure-native-copy-role.mjs: on the same window and
      // the same selection, `Menu.sendActionToFirstResponder('copy:')` left a
      // sentinel untouched on the clipboard while `contents.copy()` put the
      // whole selection on it, both with a picture and with a `mailto:` under
      // the pointer. The accelerator is kept so the item still reads "⌘C" the
      // way her picture shows it, and `registerAccelerator: false` so drawing
      // that word does not also claim the key.
      if (!params.isEditable && params.selectionText.trim()) {
        items.push(
          // Through copySelection, because `contents.copy()` alone was measured
          // landing nothing in the real app (main/copy-selection.mjs).
          { label: 'Copy', accelerator: 'CommandOrControl+C', registerAccelerator: false, click: () => copySelection(contents, params.selectionText, clipboard) },
          { type: 'separator' },
        );
      }
      // A FILE COMES BEFORE ANYTHING ABOUT ITS ADDRESS, for the same reason the
      // selection does: it is what she meant by "copy" and the address is not.
      if (file && servable(file, imageRoots())) {
        items.push({ label: 'Copy File', click: () => copyFile(file) }, { type: 'separator' });
      }
      if (params.linkURL) {
        items.push(
          { label: 'Open Link', click: () => openLink(params.linkURL) },
          { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) },
          { type: 'separator' },
        );
      }
      if (params.hasImageContents) {
        items.push(
          { label: 'Copy Image', click: () => copyPicture(contents, params) },
          { type: 'separator' },
        );
      }
      // The reply composer, and the same rule for the same reason: cut, copy,
      // paste and select all are all native macOS roles, so all four were
      // bare selectors up the responder chain. They are named calls on the
      // contents she right-clicked in now, like everything else in this menu.
      if (params.isEditable) {
        items.push(
          { label: 'Cut', accelerator: 'CommandOrControl+X', registerAccelerator: false, click: () => contents.cut() },
          { label: 'Copy', accelerator: 'CommandOrControl+C', registerAccelerator: false, click: () => copySelection(contents, params.selectionText, clipboard) },
          { label: 'Paste', accelerator: 'CommandOrControl+V', registerAccelerator: false, click: () => contents.paste() },
          { label: 'Select All', accelerator: 'CommandOrControl+A', registerAccelerator: false, click: () => contents.selectAll() },
        );
      }
      while (items.length && items[items.length - 1].type === 'separator') items.pop();
      if (!items.length) return;
      Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(contents) ?? window });
    });
  });

  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 600,
    title: NAME,
    // The light frame's own `--bg`, so the moment before the page paints is
    // the same colour as the page (w-9e434e8671). It was dark.
    backgroundColor: '#f8f8fa',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(appDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // the inbox-zero browser
    },
  });

  // The junk browser's session presents as plain Chrome. Electron's default
  // UA carries "Electron/x Zero/x", which makes Google-family logins refuse
  // even though a human is typing. This is identity cleanup for an embedded
  // browser a human drives, not automation.
  const junk = session.fromPartition('persist:junk');
  junk.setUserAgent(junk.getUserAgent().replace(/\s?(zero|Electron)\/\S+/gi, ''));

  // THE APP KEEPS ITSELF CURRENT (main/updater.mjs). It checks a few seconds
  // from now, downloads anything newer in the background, and then waits: the
  // restart is a button she presses, never something that happens under her.
  // `pushUpdate` is filled in on the next line, because the updater has to
  // exist before the IPC surface that reports it and the IPC surface is what
  // knows how to reach the window.
  //
  // AND A COPY RUN FROM SOURCE watches its git branch instead of a release
  // feed (main/source-updater.mjs), because that is how teammates run the team
  // build and their updates are pushes to main, not releases.
  let pushUpdate = () => {};
  const updater = app.isPackaged ? createUpdater({
    app,
    onChanged: () => pushUpdate(),
  }) : createSourceUpdater({
    app,
    appDir,
    onChanged: () => pushUpdate(),
  });

  // The desktop door. `main/serve.mjs` is the other one and hands over plain
  // Node stand-ins for these three; everything else about the call is the same.
  const ipc = registerIpc({
    store, supervisor, config, window, analytics, docGrants, updater,
    host: { ipcMain, app, dialog },
    team,
  });
  pushUpdate = ipc.push;
  // The Agents menu's Allow/Deny, bound to the real door now that there is one.
  // See the `installMenu` call above for what writing the file instead did to a
  // Codex card.
  answerApproval = ipc.answerApproval;
  updater.start();
  app.on('before-quit', () => updater.stop());

  // Cmd+Y / Cmd+N answer the oldest approval card from ANYWHERE, including
  // while a child web contents owns the keyboard (menu accelerators turned out
  // not to fire there, 2026-08-06). before-input-event runs in the main
  // process ahead of any page dispatch, so nothing on the page can swallow
  // it. These two chords, and nothing else, outrank whatever is in front (her
  // rule).
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    // ESCAPE HAS TO REACH THE APP FROM INSIDE AN OPEN FILE.
    //
    // She was inside the document pane, and escape is the app's one way back
    // out of it.
    //
    // A keydown does not cross a document boundary. The page in the pane is its
    // own document under its own origin (main/doc-scheme.mjs), so the moment her
    // click lands inside it the app's own window listener never hears the key
    // again. This runs below the page and hears it either way.
    //
    // IT ONLY FORWARDS FROM A FRAME, so the app's own escape is untouched: with
    // the keyboard on the app's page the renderer's own handler is the only one
    // that answers, exactly as before. Measured on Electron 43, 2026-08-21:
    // `focusedFrame` reads the document's frame while the file has the keyboard
    // and the main frame the moment the app takes it back. The renderer checks
    // the same fact again from its own side (focusIsInTheFile, doc-pane.ts).
    //
    // ⌘K COMES UP THE SAME WAY, and for the same reason. Measured on the real
    // renderer that day: with the keyboard inside a page in the pane, ⌘K was
    // dead. Escape was the only key this branch had ever forwarded, so it was
    // the only one that worked. The rule for which keys are the app's is
    // written once, in shared/artifact-keys.mjs, and read here and by the pane.
    //
    // HER LETTERS COME UP TOO, FROM A PAGE ONLY.E is not ⌘K: measured that day,
    // it archives the card perfectly well while her keyboard is on the message,
    // with a file open beside it or without one. It dies only inside the
    // artifact, and only in a PAGE is that wrong — in a markdown file and in a
    // line of a change she is typing, and there a letter has to stay a letter.
    // A page has nothing to type in, so nothing in it is text, and the single
    // reason E was dead is that this list was Escape and chords.
    //
    // EXCEPT WHEN THE PAGE ITSELF IS TAKING TEXT. Her pages are her own html
    // and some of them carry a search box or a field in a mockup (15 of the 406
    // under this product, counted 08-24). Only the frame can see its own focus,
    // so the frame is asked, and the answer comes back a few milliseconds later
    // — which is fine, because nothing here ever preventDefaults and the page
    // has already had the key regardless.
    const aLetterFromAPage = !theAppKeepsThisInput(input) && theAppKeepsThisLetterInAPage(input);
    if (theAppKeepsThisInput(input) || aLetterFromAPage) {
      let theFrame = null;
      try {
        const frame = window.webContents.focusedFrame;
        if (frame && frame !== window.webContents.mainFrame) theFrame = frame;
      } catch { theFrame = null; /* an older Electron cannot say; leave it alone */ }
      const sendItUp = () => window.webContents.send('zero:key-in-the-file', {
        key: input.key, meta: !!input.meta, ctrl: !!input.control, alt: !!input.alt, shift: !!input.shift,
      });
      // Never preventDefault: the page under it may want the key too, and the
      // renderer decides what escape MEANS, here and everywhere else.
      if (theFrame && !aLetterFromAPage) sendItUp();
      else if (theFrame) {
        theFrame.executeJavaScript(IS_SHE_TYPING_IN_THE_PAGE, false)
          .then((typing) => { if (!typing) sendItUp(); })
          .catch(() => { /* the frame went away mid-press; the key is simply the page's */ });
      }
      // Escape stops here whatever happens; it is not one of the chords below.
      // A chord falls THROUGH, because ⌘R, ⌘=, ⌘0, ⌘Y and ⌘N are answered
      // further down this same handler and forwarding one must not take that
      // away. The renderer answers only Escape, ⌘K and her letters
      // (whatTheFileSentUp).
      if (input.key === 'Escape') return;
    }
    if (!input.meta) return;
    // ⌘=, ⌘- AND ⌘0 BELONG HERE FOR THE SAME REASON ⌘R DOES.They were menu
    // accelerators and nothing else, and this handler exists because menu
    // accelerators in this app have twice turned out not to arrive. Zoom is the
    // worst chord to leave on that route: Chromium stores the level against the
    // page's URL and restores it on every load, so a window that is zoomed
    // stays zoomed through ⌘R, through a rebuild, and through a relaunch, with
    // no way back.
    const zoomDelta = zoomDeltaFor(input);
    if (zoomDelta !== null) {
      applyZoom(zoomDelta, window.webContents);
      event.preventDefault();
      return;
    }
    const key = String(input.key).toLowerCase();
    // ⌘R BELONGS HERE FOR THE SAME REASON ⌘Y AND ⌘N DO. It was a menu
    // accelerator and nothing else, and the note above records what this file
    // already learned about those: they do not fire while a child web contents
    // owns the keyboard, which an open document does the whole time it is up.
    // She has reported ⌘R never working twice now, five days apart, and the
    // first fix (2026-08-06) changed WHAT the menu item does without moving it
    // off the accelerator that was not arriving. before-input-event runs in the
    // main process ahead of any page dispatch, so nothing on the page can
    // swallow it. Menu item stays, for discoverability and for the label.
    if (key === 'r') {
      reloadRenderer();
      event.preventDefault();
      return;
    }
    // ⌘F AND ⌘G, HERE FOR THE SAME REASON. Nothing in the app answered ⌘F at
    // all until w-cc5bc203d0 (2026-09-26), and a menu accelerator alone would
    // go dead the moment her click lands in an open file. The page decides what
    // the press means; this only says which one it was.
    if (key === 'f') {
      requestFind(0);
      event.preventDefault();
      return;
    }
    if (key === 'g') {
      requestFind(input.shift ? -1 : 1);
      event.preventDefault();
      return;
    }
    if (key !== 'y' && key !== 'n') return;
    const oldest = approvals.listPending(config.storeRoot)[0];
    if (!oldest) return;
    // Through the ipc layer's own door, so the renderer is told what was
    // decided and can acknowledge it. Answering the file directly from here is
    // what made the chord feel like nothing had happened (2026-08-06).
    ipc.answerApproval(oldest.id, key === 'y');
    event.preventDefault(); // the page never sees the chord; no double-answer
  });

  // ---- END OF THE CHORD WIRING ----
  //
  // THIS LINE IS LOAD-BEARING: two tests slice main.mjs from the input handler
  // above to these words to read the chord wiring on its own, so the words at
  // the start of it are not free to change.

  store.watch();
  // ZERO_NO_SUPERVISOR: run the inbox without spawning any sessions (UI work,
  // screenshots, cautious first runs).
  if (!process.env.ZERO_NO_SUPERVISOR) {
    // COMING BACK AFTER THE LID (her pick A on, her option 1 on). The app had no
    // idea the machine could sleep: `powerMonitor` appeared nowhere in this
    // process, and startup looked only for fresh work, never at the wreckage
    // the last run left. Measured: 34 mass die-offs in 12 days, 134 sessions
    // the app went away without reaping.
    //
    // The startup half lives inside supervisor.start, ahead of its first tick,
    // because the tick is what would otherwise put a stranger on those rows.
    // This is the other half: the lid.
    supervisor.onRecovered = (r) => {
      const line = recoveryToast(r);
      console.log(`zero: ${r.reason} recovery — resumed ${r.resumed}, waiting on her ${r.waiting}, no slot yet ${r.queued}`);
      if (!line) return;
      // The startup sweep runs BEFORE the page exists, so its line is held
      // rather than shouted at nobody: the renderer collects it on mount with
      // the rest of its boot info. A wake sweep goes straight out.
      pendingRecovery = line;
      if (pageReady && window && !window.isDestroyed()) {
        window.webContents.send('zero:recovered', { text: line });
        pendingRecovery = null;
      }
    };
    supervisor.start();
    powerMonitor.on('resume', () => {
      setTimeout(() => {
        try { supervisor.recoverInterrupted('wake'); } catch (e) { console.warn('zero: wake recovery:', e.message); }
      }, WAKE_SETTLE_MS);
    });
  }

  // Unread badge + notification on new inbox arrivals are driven by the
  // renderer (it owns the definition of "inbox"), through the badge API.
  ipcMain.handle('zero:badge', (_e, count) => {
    if (process.platform === 'darwin') app.dock.setBadge(count > 0 ? String(count) : '');
  });
  // WHETHER to speak, and what to say, is not the renderer's call: only this
  // process can see whether the window has focus, and a page cannot be trusted
  // to know she is looking at it (a webview owning the keyboard, another Space,
  // a locked screen all read the same from in there). The renderer says what
  // arrived; main/notify.mjs decides. tell me when I am in another app, never
  // while I am in Agentbox.
  installNotifier({ app, window, Notification, powerMonitor, ipcMain });
  // Asked for once by the renderer as it mounts, rather than pushed on
  // did-finish-load, which races the first effects and would drop the very
  // message it exists to deliver.
  ipcMain.handle('zero:boot-info', () => {
    const info = {
      reloaded: reloadRequested, builtAt: builtAt(), recovered: pendingRecovery,
    };
    reloadRequested = false;
    pendingRecovery = null;
    return info;
  });
  // The window's own uncaught errors. The renderer cannot write a report
  // itself (it has no disk and should not have one), and 'render-process-gone'
  // only fires when the process DIES, which a thrown React error does not.
  ipcMain.handle('zero:crash', (_e, payload) => { reportFromRenderer(payload ?? {}); });
  // External links from markdown open in the real browser; local artifacts
  // (a demo page, a screenshot a worker saved) open in their default app, so
  // "see it working" is one click from the message.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    else if (url.startsWith('file://')) shell.openPath(decodeURIComponent(url.replace('file://', '')));
    return { action: 'deny' };
  });

  // NO PAGE IN AN EMBEDDED BROWSER STARTS SOUND BEFORE SHE HAS CLICKED IN IT.
  //
  // Electron's default is `no-user-gesture-required`, so any page may start
  // media the moment it loads, and the rest browser reloads her last tab at
  // every launch, out of sight. Measured 2026-09-10 on Electron 43 in a hidden
  // webview on a YouTube watch page: default, the video ran from 3s to 15s;
  // with this rule it sat paused at 0 for all 16s. A click anywhere in the page
  // is activation, so pressing play, or picking the next video inside YouTube,
  // works as before. Every webview this window attaches gets it, the junk
  // browser included, which is what "never" asks for.
  window.webContents.on('will-attach-webview', (_e, webPreferences) => {
    webPreferences.autoplayPolicy = 'document-user-activation-required';
  });

  // Escape must ALWAYS leave the junk browser, even when the guest page has
  // focus and would otherwise swallow the key. Intercept it below the page.
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;
    contents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape' && window && !window.isDestroyed()) {
        window.webContents.send('zero:escape-browser');
        window.webContents.focus();
        return;
      }
      // The guest page owns the keyboard while she is in the junk browser, so
      // the window's handler never hears the zoom chord. Zoom the guest, not
      // the inbox: a webview carries its own level.
      const delta = zoomDeltaFor(input);
      if (delta !== null) {
        applyZoom(delta, contents);
        e.preventDefault();
      }
    });
  });

  // ZERO_DEBUG_CONSOLE: surface renderer and iframe console output in the
  // terminal, which is the only way to see inside a child frame on an
  // unattended run.
  if (process.env.ZERO_DEBUG_CONSOLE) {
    app.on('web-contents-created', (_e, contents) => {
      contents.on('console-message', (_ev, level, message, line, source) => {
        console.log(`[renderer:${level}] ${message} (${String(source).split('/').pop()}:${line})`);
      });
    });
    window.webContents.on('console-message', (_ev, level, message, line, source) => {
      console.log(`[renderer:${level}] ${message} (${String(source).split('/').pop()}:${line})`);
    });
  }

  const devUrl = process.env.ZERO_DEV_URL;
  const parts = [];
  if (process.env.ZERO_FIXTURES) parts.push(`fixtures=${process.env.ZERO_FIXTURES === 'empty' ? 'empty' : '1'}`);
  if (process.env.ZERO_FOCUS) parts.push('focus=1');
  const search = parts.length ? parts.join('&') : undefined;
  // A HOT-RELOADING WINDOW MUST NOT BE THE ONE SHE WORKS IN. Every dev window
  // that can ever exist comes through here, which is why the guard is here and
  // not in the npm script: the one that cost her an afternoon was started by
  // hand. See main/dev-window.mjs for what it allows and why.
  const verdict = hotWindowVerdict({
    devUrl,
    fixtures: !!process.env.ZERO_FIXTURES,
    forced: process.env.ZERO_DEV_ON_REAL_STORE === '1',
    storeRoot: config.storeRoot,
    storeHasWork: storeHasWork(fs, path, config.storeRoot),
  });
  const built = path.join(appDir, 'renderer', 'dist', 'index.html');
  if (devUrl && !verdict.allow) {
    console.error(verdict.message);
    // AND IT STILL OPENS A WINDOW. Refusing the dev server and then showing
    // nothing would trade her bug for a dead app. The built renderer is the
    // right answer when there is one; when there is not, the dev server is
    // better than a blank screen and the line above already said so.
    if (fs.existsSync(built)) await window.loadFile(built, search ? { search } : undefined);
    else {
      console.error('  There is no built renderer to fall back to, so the dev server it is. Run `npm run build`.\n');
      await window.loadURL(search ? `${devUrl}?${search}` : devUrl);
    }
  } else if (devUrl) {
    await window.loadURL(search ? `${devUrl}?${search}` : devUrl);
  } else {
    await window.loadFile(built, search ? { search } : undefined);
  }
  pageReady = true;

  // Dev aid: ZERO_SCREENSHOT=path captures the window after load and quits,
  // so the UI can be verified without a human at the screen.
  const shotPath = process.env.ZERO_SCREENSHOT;
  if (shotPath) {
    console.log(`loaded: ${window.webContents.getURL()}`);
    setTimeout(async () => {
      try {
        if (process.env.ZERO_DEBUG_CONSOLE) {
          const dom = await window.webContents.executeJavaScript(
            'JSON.stringify({ text: document.body.innerText.slice(0, 240), classes: [...document.querySelectorAll("[class]")].slice(0, 12).map(e => e.className) })',
          );
          console.log(`dom: ${dom}`);
        }
        const image = await window.webContents.capturePage();
        const fs = await import('node:fs');
        fs.writeFileSync(shotPath, image.toPNG());
        console.log(`screenshot: ${shotPath}`);
      } catch (err) {
        console.error('screenshot failed:', err.message);
      }
      app.quit();
    }, Number(process.env.ZERO_SCREENSHOT_DELAY_MS ?? 2500));
  }

  window.on('closed', () => {
    supervisor.stop();
    store.unwatch();
    window = null;
  });
}

// ONE the app, ever. Two instances mean two supervisors, and two supervisors
// spawn twin workers for every answered item (observed 2026-08-04: nine items
// double-spawned one second apart, four agents told the founder the same
// thing). A second launch just focuses the first.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app.whenReady().then(() => {
    // Serve a granted file, and nothing else. A page under this scheme is one
    // of ours, but it is written by an agent and read by her, so the check is
    // on every request rather than only on the one the pane asked for.
    // On every spelling this app has used, because a stored url carries the
    // name the app had the day it was written.
    for (const scheme of DOC_SCHEMES) protocol.handle(scheme, async (request) => {
      const file = docPath(request.url);
      if (!file || !docGrants.allows(file)) return new Response('Not available.', { status: 403 });
      try {
        // The file is streamed exactly as it is on disk, pictures and all.
        // Nothing is injected into a page any more; see doc-scheme.mjs for the
        // pinch zoom that briefly lived here and why she turned it down.
        //
        // NO-STORE, OR A REDRAWN PICTURE NEVER REACHES THE READER (w-3fc39983be).
        // The font in redrawn pictures looked unchanged, and that was a bug.
        // An agent redrew six pictures under the same names;
        // the page's html came back new and every <img> in it came back from
        // the window's memory, round one's pictures under round two's captions,
        // until a restart. Measured in a hidden probe of this exact setup
        // (file:// window, sandboxed frame, this scheme, net.fetch): picture
        // replaced on disk 2250 -> 3118 wide, page reopened, frame drew 2250.
        // With this header it drew 3118. These are local files; there is no
        // download to save by caching them.
        return noStore(await net.fetch(pathToFileURL(file).toString()));
      } catch {
        return new Response('Not there.', { status: 404 });
      }
    });
    // And her own pictures, on their own scheme, so the window can draw them
    // whichever origin it was loaded from (main/img-scheme.mjs). Two rules and
    // both have to pass: it is a picture, and it is inside a root the app owns.
    for (const scheme of IMG_SCHEMES) protocol.handle(scheme, async (request) => {
      const file = imgPath(request.url);
      if (!file || !servable(file, imageRoots())) return new Response('Not available.', { status: 403 });
      try {
        // A sound or a film is answered in the piece the player asked for, or
        // it plays but cannot be moved (mediaResponse, main/img-scheme.mjs).
        const res = mediaType(file)
          ? await mediaResponse(file, request.headers.get('range'))
          : await net.fetch(pathToFileURL(file).toString());
        // The window is allowed to read its own pictures back out, which is
        // what a copy needs. This widens nothing: the two rules above already
        // decided this file may be seen at all, and only this window can ask on
        // this scheme.
        // No-store here too, for the same reason as the page scheme above: a
        // screenshot an agent retakes under the same name is still a new picture.
        const out = noStore(res);
        out.headers.set('access-control-allow-origin', '*');
        return out;
      } catch {
        return new Response('Not there.', { status: 404 });
      }
    });
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
