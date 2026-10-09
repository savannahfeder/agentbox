// THE CORNER TAG'S WINDOWS (w-dafae58a23). shared/corner-tag.mjs decides what
// it says, when it shows and where it sits; this file is the live half: the
// tag's own small window, the list that opens beside it, the screens they sit
// on, and her choices about them.
//
// What the windows have to get right, each learned from the drawings, from
// real-Electron runs, from four reviews by Codex, and from real mouse events
// posted at the real windows (2026-10-08), which is where the last three of
// these were found:
//
// - A PRESS ON THE TAG MUST NOT BRING THE APP FORWARD. It did, on every
//   floating-window setting tried: macOS makes the app active on a press, and
//   a window that may not take focus hands it to the app's main window, which
//   comes to the front. So the tag and its list MAY take focus. A press makes
//   the tag the active window and the app's window stays exactly where it was.
// - EACH WINDOW IS EXACTLY ITS PILL OR ITS LIST. The first version padded the
//   windows for a drawn shadow and let clicks fall through the padding, and
//   switching that on and off under the pointer told the page the pointer had
//   left, so a real first click fell straight through to the app beneath.
//   With no margin there is nothing to fall through, macOS draws the shadow,
//   and the glass is the system's own material: real blur of what is behind,
//   dark in dark mode and light in light mode, the way its own panels are.
// - A DRAG FOLLOWS THE REAL CURSOR. The page only says when the button went
//   down and up; between the two, this process reads the cursor itself, so a
//   drag never depends on the page being sent every move.
// - THE LIST OPENS ON A CLICK, NOT A PASS, in its own window so the tag never
//   moves. Off both for a moment and it shuts.
// - IT SHOWS OVER FULL-SCREEN APPS, IT HIDES FOR A WHILE AND COMES BACK, it is
//   off for good only in Settings, it steps aside while she is in the app, and
//   it goes when the app's window goes.
//
// What the tag counts is not decided here. Only the page knows what the inbox
// is, so it hands over what is ready and how many are working on
// `zero:corner-tag`; shared/corner-tag.mjs keeps what is fresh, newest first.

import { cardPlacement, hiddenUntil, keepCorner, readyNow, restingSpot, tagShows, HIDE_CHOICES } from '../shared/corner-tag.mjs';

// How long the pointer may be off both the tag and its list before the list
// shuts: long enough to cross the gap between them, short enough to feel like
// it follows the pointer.
export const CLOSE_AFTER_MS = 450;
// Far enough that a click with a shaky hand is still a click.
export const DRAG_FROM_PX = 6;
// How often a drag reads the cursor: once a frame.
const FRAME_MS = 16;
// A press whose release never came is let go after this long.
const PRESS_GIVES_UP_MS = 60_000;

const HIDE_LABELS = { '5m': 'Hide for 5 minutes', '30m': 'Hide for 30 minutes', today: 'Hide for the rest of today' };
const CHANNELS = [
  'zero:corner-tag', 'corner-tag:ready', 'corner-tag:size', 'corner-tag:hover', 'corner-tag:toggle',
  'corner-tag:press', 'corner-tag:release', 'corner-tag:go', 'corner-tag:hide', 'corner-tag:settings', 'corner-tag:menu',
];

