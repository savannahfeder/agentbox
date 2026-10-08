// THE CORNER TAG'S WINDOW (w-dafae58a23). shared/corner-tag.mjs decides what
// it says, when it shows and where it sits; this file is the live half: one
// small floating window, the screens it can sit on, and her choices about it.
//
// What the window has to get right, each learned from the drawings:
//
// - IT NEVER TAKES THE KEYBOARD. It is a panel that does not activate, so
//   pointing at it, or even clicking it, leaves the cursor in whatever she was
//   typing in. Only opening a thread brings the app forward.
// - IT SHOWS OVER FULL-SCREEN APPS, because that is where she works, with no
//   dock and no menu bar in sight.
// - IT GOES WHERE SHE DRAGS IT, and stays there across restarts.
// - IT HIDES FOR A WHILE AND COMES BACK. 5 minutes, 30 minutes or the rest of
//   the day; off for good only in Settings, so a single click can never make
//   it a thing she closed once and forgot.
// - IT STEPS ASIDE WHILE SHE IS IN THE APP, where the inbox says it bigger.
//
// What the tag counts is not decided here. Only the page knows what the inbox
// is, so it hands over the list of what is ready and the count of what is
// working on `zero:corner-tag`, the way it already hands over the dock badge.

import { cardPlacement, hiddenUntil, keepCorner, restingSpot, tagShows, HIDE_CHOICES } from '../shared/corner-tag.mjs';

// Room around the tag and its list for their shadows, which a window clips.
export const PAD = 16;

const HIDE_LABELS = { '5m': 'Hide for 5 minutes', '30m': 'Hide for 30 minutes', today: 'Hide for the rest of today' };

