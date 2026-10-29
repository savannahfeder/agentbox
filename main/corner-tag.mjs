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
//   With no margin there is nothing to fall through. The page draws the
//   glass, its small corners and its edge. The window has no system shadow:
//   with one, macOS also drew its own window outline (a black hairline and a
//   light band) around the glass, a strong border no picture had shown.
// - A DRAG FOLLOWS THE REAL CURSOR. The page only says when the button went
//   down and up; between the two, this process reads the cursor itself, so a
//   drag never depends on the page being sent every move.
// - POINTING OPENS THE LIST, A CLICK OPENS THE APP (her ask, 2026-10-08: with
//   16 waiting she wants to go straight in, not click through the list). The
//   pointer has to rest on the tag a moment, so passing over the corner opens
//   nothing, and after a drag it has to leave and come back. The list is in
//   its own window so the tag never moves. Off both for a moment and it shuts.
// - IT SHOWS OVER FULL-SCREEN APPS, IT HIDES FOR A WHILE AND COMES BACK, it is
//   off for good only in Settings, it steps aside while she is in the app, and
//   it goes when the app's window goes.
//
// What the tag counts is not decided here. Only the page knows what the inbox
// is, so it hands over what is ready and how many are working on
// `zero:corner-tag`; shared/corner-tag.mjs puts it newest first.

import { cardPlacement, cornerPlace, heightFromDrag, EDGE_SLACK, MARGIN, hiddenUntil, keepCorner, newSince, notDismissed, readyNow, restingSpot, spotFor, tagScaleOn, tagShows, tagZoom, toneFromLuma, zoomFor, zoomStep, GRIPS, HIDE_CHOICES } from '../shared/corner-tag.mjs';

// How long the pointer may be off both the tag and its list before the list
// shuts: long enough to cross the gap between them, short enough to feel like
// it follows the pointer.
export const CLOSE_AFTER_MS = 450;
// How long the pointer rests on the tag before the list opens: long enough
// that crossing the corner on the way to something else opens nothing.
export const OPEN_AFTER_MS = 220;
// Far enough that a click with a shaky hand is still a click.
export const DRAG_FROM_PX = 6;
// How often a drag reads the cursor: once a frame.
const FRAME_MS = 16;
// A press whose release never came is let go after this long.
const PRESS_GIVES_UP_MS = 60_000;
// How often the Mac's glass is asked whether it went light or dark, while the
// tray is on screen and only then. Drag the tray from a white page onto a dark
// one and the ink follows within this.
export const TONE_EVERY_MS = 500;
// How often the page is asked to measure again while the tray is on screen.
// The glass is placed from what the page last said, and once (w-93b3a1a796)
// it was left at an old size by something that was never reproduced; this is
// the longest that can now last.
export const MEASURE_EVERY_MS = 2000;

const HIDE_LABELS = { '5m': 'Hide for 5 minutes', '30m': 'Hide for 30 minutes', today: 'Hide for the rest of today' };
const CHANNELS = [
  'zero:corner-tag', 'corner-tag:ready', 'corner-tag:size', 'corner-tag:hover', 'corner-tag:toggle',
  'corner-tag:press', 'corner-tag:release', 'corner-tag:go', 'corner-tag:hide', 'corner-tag:settings', 'corner-tag:menu',
  'corner-tag:clickable', 'corner-tag:resize', 'corner-tag:dismiss', 'corner-tag:place',
];

