// THE CORNER TAG'S WINDOWS (w-dafae58a23). shared/corner-tag.mjs decides what
// it says, when it shows and where it sits; this file is the live half: the
// tag's own small window, the list that opens beside it, the screens they sit
// on, and her choices about them.
//
// What the windows have to get right, each learned from the drawings, from a
// real-Electron run and from a review by Codex (2026-10-07):
//
// - THEY NEVER TAKE THE KEYBOARD. Both are panels that do not activate, so
//   pointing at them, or even clicking, leaves the cursor in whatever she was
//   typing in. Only opening a thread brings the app forward.
// - THEY SHOW OVER FULL-SCREEN APPS, because that is where she works, with no
//   dock and no menu bar in sight.
// - THE EMPTY MARGIN IS NOT THERE. A window is a rectangle and the tag is a
//   pill with a shadow, so each window lets clicks fall through to the app
//   beneath it until the pointer is over something drawn.
// - THE LIST OPENS ON A CLICK, NOT A PASS. Opening on hover meant a pointer
//   crossing the corner on its way somewhere opened it. Hovering only shows
//   that the tag can be dragged; clicking it opens the list; leaving both for
//   a moment closes it. The list is its own window so the tag never moves.
// - IT GOES WHERE SHE DRAGS IT, and stays there across restarts.
// - IT HIDES FOR A WHILE AND COMES BACK: 5 minutes, 30 minutes or the rest of
//   the day; off for good only in Settings, so a single click can never make
//   it a thing she closed once and forgot.
// - IT STEPS ASIDE WHILE SHE IS IN THE APP, where the inbox says it bigger,
//   and it goes when the app's window goes; otherwise it would keep the app
//   alive with nothing behind it.
//
// What the tag counts is not decided here. Only the page knows what the inbox
// is, so it hands over the list of what is ready and the count of what is
// working on `zero:corner-tag`, the way it already hands over the dock badge.

import { cardPlacement, hiddenUntil, keepCorner, restingSpot, tagShows, HIDE_CHOICES } from '../shared/corner-tag.mjs';

// Room around the tag and its list for their shadows, which a window clips.
export const PAD = 16;
// How long the pointer may be off both the tag and its list before the list
// closes: long enough to cross the gap between them, short enough to feel
// like it follows the pointer.
export const CLOSE_AFTER_MS = 450;

const HIDE_LABELS = { '5m': 'Hide for 5 minutes', '30m': 'Hide for 30 minutes', today: 'Hide for the rest of today' };
const CHANNELS = [
  'zero:corner-tag', 'corner-tag:ready', 'corner-tag:size', 'corner-tag:solid', 'corner-tag:hover', 'corner-tag:toggle',
  'corner-tag:drag-start', 'corner-tag:drag', 'corner-tag:drag-end', 'corner-tag:go', 'corner-tag:hide',
  'corner-tag:settings', 'corner-tag:menu',
];