export function createCornerTag({
  BrowserWindow, screen, ipcMain, Menu, powerMonitor, config, saveConfig, mainWindow, load, preload,
  now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, mac = process.platform === 'darwin',
}) {
  const wins = { tag: null, card: null };
  const loaded = { tag: false, card: false };
  const hovered = { tag: false, card: false };
  let ready = [];
  let working = 0;
  // The tag's rectangle on screen; its window is exactly this.
  let tag = null;
  let tagSize = { width: 96, height: 26 };
  let measured = false;
  let cardSize = null;
  let open = false;
  // A press on the tag: where the cursor and the tag were when it went down,
  // and whether it has moved far enough to be a drag.
  let press = null;
  let wake = null;
  let closing = null;
  let watching = null;
  let gone = false;

  const fresh = () => readyNow(ready, now());
  const areas = () => screen.getAllDisplays().map((d) => d.workArea);
  const areaOf = (r) => screen.getDisplayMatching({ x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) }).workArea;
  const inApp = () => {
    try { return !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused(); } catch { return false; }
  };
  const alive = (part) => !!wins[part] && !wins[part].isDestroyed();
  const rounded = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
  const send = (part, channel, payload) => { if (alive(part) && loaded[part]) wins[part].webContents.send(channel, payload); };
  const sendState = () => {
    const s = { ready: fresh(), working, now: now(), open };
    send('tag', 'corner-tag:state', s);
    send('card', 'corner-tag:state', s);
  };
  const shouldShow = () => tagShows({
    on: config.cornerTag, hiddenUntil: config.cornerTagHiddenUntil ?? 0, now: now(), inApp: inApp(), ready: fresh().length, working,
  });
  // The list may only appear beside a tag that is on screen and should be.
  // A click that was on its way while the tag hid must not open it alone.
  const tagUp = () => !gone && alive('tag') && wins.tag.isVisible() && shouldShow();

  const placeTag = () => {
    const spot = restingSpot(tag ? { x: tag.x, y: tag.y } : config.cornerTagSpot ?? null, tagSize, areas());
    tag = { ...spot, ...tagSize };
    if (alive('tag')) wins.tag.setBounds(rounded(tag));
  };

  const placeCard = () => {
    if (!tag || !cardSize || !alive('card')) return;
    wins.card.setBounds(rounded(cardPlacement(tag, cardSize, areaOf(tag)).card));
  };

  const make = (part) => {
    const win = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      // The system's own frosted material, which blurs what is behind and
      // follows dark and light mode; the page draws only a faint tint on it.
      vibrancy: 'popover',
      visualEffectState: 'active',
      roundedCorners: true,
      hasShadow: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // May take focus, so a press never hands it to the app's main window.
      focusable: true,
      // The first click on a window that is not active still counts.
      acceptFirstMouse: true,
      alwaysOnTop: true,
      // A panel floats over full-screen apps without turning the whole app
      // into a background app, which would take the dock icon away.
      ...(mac ? { type: 'panel' } : {}),
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.setAlwaysOnTop(true, 'floating');
    try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true }); } catch {}
    win.on('closed', () => { wins[part] = null; loaded[part] = false; });
    // A reload starts the handshake again: the window goes, anything half
    // done with it is let go, and until the page says it is ready nothing is
    // sent to it and it is not shown. The first load is not a reload.
    win.webContents.on('did-start-loading', () => {
      if (!loaded[part]) return;
      loaded[part] = false;
      hovered[part] = false;
      if (part === 'tag') { endPress(true); if (win.isVisible()) win.hide(); }
      closeCard();
    });
    wins[part] = win;
    if (part === 'tag') placeTag();
    load(win, part);
    return win;
  };

  const cancelClose = () => { if (closing) { clearTimer(closing); closing = null; } };

  function closeCard() {
    cancelClose();
    open = false;
    hovered.card = false;
    if (alive('card') && wins.card.isVisible()) wins.card.hide();
    send('tag', 'corner-tag:open', false);
  }

  const showCard = () => {
    if (open && tagUp() && loaded.card && cardSize && alive('card') && !wins.card.isVisible()) wins.card.showInactive();
  };

  function openCard() {
    if (!tag || press?.moved || !tagUp()) return;
    open = true;
    send('tag', 'corner-tag:open', true);
    watch();
    reconsider();
    if (!alive('card')) { make('card'); return; }
    sendState();
    placeCard();
    showCard();
  }

  /* --------------------- where the pointer really is ---------------------- */
  // The page says when the pointer comes and goes, and that is trusted, but a
  // boundary event can go missing, so while the list is open the real cursor
  // is read a few times a second and wins. Nothing is read otherwise.
  const within = (pt, r) => !!r && pt.x >= r.x && pt.x < r.x + r.width && pt.y >= r.y && pt.y < r.y + r.height;
  const drawn = (part) => (alive(part) && wins[part].isVisible() ? wins[part].getBounds() : null);
  const readCursor = () => {
    const pt = screen.getCursorScreenPoint?.();
    if (!pt || press) return false;
    for (const part of ['tag', 'card']) hovered[part] = within(pt, drawn(part));
    return true;
  };

  function watch() {
    if (watching || gone) return;
    const tick = () => {
      watching = null;
      if (gone) return;
      readCursor();
      reconsider();
      if (open || hovered.tag || hovered.card) watching = setTimer(tick, 200);
    };
    watching = setTimer(tick, 200);
  }

  // Whether the open list should start, keep or drop its countdown to shutting.
  function reconsider() {
    if (!open || hovered.tag || hovered.card) { cancelClose(); return; }
    if (closing) return;
    closing = setTimer(() => {
      closing = null;
      // The last word is the real cursor's: a pointer that came back without
      // the page noticing keeps the list open.
      readCursor();
      if (!hovered.tag && !hovered.card) closeCard();
      else watch();
    }, CLOSE_AFTER_MS);
  }

  /* ------------------------------- the press ------------------------------ */
  // Where the cursor is now, against where it was when the button went down.
  const follow = () => {
    const pt = screen.getCursorScreenPoint?.();
    if (!pt || !press) return;
    const dx = pt.x - press.start.x;
    const dy = pt.y - press.start.y;
    if (!press.moved && Math.hypot(dx, dy) >= DRAG_FROM_PX) {
      press.moved = true;
      closeCard();
      send('tag', 'corner-tag:dragging', true);
    }
    if (press.moved && alive('tag')) {
      tag = { ...tag, x: press.from.x + dx, y: press.from.y + dy };
      wins.tag.setPosition(Math.round(tag.x), Math.round(tag.y));
    }
  };

  function step() {
    if (!press || gone) return;
    press.timer = null;
    follow();
    if (now() - press.at > PRESS_GIVES_UP_MS) { endPress(true); return; }
    press.timer = setTimer(step, FRAME_MS);
  }

  // The button came up (or the press was taken away). A drag lands where the
  // cursor left it and is remembered; a press that never moved is a click.
  function endPress(cancelled) {
    if (!press) return;
    if (press.timer) clearTimer(press.timer);
    press.timer = null;
    const p = press;
    if (!cancelled) follow();
    press = null;
    if (p.moved) {
      tag = { ...restingSpot({ x: tag.x, y: tag.y }, tagSize, areas()), ...tagSize };
      if (alive('tag')) wins.tag.setBounds(rounded(tag));
      saveConfig(config, { cornerTagSpot: { x: Math.round(tag.x), y: Math.round(tag.y) } });
      send('tag', 'corner-tag:dragging', false);
    } else if (!cancelled) {
      if (open) closeCard(); else openCard();
    }
  }

  // Everything that is not on screen is back where it starts: the list shut,
  // no press half-done, so the tag comes back exactly as it was first drawn.
  const reset = () => {
    endPress(true);
    closeCard();
    hovered.tag = false;
    send('tag', 'corner-tag:reset', null);
    if (alive('tag') && tag) wins.tag.setBounds(rounded(tag));
  };

  function refresh() {
    if (gone) return;
    if (wake) { clearTimer(wake); wake = null; }
    const until = config.cornerTagHiddenUntil ?? 0;
    // A hide comes back by itself the moment it runs out.
    if (until > now()) wake = setTimer(refresh, until - now() + 50);
    if (!shouldShow()) {
      if (alive('tag') && wins.tag.isVisible()) { wins.tag.hide(); reset(); }
      else if (open) closeCard();
      return;
    }
    if (!alive('tag')) { make('tag'); return; }
    sendState();
    if (loaded.tag && !wins.tag.isVisible()) wins.tag.showInactive();
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
    closeCard();
    if (bringAppForward()) mainWindow.webContents.send('zero:open-settings', { pane: 'general' });
  };

  const partOf = (p) => (p?.part === 'card' ? 'card' : 'tag');

  /* ------------------------------ from the app's page ---------------------- */
  ipcMain.handle('zero:corner-tag', (_e, state) => {
    ready = Array.isArray(state?.ready) ? state.ready : [];
    working = Number.isFinite(state?.working) ? state.working : 0;
    refresh();
    return null;
  });

  /* ------------------------------ from the tag's pages --------------------- */
  ipcMain.handle('corner-tag:ready', (_e, p) => {
    const part = partOf(p);
    loaded[part] = true;
    sendState();
    if (part === 'tag') refresh();
    else if (open) { placeCard(); showCard(); }
    return null;
  });

  ipcMain.handle('corner-tag:size', (_e, p) => {
    if (!p || !(p.width > 0) || !(p.height > 0)) return null;
    const size = { width: Math.ceil(p.width), height: Math.ceil(p.height) };
    if (partOf(p) === 'card') {
      cardSize = size;
      if (open) { placeCard(); showCard(); }
      return null;
    }
    tagSize = size;
    // Nothing moves under the pointer while it is dragging.
    if (press?.moved) return null;
    // The first measure places it where she left it. Every one after keeps
    // the edge nearest its corner still as the words change length.
    tag = tag && measured ? keepCorner(tag, tagSize, areaOf(tag)) : null;
    measured = true;
    placeTag();
    if (open) placeCard();
    return null;
  });

  ipcMain.handle('corner-tag:hover', (_e, p) => {
    hovered[partOf(p)] = !!p?.inside;
    reconsider();
    if (p?.inside) watch();
    return null;
  });

  ipcMain.handle('corner-tag:toggle', () => {
    if (open) closeCard(); else openCard();
    return null;
  });

  // `at` is where the button went down, from the page. The message can arrive
  // after the cursor has already moved, and starting from the cursor then put
  // the tag about 30 px off under it. A press on a tag that has since hidden
  // starts nothing.
  ipcMain.handle('corner-tag:press', (_e, at) => {
    const pt = Number.isFinite(at?.x) && Number.isFinite(at?.y) ? { x: at.x, y: at.y } : screen.getCursorScreenPoint?.();
    if (!pt || !tag || !tagUp() || press) return null;
    press = { start: pt, from: { x: tag.x, y: tag.y }, moved: false, at: now(), timer: null };
    press.timer = setTimer(step, FRAME_MS);
    return null;
  });
  ipcMain.handle('corner-tag:release', (_e, p) => { endPress(!!p?.cancelled); return null; });

  ipcMain.handle('corner-tag:go', (_e, id) => {
    closeCard();
    if (!bringAppForward()) return null;
    if (typeof id === 'string' && id) mainWindow.webContents.send('zero:open-item', { id });
    return null;
  });
  ipcMain.handle('corner-tag:hide', (_e, choice) => { hide(choice); return null; });
  ipcMain.handle('corner-tag:settings', () => { openSettings(); return null; });

  // A right-click on the tag offers the same choices as the list does.
  ipcMain.handle('corner-tag:menu', () => {
    if (!alive('tag')) return null;
    closeCard();
    Menu.buildFromTemplate([
      ...HIDE_CHOICES.map((c) => ({ label: HIDE_LABELS[c.key], click: () => hide(c.key) })),
      { type: 'separator' },
      { label: 'Turn off in Settings…', click: openSettings },
    ]).popup({ window: wins.tag });
    return null;
  });

  /* ------------------------------ from the system -------------------------- */
  // A screen that comes, goes or changes shape: the list shuts and the tag is
  // pulled back onto a screen if it was left hanging off one.
  const reseat = () => {
    if (gone) return;
    closeCard();
    if (!tag || press) return;
    tag = { ...restingSpot({ x: tag.x, y: tag.y }, tagSize, areas()), ...tagSize };
    if (alive('tag')) wins.tag.setBounds(rounded(tag));
  };
  // After sleep the screens may have changed and a hide may have run out.
  const woke = () => { reseat(); refresh(); };

  const onFocus = () => refresh();
  // The app's window is gone, and the tag goes with it. Left behind, it would
  // hold the app open with nothing behind it and nothing it could open.
  const dispose = () => {
    if (gone) return;
    gone = true;
    endPress(true);
    cancelClose();
    if (wake) { clearTimer(wake); wake = null; }
    if (watching) { clearTimer(watching); watching = null; }
    for (const part of ['tag', 'card']) if (alive(part)) wins[part].destroy();
    for (const ch of CHANNELS) { try { ipcMain.removeHandler?.(ch); } catch {} }
    try {
      screen.removeListener?.('display-added', reseat);
      screen.removeListener?.('display-removed', reseat);
      screen.removeListener?.('display-metrics-changed', reseat);
      powerMonitor?.removeListener?.('resume', woke);
      powerMonitor?.removeListener?.('unlock-screen', woke);
    } catch {}
  };

  if (mainWindow) {
    mainWindow.on('focus', onFocus);
    mainWindow.on('blur', onFocus);
    mainWindow.on('closed', dispose);
  }
  try {
    screen.on('display-added', reseat);
    screen.on('display-removed', reseat);
    screen.on('display-metrics-changed', reseat);
  } catch {}
  try { powerMonitor?.on?.('resume', woke); powerMonitor?.on?.('unlock-screen', woke); } catch {}

  return {
    refresh,
    dispose,
    // Tests, and nothing else.
    _state: () => ({ ready: fresh(), working, tag, open, visible: alive('tag') && wins.tag.isVisible() }),
  };
}