export function createCornerTag({
  BrowserWindow, screen, ipcMain, Menu, config, saveConfig, mainWindow, load, preload,
  now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, mac = process.platform === 'darwin',
}) {
  let win = null;
  let ready = [];
  let working = 0;
  // The tag's own rectangle on screen, without the padding around it.
  let tag = null;
  let tagSize = { width: 120, height: 26 };
  let measured = false;
  let open = false;
  let drag = null;
  let wake = null;

  const areas = () => screen.getAllDisplays().map((d) => d.workArea);
  const areaOf = (r) => screen.getDisplayMatching({ x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) }).workArea;
  const inApp = () => {
    try { return !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused(); } catch { return false; }
  };
  const alive = () => !!win && !win.isDestroyed();

  const setBounds = (r) => {
    if (!alive()) return;
    win.setBounds({ x: Math.round(r.x - PAD), y: Math.round(r.y - PAD), width: Math.round(r.width + PAD * 2), height: Math.round(r.height + PAD * 2) });
  };

  const place = () => {
    const spot = restingSpot(tag ? { x: tag.x, y: tag.y } : config.cornerTagSpot ?? null, tagSize, areas());
    tag = { ...spot, ...tagSize };
    setBounds(tag);
  };

  const send = () => {
    if (!alive()) return;
    win.webContents.send('corner-tag:state', { ready, working, now: now() });
  };

  const make = () => {
    win = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      // A panel floats over full-screen apps without turning the whole app
      // into a background app, which would take the dock icon away.
      ...(mac ? { type: 'panel' } : {}),
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.setAlwaysOnTop(true, 'floating');
    try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true }); } catch {}
    win.on('closed', () => { win = null; });
    place();
    win.webContents.once('did-finish-load', () => { send(); refresh(); });
    load(win);
  };

  function refresh() {
    if (wake) { clearTimer(wake); wake = null; }
    const until = config.cornerTagHiddenUntil ?? 0;
    const shows = tagShows({
      on: config.cornerTag, hiddenUntil: until, now: now(), inApp: inApp(), ready: ready.length, working,
    });
    // A hide comes back by itself the moment it runs out.
    if (until > now()) wake = setTimer(refresh, until - now() + 50);
    if (!shows) {
      if (alive() && win.isVisible()) win.hide();
      open = false;
      return;
    }
    if (!alive()) { make(); return; }
    send();
    if (!win.isVisible() && !win.webContents.isLoading()) win.showInactive();
  }

  const bringAppForward = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return true;
  };

  const hide = (choice) => {
    const until = hiddenUntil(choice, now());
    if (!until) return;
    saveConfig(config, { cornerTagHiddenUntil: until });
    refresh();
  };

  const openSettings = () => {
    if (bringAppForward()) mainWindow.webContents.send('zero:open-settings', { pane: 'general' });
  };

  /* ------------------------------ from the page ---------------------------- */
  ipcMain.handle('zero:corner-tag', (_e, state) => {
    ready = Array.isArray(state?.ready) ? state.ready : [];
    working = Number.isFinite(state?.working) ? state.working : 0;
    refresh();
    return null;
  });

  ipcMain.handle('corner-tag:size', (_e, size) => {
    if (!size || !(size.width > 0) || !(size.height > 0)) return null;
    tagSize = { width: Math.ceil(size.width), height: Math.ceil(size.height) };
    if (open) return null;
    // The first measure places it where she left it. Every one after keeps
    // the edge nearest its corner still as the words change length.
    tag = tag && measured ? keepCorner(tag, tagSize, areaOf(tag)) : null;
    measured = true;
    place();
    return null;
  });

  // Pointing at the tag opens its list toward the middle of the screen. The
  // window grows to hold both, and the page is told where each one sits.
  ipcMain.handle('corner-tag:open', (_e, card) => {
    if (!tag || drag || !card) return null;
    const area = areaOf(tag);
    const p = cardPlacement(tag, { width: Math.ceil(card.width), height: Math.ceil(card.height) }, area);
    const x = Math.min(tag.x, p.card.x);
    const y = Math.min(tag.y, p.card.y);
    const right = Math.max(tag.x + tag.width, p.card.x + p.card.width);
    const bottom = Math.max(tag.y + tag.height, p.card.y + p.card.height);
    open = true;
    setBounds({ x, y, width: right - x, height: bottom - y });
    return {
      above: p.above,
      alignRight: p.alignRight,
      tag: { x: tag.x - x + PAD, y: tag.y - y + PAD },
      card: { x: p.card.x - x + PAD, y: p.card.y - y + PAD },
    };
  });

  ipcMain.handle('corner-tag:close', () => {
    open = false;
    if (tag) setBounds(tag);
    return null;
  });

  // Dragging moves the whole window; the page reports how far the pointer has
  // gone since it was pressed, so a fast drag that leaves the tag still lands.
  ipcMain.handle('corner-tag:drag-start', () => {
    if (!tag) return null;
    open = false;
    setBounds(tag);
    drag = { x: tag.x, y: tag.y };
    return null;
  });
  ipcMain.handle('corner-tag:drag', (_e, d) => {
    if (!drag || !alive()) return null;
    tag = { ...tag, x: drag.x + (d?.dx ?? 0), y: drag.y + (d?.dy ?? 0) };
    win.setPosition(Math.round(tag.x - PAD), Math.round(tag.y - PAD));
    return null;
  });
  ipcMain.handle('corner-tag:drag-end', () => {
    if (!drag) return null;
    drag = null;
    tag = { ...restingSpot({ x: tag.x, y: tag.y }, tagSize, areas()), ...tagSize };
    setBounds(tag);
    saveConfig(config, { cornerTagSpot: { x: Math.round(tag.x), y: Math.round(tag.y) } });
    return null;
  });

  ipcMain.handle('corner-tag:go', (_e, id) => {
    if (!bringAppForward()) return null;
    if (typeof id === 'string' && id) mainWindow.webContents.send('zero:open-item', { id });
    return null;
  });
  ipcMain.handle('corner-tag:hide', (_e, choice) => { hide(choice); return null; });
  ipcMain.handle('corner-tag:settings', () => { openSettings(); return null; });

  // A right-click on the tag offers the same choices as the list does.
  ipcMain.handle('corner-tag:menu', () => {
    if (!alive()) return null;
    Menu.buildFromTemplate([
      ...HIDE_CHOICES.map((c) => ({ label: HIDE_LABELS[c.key], click: () => hide(c.key) })),
      { type: 'separator' },
      { label: 'Turn off in Settings…', click: openSettings },
    ]).popup({ window: win });
    return null;
  });

  /* ------------------------------ from the app ----------------------------- */
  if (mainWindow) {
    mainWindow.on('focus', refresh);
    mainWindow.on('blur', refresh);
  }
  const replace = () => {
    if (!tag) return;
    tag = { ...restingSpot({ x: tag.x, y: tag.y }, tagSize, areas()), ...tagSize };
    if (!open) setBounds(tag);
  };
  try { screen.on('display-removed', replace); screen.on('display-metrics-changed', replace); } catch {}

  return {
    refresh,
    // Tests, and nothing else.
    _state: () => ({ ready, working, tag, open, visible: alive() && win.isVisible() }),
  };
}