export function createCornerTag({
  BrowserWindow, screen, ipcMain, Menu, powerMonitor, config, saveConfig, mainWindow, load, preload,
  count = () => {}, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, mac = process.platform === 'darwin',
  // The Mac's own Liquid Glass (main/liquid-glass.mjs), or null, and then the
  // page draws a glass of its own.
  glass = null,
  // What a notification has told you about since you were last at the app,
  // [{ id, at }] (main/notify.mjs). All of it counts as new.
  told = () => [],
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
  let opening = null;
  // After a drag the pointer is still on the tag; the list waits for it to
  // leave and come back rather than opening under it.
  let settling = false;
  let gone = false;
  // The last time the app's window was in front. Only what started waiting
  // after it is counted (w-93b3a1a796).
  let lookedAt = Number(config.cornerTagLookedAt) || 0;
  // Anything handed over without the moment it started waiting is dated from
  // when this file first saw it, rather than counted new forever.
  const firstSeen = new Map();
  // Threads crossed off the tray, and when (shared/corner-tag.mjs,
  // notDismissed). Kept across a restart, forgotten once a thread leaves the list.
  let dismissed = { ...(config.cornerTagDismissed ?? {}) };
  const toldNow = () => { try { return told() ?? []; } catch { return []; } };

  const fresh = () => readyNow(notDismissed(newSince(ready, lookedAt, toldNow()), dismissed), now());
  const areas = () => screen.getAllDisplays().map((d) => d.workArea);
  const areaOf = (r) => screen.getDisplayMatching({ x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) }).workArea;
  // THE CLEAR BAND. The tag's window is the glass plus a few points of nothing
  // on every side, so the resize arrows can hang over its corners the way a
  // window's own do. Everything that places the window therefore works against
  // a screen grown by that band, which puts the GLASS where the gap from the
  // edge is measured to, and the list is placed against the glass rather than
  // the window. A click in the band is not the tag's: the page says so and the
  // window lets it through (corner-tag:clickable).
  let frame = 0;
  const framed = (a) => (frame ? { x: a.x - frame, y: a.y - frame, width: a.width + 2 * frame, height: a.height + 2 * frame } : a);
  // Where she may park it: the screen, plus the band, plus the slack that lets
  // her tuck it past the edge (shared/corner-tag.mjs, EDGE_SLACK).
  const parkable = (a) => {
    const f = framed(a);
    return { x: f.x - EDGE_SLACK, y: f.y - EDGE_SLACK, width: f.width + 2 * EDGE_SLACK, height: f.height + 2 * EDGE_SLACK };
  };
  // WHERE THE GLASS IS DRAWN INSIDE THAT WINDOW, as the page measured it. It
  // used to be worked out from the band alone, which is only the truth while
  // the window is exactly the size the page asked for — and a grip drag widens
  // the window first and lets the page catch up, so the last guess of a drag
  // can outlive it. The list then lined up with a window edge that was no
  // longer the glass's: "it is a little too far to the right... it's just the
  // right sides that seem to be improperly aligned" (2026-10-13).
  let inset = null;
  const glassOf = (r) => {
    if (inset) return { x: r.x + inset.x, y: r.y + inset.y, width: inset.width, height: inset.height };
    return frame ? { x: r.x + frame, y: r.y + frame, width: r.width - 2 * frame, height: r.height - 2 * frame } : r;
  };
  const inApp = () => {
    try { return !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused(); } catch { return false; }
  };
  const alive = (part) => !!wins[part] && !wins[part].isDestroyed();
  const rounded = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
  const send = (part, channel, payload) => { if (alive(part) && loaded[part]) wins[part].webContents.send(channel, payload); };
  // Back to 100%, then measure: a zoomed page drew the tag smaller than the
  // size it reported, and the glass stood out past it (w-93b3a1a796). Its own
  // zoom only; the app's window keeps whatever zoom it has.
  const atFull = (part) => { try { if (alive(part)) wins[part].webContents.setZoomFactor?.(1); } catch { /* measured in points anyway */ } };
  const remeasure = (part) => { atFull(part); send(part, 'corner-tag:measure'); };
  // How big the tag draws, from the width of the screen it is resting on. The
  // page multiplies everything by it, reports the size it came out, and this
  // file places that. A tag dragged to another screen is measured again there.
  // ...and how much bigger or smaller than that she has dragged it to be.
  let zoom = tagZoom(config.cornerTagZoom);
  const scaleNow = () => tagScaleOn((tag ? areaOf(tag) : areas()[0] ?? { width: 0 }).width, zoom);
  const sendState = () => {
    const shown = fresh();
    // corner: the one it rests in, so the list's Place can say "Here now".
    const corner = tag ? cornerPlace(tag, framed(areaOf(tag))).corner : 'br';
    const s = { ready: shown, before: Math.max(0, ready.length - shown.length), working, now: now(), open, scale: scaleNow(), glass: !!glass, corner };
    send('tag', 'corner-tag:state', s);
    send('card', 'corner-tag:state', s);
  };
  const shouldShow = () => tagShows({
    on: config.cornerTag, hiddenUntil: config.cornerTagHiddenUntil ?? 0, now: now(), inApp: inApp(), ready: fresh().length,
  });
  // The list may only appear beside a tag that is on screen and should be.
  // A click that was on its way while the tag hid must not open it alone.
  const tagUp = () => !gone && alive('tag') && wins.tag.isVisible() && shouldShow();

  // WHICH SCREEN IT BELONGS TO, AND WHERE ON IT. The corner it was parked in
  // and the gap from that corner are what is remembered (shared/corner-tag.mjs,
  // cornerPlace), because a point on the whole desktop stops meaning anything
  // the moment a monitor is plugged in or taken away: every screen's
  // coordinates move underneath it and the tag jumps.
  let place = config.cornerTagPlace ?? null;
  const screenFor = () => {
    const known = tag ?? (config.cornerTagSpot ? { ...config.cornerTagSpot, ...tagSize } : null);
    return known ? areaOf(known) : areas()[0];
  };
  // While a corner is held, the tag is placed from the corner opposite it
  // rather than from its own last position, so the end she is not dragging
  // does not creep across the screen as the size changes.
  const resizeTo = (size) => {
    if (!press?.grip || !tag) return;
    tagSize = { width: Math.max(1, Math.round(size.width)), height: Math.max(1, Math.round(size.height)) };
    const a = press.anchor;
    tag = {
      x: press.corner.endsWith('r') ? a.x : a.x - tagSize.width,
      y: press.corner.startsWith('b') ? a.y : a.y - tagSize.height,
      ...tagSize,
    };
    if (alive('tag')) wins.tag.setBounds(rounded(tag));
  };

  const placeTag = () => {
    const held = place ? spotFor(place, tagSize, framed(screenFor())) : null;
    // A tag that has never been put anywhere starts its margin in from the
    // screen's own edge; one she has parked may keep the slack she left it in.
    const soFar = tag ? { x: tag.x, y: tag.y } : config.cornerTagSpot ?? null;
    const spot = held ?? restingSpot(soFar, tagSize, areas().map(soFar ? parkable : framed));
    tag = { ...spot, ...tagSize };
    if (alive('tag')) wins.tag.setBounds(rounded(tag));
  };

  const placeCard = () => {
    if (!tag || !cardSize || !alive('card')) return;
    wins.card.setBounds(rounded(cardPlacement(glassOf(tag), cardSize, areaOf(tag)).card));
  };

  /* ------------------------- the Mac's own glass ------------------------- */
  // Where each page draws its glass, and how round, as it last said. The Mac's
  // glass is put exactly there, and the page draws no fill of its own.
  const shape = { tag: null, card: null };
  // Light or dark, from how bright the screen behind the tag is. The glass's
  // own light-or-dark follows the Mac's setting rather than the screen
  // (tests/the-tray-goes-light-or-dark-from-how-bright-the-screen-behind-it-is),
  // so it is only the fallback, and only a brightness reading holds the tag:
  // a tone read from the tag's appearance would read back its own hold.
  let tone = null;
  let toneFromScreen = false;
  const toneSent = { tag: null, card: null };
  let toneTimer = null;
  const shareTone = () => {
    for (const part of ['tag', 'card']) {
      if (!tone || !alive(part) || !loaded[part] || toneSent[part] === tone) continue;
      toneSent[part] = tone;
      send(part, 'corner-tag:tone', tone);
    }
  };
  const readTone = () => {
    if (!glass || !shape.tag || !alive('tag') || !wins.tag.isVisible()) return;
    let read = null;
    let fromLuma = false;
    try {
      read = toneFromLuma(glass.luma?.(wins.tag), tone);
      fromLuma = read !== null;
      // Once measured, the tag is held, and its appearance says only that.
      if (!fromLuma && toneFromScreen) return;
      read ??= glass.tone(wins.tag);
    } catch { /* no reading, keep the last */ }
    if ((read !== 'light' && read !== 'dark') || (read === tone && fromLuma === toneFromScreen)) return;
    tone = read;
    toneFromScreen = fromLuma;
    dress('tag');
    dress('card');
    shareTone();
  };
  const stopTones = () => { if (toneTimer) { clearTimer(toneTimer); toneTimer = null; } };
  const watchTones = () => {
    if (!glass || toneTimer || gone) return;
    let measuredAt = now();
    const tick = () => {
      toneTimer = null;
      if (gone || !alive('tag') || !wins.tag.isVisible()) return;
      readTone();
      if (now() - measuredAt >= MEASURE_EVERY_MS) {
        measuredAt = now();
        remeasure('tag');
      }
      toneTimer = setTimer(tick, TONE_EVERY_MS);
    };
    toneTimer = setTimer(tick, TONE_EVERY_MS);
  };
  const dress = (part) => {
    if (!glass || !shape[part] || !alive(part)) return;
    // The tag is clear glass, so a light page shows through it the way a dark
    // one does; the regular glass frosts over light pages. The list keeps the
    // regular glass, because it is read.
    const opts = part === 'tag' ? { radius: shape.tag.radius, style: 'clear', ...(toneFromScreen ? { tone } : {}) }
      : tone ? { radius: shape.card.radius, tone } : { radius: shape.card.radius };
    try { glass.set(wins[part], shape[part].rect, opts); } catch { return; }
    if (part === 'tag') { readTone(); watchTones(); }
  };

  const make = (part) => {
    const win = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      // Clear and unrounded: the page draws the glass and its small corners.
      // The system's frosted material would blur what is behind, but it comes
      // only with the system's own rounder corners or square ones, and the
      // approved tag has neither.
      roundedCorners: false,
      hasShadow: false,
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
    win.webContents.on('did-finish-load', () => atFull(part));
    // A reload starts the handshake again: the window goes, anything half
    // done with it is let go, and until the page says it is ready nothing is
    // sent to it and it is not shown. The first load is not a reload.
    win.webContents.on('did-start-loading', () => {
      if (!loaded[part]) return;
      loaded[part] = false;
      hovered[part] = false;
      toneSent[part] = null;
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
    // The list goes back to its threads, so it never reopens on the corners.
    send('card', 'corner-tag:open', false);
  }

  const showCard = () => {
    if (open && tagUp() && loaded.card && cardSize && alive('card') && !wins.card.isVisible()) {
      wins.card.showInactive();
      remeasure('card');
      readTone();
    }
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

  const cancelOpen = () => { if (opening) { clearTimer(opening); opening = null; } };

  // The pointer came onto the tag: open the list if it is still there in a
  // moment. The real cursor has the last word, as it does for shutting.
  function meanToOpen() {
    if (open || opening || settling || press) return;
    opening = setTimer(() => {
      opening = null;
      readCursor();
      if (hovered.tag && !settling && !press) openCard();
    }, OPEN_AFTER_MS);
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
      cancelOpen();
      settling = true;
      closeCard();
      send('tag', 'corner-tag:dragging', true);
    }
    // THE GRIP: the cursor sets the height, the page redraws everything from
    // it, and what is remembered is how much bigger or smaller than this
    // screen's automatic size that is.
    if (press.grip) {
      if (!press.moved) return;
      const want = zoomFor(heightFromDrag(press.corner, press.fromHeight, dx, dy), areaOf(tag).width);
      if (want === zoom) return;
      const grew = want > zoom;
      zoom = want;
      sendState();
      // THE WINDOW GROWS BEFORE THE PAGE DOES, never after. The page redraws
      // at the new size and then reports it, a frame later; until that report
      // the window is still the old rectangle, and a tag drawn larger than its
      // window is a tag with its corners cut off, which is what she saw. So a
      // growing drag widens the window on this side of the message straight
      // away, by the same proportion, and the page's own measurement corrects
      // it a frame later. Shrinking waits for the page: a window smaller than
      // what is drawn in it clips, a window larger than it never does.
      if (grew) {
        // The glass the page is about to draw is the scale it was just handed
        // (28 points times it), and everything in it grows together, so the
        // width goes up by the same proportion until the page says otherwise.
        // The window is that glass plus the band on every side.
        const was = { w: Math.max(1, tagSize.width - 2 * frame), h: Math.max(1, tagSize.height - 2 * frame) };
        const h = Math.ceil(28 * scaleNow());
        resizeTo({ width: Math.ceil(was.w * h / was.h) + 2 * frame, height: h + 2 * frame });
      }
      return;
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
    if (p.grip) {
      // The pointer is still on the tag, so the list waits for it to leave and
      // come back, exactly as it does after a move. A press on a grip that
      // never moved is not a click either: it does not open the app.
      send('tag', 'corner-tag:dragging', false);
      if (!p.moved) return;
      // It has been dragged into a corner of its screen; let it settle back
      // against the edge it is parked at, and remember where that is.
      tag = { ...restingSpot({ x: tag.x, y: tag.y }, tagSize, areas().map(parkable)), ...tagSize };
      if (alive('tag')) wins.tag.setBounds(rounded(tag));
      place = cornerPlace(tag, framed(areaOf(tag)));
      saveConfig(config, { cornerTagZoom: zoom, cornerTagSpot: { x: Math.round(tag.x), y: Math.round(tag.y) }, cornerTagPlace: place });
      if (open) placeCard();
      return;
    }
    if (p.moved) {
      tag = { ...restingSpot({ x: tag.x, y: tag.y }, tagSize, areas().map(parkable)), ...tagSize };
      if (alive('tag')) wins.tag.setBounds(rounded(tag));
      // Where she left it, said as a corner and a gap so it means the same
      // thing on whatever screen it is on next.
      place = cornerPlace(tag, framed(areaOf(tag)));
      saveConfig(config, { cornerTagSpot: { x: Math.round(tag.x), y: Math.round(tag.y) }, cornerTagPlace: place });
      send('tag', 'corner-tag:dragging', false);
      // Dragged onto another screen, it draws at that screen's size.
      sendState();
    } else if (!cancelled) {
      cancelOpen();
      goTo(null);
    }
  }

  // Everything that is not on screen is back where it starts: the list shut,
  // no press half-done, so the tag comes back exactly as it was first drawn.
  const reset = () => {
    endPress(true);
    cancelOpen();
    settling = false;
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
      stopTones();
      if (alive('tag') && wins.tag.isVisible()) { wins.tag.hide(); reset(); }
      else if (open) closeCard();
      return;
    }
    if (!alive('tag')) { make('tag'); return; }
    sendState();
    if (loaded.tag && !wins.tag.isVisible()) {
      wins.tag.showInactive();
      // A page that redrew while hidden may never have said its new size, and
      // the glass only moves when it does.
      remeasure('tag');
      readTone();
      watchTones();
    }
  }

  const bringAppForward = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return true;
  };

  // Into the app: on a thread when a line of the list was picked, or just the
  // app as it is when it was the tag.
  function goTo(id) {
    closeCard();
    if (!bringAppForward()) return;
    if (typeof id === 'string' && id) mainWindow.webContents.send('zero:open-item', { id });
  }

  const hide = (choice) => {
    const until = hiddenUntil(choice, now());
    if (!until) return;
    saveConfig(config, { cornerTagHiddenUntil: until });
    count('tag_hidden', { seconds: Math.round((until - now()) / 1000) });
    refresh();
  };

  const openSettings = () => {
    closeCard();
    if (bringAppForward()) mainWindow.webContents.send('zero:open-settings', { pane: 'general' });
  };

  const partOf = (p) => (p?.part === 'card' ? 'card' : 'tag');

  /* ------------------------------ from the app's page ---------------------- */
  ipcMain.handle('zero:corner-tag', (_e, state) => {
    const given = Array.isArray(state?.ready) ? state.ready : [];
    const ids = new Set(given.map((r) => r.id));
    for (const id of firstSeen.keys()) if (!ids.has(id)) firstSeen.delete(id);
    ready = given.map((r) => {
      if (Number.isFinite(r.since)) return r;
      if (!firstSeen.has(r.id)) firstSeen.set(r.id, now());
      return { ...r, since: firstSeen.get(r.id) };
    });
    working = Number.isFinite(state?.working) ? state.working : 0;
    const kept = Object.fromEntries(Object.entries(dismissed).filter(([id]) => ids.has(id)));
    if (Object.keys(kept).length !== Object.keys(dismissed).length) {
      dismissed = kept;
      try { saveConfig(config, { cornerTagDismissed: dismissed }); } catch { /* kept for this run only */ }
    }
    refresh();
    return null;
  });

  /* ------------------------------ from the tag's pages --------------------- */
  ipcMain.handle('corner-tag:ready', (_e, p) => {
    const part = partOf(p);
    loaded[part] = true;
    sendState();
    shareTone();
    if (part === 'tag') refresh();
    else if (open) { placeCard(); showCard(); }
    return null;
  });

  ipcMain.handle('corner-tag:size', (_e, p) => {
    if (!p || !(p.width > 0) || !(p.height > 0)) return null;
    const size = { width: Math.ceil(p.width), height: Math.ceil(p.height) };
    const radius = (rect) => (Number.isFinite(p.radius) && p.radius >= 0 ? p.radius : rect.height / 2);
    if (partOf(p) === 'card') {
      cardSize = size;
      const rect = { x: 0, y: 0, ...size };
      shape.card = { rect, radius: radius(rect) };
      dress('card');
      if (open) { placeCard(); showCard(); }
      return null;
    }
    if (p.glass && Number.isFinite(p.glass.x) && p.glass.width > 0) {
      inset = {
        x: Math.max(0, Math.round(p.glass.x)), y: Math.max(0, Math.round(p.glass.y)),
        width: Math.round(p.glass.width), height: Math.round(p.glass.height),
      };
      frame = inset.x;
    } else {
      // Never the last rectangle: it belongs to a size the tag no longer is.
      inset = null;
    }
    const rect = inset ?? glassOf({ x: 0, y: 0, ...size });
    shape.tag = { rect, radius: radius(rect) };
    dress('tag');
    // Mid-resize the page's own measurement is the truth: it places the tag
    // from the corner she is not holding.
    if (press?.grip) { resizeTo(size); if (open) placeCard(); return null; }
    tagSize = size;
    // Nothing moves under the pointer while it is dragging.
    if (press?.moved) return null;
    // The first measure places it where she left it. Every one after keeps
    // the edge nearest its corner still as the words change length.
    tag = tag && measured ? keepCorner(tag, tagSize, framed(areaOf(tag))) : null;
    measured = true;
    placeTag();
    if (open) placeCard();
    return null;
  });

  ipcMain.handle('corner-tag:hover', (_e, p) => {
    const part = partOf(p);
    hovered[part] = !!p?.inside;
    if (part === 'tag') {
      if (p?.inside) meanToOpen();
      else { settling = false; cancelOpen(); }
    }
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
    const corner = GRIPS.includes(at?.corner) ? at.corner : 'br';
    press = {
      start: pt, from: { x: tag.x, y: tag.y }, moved: false, at: now(), timer: null,
      // A press on a grip resizes instead of moving: the corner she has hold
      // of follows the cursor, and the one opposite it stays exactly where it
      // is, the way a window resizes.
      // THE GLASS, NOT THE WINDOW. The window is the glass plus the band on
      // every side; measuring the window here asked for the band's height
      // again on the first pull of the cursor, and the tag leapt (she met it
      // in the running app: "it jumps to about three times its size").
      grip: !!at?.grip, corner, fromHeight: Math.max(1, tagSize.height - 2 * frame),
      anchor: {
        x: corner.endsWith('r') ? tag.x : tag.x + tag.width,
        y: corner.startsWith('b') ? tag.y : tag.y + tag.height,
      },
    };
    press.timer = setTimer(step, FRAME_MS);
    return null;
  });
  ipcMain.handle('corner-tag:release', (_e, p) => { endPress(!!p?.cancelled); return null; });

  ipcMain.handle('corner-tag:go', (_e, id) => { goTo(id); return null; });
  // The X on a line of the list: off the tray, and only the tray.
  ipcMain.handle('corner-tag:dismiss', (_e, id) => {
    if (typeof id !== 'string' || !fresh().some((r) => r.id === id)) return null;
    dismissed = { ...dismissed, [id]: now() };
    try { saveConfig(config, { cornerTagDismissed: dismissed }); } catch { /* kept for this run only */ }
    refresh();
    return null;
  });
  ipcMain.handle('corner-tag:hide', (_e, choice) => { hide(choice); return null; });
  ipcMain.handle('corner-tag:settings', () => { openSettings(); return null; });

  // A right-click on the tag offers the same choices as the list does.
  // One place sets the size, whether it came from the grip or from the menu:
  // the page is told, it redraws and reports what it came out, and that is
  // what gets placed.
  const setZoom = (next) => {
    zoom = tagZoom(next);
    saveConfig(config, { cornerTagZoom: zoom });
    sendState();
  };

  // WHAT IS UNDER THE POINTER IN THE CLEAR BAND IS NOT THE TAG. The window is
  // bigger than the glass now, so every click in that band would otherwise be
  // swallowed by a transparent window floating over somebody's work — the
  // exact fault that took the first drawn shadow out. The page watches the
  // pointer (it keeps getting moves either way, because the window forwards
  // them) and says when the thing under it is the glass or one of its corner
  // arrows; the rest of the time the click goes straight through.
  //
  // It is never switched while a press is live: a press that began on the tag
  // ends on the tag, wherever the cursor has got to.
  let clickable = null;
  const letClicksThrough = (on) => {
    if (!alive('tag') || press) return;
    if (clickable === on) return;
    clickable = on;
    try { wins.tag.setIgnoreMouseEvents?.(!on, { forward: true }); } catch { /* an older Electron: the band stays clickable */ }
  };
  ipcMain.handle('corner-tag:clickable', (_e, p) => { letClicksThrough(!!p?.on); return null; });

  // A notch bigger or smaller, from the list's foot. The list stays open and
  // is placed again as the tag changes size, because the whole point of
  // sizing it from there is watching the tag while you do it.
  ipcMain.handle('corner-tag:resize', (_e, p) => {
    const by = Number(p?.by) < 0 ? -1 : 1;
    setZoom(zoomStep(zoom, by));
    return null;
  });

  // A corner picked from the list's Place: the usual gap in, on the screen
  // it is on now, remembered the way a drag is. The list shuts because it
  // was left behind in the old corner.
  ipcMain.handle('corner-tag:place', (_e, corner) => {
    if (!GRIPS.includes(corner) || !tag || press) return null;
    place = { corner, dx: MARGIN, dy: MARGIN };
    placeTag();
    saveConfig(config, { cornerTagSpot: { x: Math.round(tag.x), y: Math.round(tag.y) }, cornerTagPlace: place });
    closeCard();
    sendState();
    return null;
  });

  ipcMain.handle('corner-tag:menu', () => {
    if (!alive('tag')) return null;
    closeCard();
    Menu.buildFromTemplate([
      // Dragging the grip is the way most people will find; this is the way
      // somebody looks second, and the only way back to the automatic size.
      { label: 'Bigger', click: () => setZoom(zoomStep(zoom, 1)) },
      { label: 'Smaller', click: () => setZoom(zoomStep(zoom, -1)) },
      { label: 'Size for this screen', enabled: zoom !== 1, click: () => setZoom(1) },
      { type: 'separator' },
      ...HIDE_CHOICES.map((c) => ({ label: HIDE_LABELS[c.key], click: () => hide(c.key) })),
      { type: 'separator' },
      { label: 'Turn off in Settings…', click: openSettings },
    ]).popup({ window: wins.tag });
    return null;
  });

  /* ------------------------------ from the system -------------------------- */
  // A screen that comes, goes or changes shape: the list shuts and the tag is
  // pulled back onto a screen if it was left hanging off one.
  // A monitor plugged in or taken away: back to the corner it was parked in,
  // the same gap in, on whichever screen now holds it. It used to be clamped
  // from its old desktop point, which is what made it jump.
  const reseat = () => {
    if (gone) return;
    closeCard();
    if (!tag || press) return;
    placeTag();
    sendState();
  };
  // After sleep the screens may have changed and a hide may have run out.
  const woke = () => { reseat(); refresh(); };

  // Being in the app is looking at everything it holds. The moment you leave
  // is kept, so a restart does not count it all again.
  const onFocus = () => { lookedAt = now(); refresh(); };
  const onBlur = () => {
    lookedAt = now();
    try { saveConfig(config, { cornerTagLookedAt: lookedAt }); } catch { /* kept for this run only */ }
    refresh();
  };
  // The app's window is gone, and the tag goes with it. Left behind, it would
  // hold the app open with nothing behind it and nothing it could open.
  const dispose = () => {
    if (gone) return;
    gone = true;
    endPress(true);
    cancelClose();
    if (wake) { clearTimer(wake); wake = null; }
    if (watching) { clearTimer(watching); watching = null; }
    stopTones();
    cancelOpen();
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
    mainWindow.on('blur', onBlur);
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