export function createCornerTag({
  BrowserWindow, screen, ipcMain, Menu, powerMonitor, config, saveConfig, mainWindow, load, preload,
  now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, mac = process.platform === 'darwin',
}) {
  const wins = { tag: null, card: null };
  const loaded = { tag: false, card: false };
  const hovered = { tag: false, card: false };
  // Whether each window is taking clicks right now, rather than letting them
  // fall through to the app beneath it.
  const solid = { tag: false, card: false };
  let watching = null;
  let ready = [];
  let working = 0;
  // The tag's own rectangle on screen, without the padding around it.
  let tag = null;
  let tagSize = { width: 120, height: 26 };
  let measured = false;
  let cardSize = null;
  let open = false;
  let drag = null;
  let wake = null;
  let closing = null;
  let gone = false;

  const areas = () => screen.getAllDisplays().map((d) => d.workArea);
  const areaOf = (r) => screen.getDisplayMatching({ x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) }).workArea;
  const inApp = () => {
    try { return !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused(); } catch { return false; }
  };
  const alive = (part) => !!wins[part] && !wins[part].isDestroyed();
  const padded = (r) => ({ x: Math.round(r.x - PAD), y: Math.round(r.y - PAD), width: Math.round(r.width + PAD * 2), height: Math.round(r.height + PAD * 2) });
  const send = (part, channel, payload) => { if (alive(part) && loaded[part]) wins[part].webContents.send(channel, payload); };
  const sendState = () => {
    const s = { ready, working, now: now(), open };
    send('tag', 'corner-tag:state', s);
    send('card', 'corner-tag:state', s);
  };

  const placeTag = () => {
    const spot = restingSpot(tag ? { x: tag.x, y: tag.y } : config.cornerTagSpot ?? null, tagSize, areas());
    tag = { ...spot, ...tagSize };
    if (alive('tag')) wins.tag.setBounds(padded(tag));
  };

  const shouldShow = () => tagShows({
    on: config.cornerTag, hiddenUntil: config.cornerTagHiddenUntil ?? 0, now: now(), inApp: inApp(), ready: ready.length, working,
  });
  // The list may only appear beside a tag that is on screen and should be.
  // A click that was on its way while the tag hid must not open it alone.
  const tagUp = () => !gone && alive('tag') && wins.tag.isVisible() && shouldShow();

  const setSolid = (part, on) => {
    if (!alive(part)) return;
    // Mid-drag the tag keeps the pointer whatever the page says.
    if (part === 'tag' && drag) on = true;
    solid[part] = on;
    if (on) wins[part].setIgnoreMouseEvents(false);
    else wins[part].setIgnoreMouseEvents(true, { forward: true });
  };

  const placeCard = () => {
    if (!tag || !cardSize || !alive('card')) return;
    const p = cardPlacement(tag, cardSize, areaOf(tag));
    wins.card.setBounds(padded(p.card));
  };

  const make = (part) => {
    const win = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
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
    // Clicks fall through until the page says the pointer is over the tag.
    win.setIgnoreMouseEvents(true, { forward: true });
    win.on('closed', () => { wins[part] = null; loaded[part] = false; });
    // A reload starts the handshake again: the window goes, anything half
    // done with it is let go, and until the page says it is ready nothing is
    // sent to it and it is not shown.
    win.webContents.on('did-start-loading', () => {
      // The first load is not a reload, and must not shut the list it is for.
      if (!loaded[part]) return;
      loaded[part] = false;
      hovered[part] = false;
      if (part === 'tag') { drag = null; if (win.isVisible()) win.hide(); }
      closeCard();
      setSolid(part, false);
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
    // A shut list stops catching clicks at once, not at the next pointer move.
    setSolid('card', false);
    send('tag', 'corner-tag:open', false);
  }

  const showCard = () => {
    if (open && tagUp() && loaded.card && cardSize && alive('card') && !wins.card.isVisible()) wins.card.showInactive();
  };

  function openCard() {
    if (!tag || drag || !tagUp()) return;
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
  // The page says when the pointer comes and goes, and the windows trust it,
  // but a boundary event can go missing: a pointer flicked off the corner, a
  // window shown under a pointer that never moved. So while anything depends
  // on the pointer, the real cursor is checked a few times a second and wins.
  const within = (pt, r) => !!r && pt.x >= r.x && pt.x < r.x + r.width && pt.y >= r.y && pt.y < r.y + r.height;
  const drawn = (part) => {
    if (!alive(part) || !wins[part].isVisible()) return null;
    if (part === 'tag') return tag;
    const b = wins.card.getBounds();
    return { x: b.x + PAD, y: b.y + PAD, width: b.width - PAD * 2, height: b.height - PAD * 2 };
  };
  const needsWatching = () => open || solid.tag || solid.card || hovered.tag || hovered.card;

  // Where the real cursor is, for both windows, when the system will say.
  // It sets both what each window counts as pointed at and whether it takes
  // clicks, in both directions: a missed leave lets clicks through again, a
  // missed enter makes the list clickable. Returns false when it cannot say.
  const readCursor = () => {
    const pt = screen.getCursorScreenPoint?.();
    if (!pt || drag) return false;
    for (const part of ['tag', 'card']) {
      const inside = within(pt, drawn(part));
      hovered[part] = inside;
      if (inside !== solid[part]) setSolid(part, inside);
    }
    return true;
  };

  function watch() {
    if (watching || gone) return;
    const tick = () => {
      watching = null;
      if (gone) return;
      readCursor();
      reconsider();
      if (needsWatching()) watching = setTimer(tick, 200);
    };
    watching = setTimer(tick, 200);
  }

  // Whether the open list should start, keep or drop its countdown to shutting.
  // Asked after every change of hover and every check of the cursor, so a list
  // whose pointer left before it opened still shuts.
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

  function noteHover(part, inside) {
    hovered[part] = inside;
    reconsider();
  }

  // Everything that is not on screen is back where it starts: the list shut,
  // no drag half-done, so the tag comes back exactly as it was first drawn.
  const reset = () => {
    closeCard();
    drag = null;
    hovered.tag = false;
    send('tag', 'corner-tag:reset', null);
    setSolid('tag', false);
    if (alive('tag') && tag) wins.tag.setBounds(padded(tag));
  };

  function refresh() {
    if (gone) return;
    if (wake) { clearTimer(wake); wake = null; }
    const until = config.cornerTagHiddenUntil ?? 0;
    const shows = tagShows({
      on: config.cornerTag, hiddenUntil: until, now: now(), inApp: inApp(), ready: ready.length, working,
    });
    // A hide comes back by itself the moment it runs out.
    if (until > now()) wake = setTimer(refresh, until - now() + 50);
    if (!shows) {
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
    if (drag) return null;
    // The first measure places it where she left it. Every one after keeps
    // the edge nearest its corner still as the words change length.
    tag = tag && measured ? keepCorner(tag, tagSize, areaOf(tag)) : null;
    measured = true;
    placeTag();
    if (open) placeCard();
    return null;
  });

  // The page says when the pointer is over something drawn, and only then
  // does the window take the click; the rest falls through to the app below.
  ipcMain.handle('corner-tag:solid', (_e, p) => {
    setSolid(partOf(p), !!p?.solid);
    if (p?.solid) watch();
    return null;
  });

  ipcMain.handle('corner-tag:hover', (_e, p) => {
    noteHover(partOf(p), !!p?.inside);
    if (p?.inside) watch();
    return null;
  });

  ipcMain.handle('corner-tag:toggle', () => {
    if (open) closeCard(); else openCard();
    return null;
  });

  // Dragging moves the tag's window; the page reports how far the pointer has
  // gone since it was pressed, so a fast drag that outruns the tag still lands.
  ipcMain.handle('corner-tag:drag-start', () => {
    if (!tag || !alive('tag')) return null;
    closeCard();
    drag = { x: tag.x, y: tag.y };
    setSolid('tag', true);
    return null;
  });
  ipcMain.handle('corner-tag:drag', (_e, d) => {
    if (!drag || !alive('tag')) return null;
    tag = { ...tag, x: drag.x + (d?.dx ?? 0), y: drag.y + (d?.dy ?? 0) };
    wins.tag.setPosition(Math.round(tag.x - PAD), Math.round(tag.y - PAD));
    return null;
  });
  // Also how an interrupted drag ends: it stays where the pointer left it.
  ipcMain.handle('corner-tag:drag-end', () => {
    if (!drag) return null;
    drag = null;
    tag = { ...restingSpot({ x: tag.x, y: tag.y }, tagSize, areas()), ...tagSize };
    if (alive('tag')) wins.tag.setBounds(padded(tag));
    saveConfig(config, { cornerTagSpot: { x: Math.round(tag.x), y: Math.round(tag.y) } });
    return null;
  });

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
    if (!tag || drag) return;
    tag = { ...restingSpot({ x: tag.x, y: tag.y }, tagSize, areas()), ...tagSize };
    if (alive('tag')) wins.tag.setBounds(padded(tag));
  };
  // After sleep the screens may have changed and a hide may have run out.
  const woke = () => { reseat(); refresh(); };

  const onFocus = () => refresh();
  // The app's window is gone, and the tag goes with it. Left behind, it would
  // hold the app open with nothing behind it and nothing it could open.
  const dispose = () => {
    if (gone) return;
    gone = true;
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
    _state: () => ({ ready, working, tag, open, visible: alive('tag') && wins.tag.isVisible() }),
  };
}
