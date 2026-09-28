// The application menu. The app is keyboard-first, so the menu's job is mostly
// to make the OS-level chords real: zoom, copy/paste, window management.
// Zoom targets the content the keystroke arrived on, which matters because an
// open document is a webview with its own zoom.

import { app, BrowserWindow, Menu, webContents } from 'electron';
import { zoomTarget } from './zoom-keys.mjs';
import { zoomPercentFor } from './zoom-readout.mjs';

// Approval hotkeys live in the MENU, not the renderer: a child web contents
// owns the keyboard whenever one is up, so a renderer listener never hears
// anything while she is inside one. Menu accelerators fire regardless of what
// has focus.

// TWO ROUTES TO ONE STEP. ⌘=, ⌘- and ⌘0 all did nothing. The menu accelerator
// was the only route, and this file already knows what that is worth: the note
// below ⌘R records that accelerators here "do not fire while a child web
// contents owns the keyboard", which is why ⌘R, ⌘Y and ⌘N were all moved into
// before-input-event in the main process. Zoom was left behind, on a chord she
// cannot work around, because Chromium persists the zoom level per page URL
// and hands it back after every reload.
//
// So the chords are now handled in main.mjs as well, and this stays for the
// menu's label and for a click. On macOS the two are exclusive (AppKit eats a
// key equivalent before the page can see it); the guard below is what keeps
// that an assumption rather than a load-bearing one, exactly like the reload
// debounce in main.mjs.
let lastZoomAt = 0;
let lastZoomDelta = null;

/**
 * Move the zoom one step. `target` is the web contents the caller named: the
 * one a keystroke arrived on, or the window a menu click was chosen from. When
 * nobody names one it falls back to whatever is focused, and then to the app's
 * own window. That last fallback is the fix for her second report: focus can be
 * nowhere, and a target of null was a silent no-op.
 */
export function applyZoom(delta, target = null) {
  const now = Date.now();
  if (delta === lastZoomDelta && now - lastZoomAt < 40) return;
  lastZoomAt = now;
  lastZoomDelta = delta;
  const contents = zoomTarget({
    named: target,
    focused: webContents.getFocusedWebContents(),
    appWindow: appWindowContents(),
  });
  if (!contents) return;
  if (delta === 0) contents.setZoomLevel(0);
  else contents.setZoomLevel(Math.max(-6, Math.min(6, contents.getZoomLevel() + delta)));
  announceZoom(contents.getZoomLevel());
}

// The number is worked out here, where the level actually changes, and the
// page only draws what it is handed.
//
// It always goes to the APP window, even when the level that moved belongs to
// the junk browser's guest: the guest is a page inside her window, and a
// browser puts its own readout in its own corner rather than in the page.
function announceZoom(level) {
  const percent = zoomPercentFor(level);
  if (percent === null) return;
  const target = appWindowContents();
  if (!target || target.isDestroyed?.()) return;
  target.send?.('zero:zoom-percent', { percent });
}

// ⌘F, ⌘G AND ⇧⌘G. The app finds its own words (renderer/src/find-in-page.ts
// says why it is not Chromium's findInPage), so all this does is tell the page
// which one was pressed: 0 opens the box, 1 and -1 walk the matches.
//
// Two routes again, the menu and before-input-event in main.mjs, for the reason
// zoom has two, and the same guard keeps one press from arriving twice.
let lastFindAt = 0;
let lastFindStep = null;

export function requestFind(step) {
  const now = Date.now();
  if (step === lastFindStep && now - lastFindAt < 40) return;
  lastFindAt = now;
  lastFindStep = step;
  const target = appWindowContents();
  if (!target || target.isDestroyed?.()) return;
  target.send?.('zero:find', { step });
}

function appWindowContents() {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  return window && !window.isDestroyed() ? window.webContents : null;
}

export function installMenu({ onApproval, onReload, onZoom } = {}) {
  // A CLICK NAMES ITS WINDOW.after the chords were fixed. Electron hands a menu
  // click the window it was chosen from, so the click stops asking what is
  // focused, which is the question that was coming back null. main.mjs decides
  // the keystroke's target from where the event arrived: inside the junk
  // browser it is the guest, which carries its own zoom.
  const zoom = (delta, window) => {
    const target = window && !window.isDestroyed() ? (window.webContents ?? null) : null;
    return onZoom ? onZoom(delta, target) : applyZoom(delta, target);
  };

  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CommandOrControl+F', click: () => requestFind(0) },
        { label: 'Find Next', accelerator: 'CommandOrControl+G', click: () => requestFind(1) },
        { label: 'Find Previous', accelerator: 'Shift+CommandOrControl+G', click: () => requestFind(-1) },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CommandOrControl+=', click: (_item, window) => zoom(0.5, window) },
        { label: 'Zoom In (numpad)', accelerator: 'CommandOrControl+Plus', click: (_item, window) => zoom(0.5, window), visible: false, acceleratorWorksWhenHidden: true },
        { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: (_item, window) => zoom(-0.5, window) },
        { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: (_item, window) => zoom(0, window) },
        { type: 'separator' },
        // ⌘R PUTS THE BUILT RENDERER ON SCREEN, which is the only thing anyone
        // ever presses it for here.
        //
        // The main document has exactly the same problem and it is worse
        // there, because index.html names a CONTENT-HASHED bundle: one cached
        // index.html hands back the old filename, so the old renderer loads
        // and every change is invisible. ⇧⌘R was added as the workaround
        // rather than the fix.
        //
        // Both chords now ignore the cache, and both go through the app's own
        // window rather than "whatever is focused", so a webview holding focus
        // cannot turn the key into a no-op either.
        { label: 'Reload', accelerator: 'CommandOrControl+R', click: () => onReload?.() },
        { label: 'Force Reload', accelerator: 'Shift+CommandOrControl+R', click: () => onReload?.() },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Agents',
      submenu: [
        { label: 'Allow Pending Approval', accelerator: 'Command+Y', click: () => onApproval?.(true) },
        { label: 'Deny Pending Approval', accelerator: 'Command+N', click: () => onApproval?.(false) },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
