// WHAT A PHONE NEEDS FROM THE PAGE THAT A WINDOW NEVER DID (2026-10-11, the
// first try on a real iPhone). Three things, all only on the phone door
// (browser-bridge.ts sets data-door="phone"):
//
// - BACK. Opening a thread is a step in the browser's history, so Safari's own
//   swipe from the left edge closes it, and on the home-screen app, which has
//   no such swipe, a swipe from the left edge does the same.
// - THE KEYBOARD. An iPhone's keyboard shrinks the visual viewport and leaves
//   the page as tall as it was, so the reply box at its foot sat under the
//   keyboard. The page is held to the visual viewport's height (--vvh) and the
//   new-thread page stops where the keyboard starts (--kb).
// - THE EDGES. Safari paints its status bar and toolbar in the page's theme
//   colour; the page now tells it the colour it is actually drawn in.
import { useEffect, useRef } from 'react';

export const onPhone = () => typeof document !== 'undefined' && document.documentElement.dataset.door === 'phone';
// The phone with the Mac shut, which reads her rows online rather than her
// Mac (cloud-bridge.ts): what she sends waits there for her Mac.
export const onCloudPhone = () => typeof document !== 'undefined' && document.documentElement.dataset.via === 'cloud';

type HistoryLike = { readonly state: unknown; pushState(state: unknown, title: string): void; replaceState(state: unknown, title: string): void; back(): void };
type WindowLike = {
  history: HistoryLike;
  addEventListener(name: 'popstate', fn: (e: { state: unknown }) => void): void;
  removeEventListener(name: 'popstate', fn: (e: { state: unknown }) => void): void;
};

const MARK = 'agentbox-thread';
const FLOOR = 'agentbox-floor';
const INBOX = 'agentbox-inbox';
const marked = (state: unknown, mark: string) => !!(state as Record<string, unknown> | null)?.[mark];

/**
 * One step in the history while a thread is open. `sync(open)` follows the
 * screen; a back that lands off our step closes the thread; closing it on the
 * screen takes our step away, and that back closes nothing a second time.
 */
export function createPhoneBack(win: WindowLike, close: () => void) {
  let pushed = false;
  // A back WE asked for, still on its way. A browser's back arrives later; a
  // thread opened in between must not be closed by it.
  let ours = false;
  const onPop = () => {
    if (ours) { ours = false; return; }
    if (!pushed) return;
    pushed = false;
    close();
  };
  win.addEventListener('popstate', onPop);
  return {
    sync(open: boolean) {
      if (open && !pushed) {
        win.history.pushState({ [MARK]: true }, '');
        pushed = true;
      } else if (!open && pushed) {
        pushed = false;
        if (marked(win.history.state, MARK)) { ours = true; win.history.back(); }
      }
    },
    stop() { win.removeEventListener('popstate', onPop); },
  };
}

/**
 * A FLOOR UNDER THE INBOX, on the home-screen app (2026-10-13). Behind the
 * app's first screen is the empty page iOS opened it from, and a back onto it
 * leaves a white page with no way back but closing the app. So the first
 * screen becomes a floor with the inbox one step above it; a back from the
 * inbox lands on the floor and is put straight back. Safe to call again after
 * a reload: an entry already marked is left as it is.
 */
export function holdTheFloor(win: WindowLike) {
  const state = win.history.state;
  if (marked(state, FLOOR)) win.history.pushState({ [INBOX]: true }, '');
  else if (!marked(state, INBOX) && !marked(state, MARK)) {
    win.history.replaceState({ [FLOOR]: true }, '');
    win.history.pushState({ [INBOX]: true }, '');
  }
  const onPop = (e: { state: unknown }) => {
    if (marked(e.state, FLOOR)) win.history.pushState({ [INBOX]: true }, '');
  };
  win.addEventListener('popstate', onPop);
  return () => win.removeEventListener('popstate', onPop);
}

/** May the home-screen swipe go back? Only over a thread's own step; any other back leaves the app. */
export const swipeMayGoBack = (state: unknown) => marked(state, MARK);

/** The thread open on the screen as a step in the history, on a phone only. */
export function usePhoneBack(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const back = useRef<ReturnType<typeof createPhoneBack> | null>(null);
  useEffect(() => {
    if (!onPhone()) return undefined;
    back.current = createPhoneBack(window, () => closeRef.current());
    return () => { back.current?.stop(); back.current = null; };
  }, []);
  useEffect(() => { back.current?.sync(open); }, [open]);
}

/** Does a touch that began at `startX` and moved (dx, dy) mean "go back"? */
export function edgeSwipeGoesBack({ startX, dx, dy, width }: { startX: number; dx: number; dy: number; width: number }) {
  if (startX > 24) return false;
  if (dx < Math.max(100, width * 0.28)) return false;
  return Math.abs(dy) < dx * 0.6;
}

/** How much of the bottom of the page the keyboard is covering. */
export function keyboardInset({ innerHeight, height, offsetTop }: { innerHeight: number; height: number; offsetTop: number }) {
  return Math.max(0, Math.round(innerHeight - height - offsetTop));
}

const parse = (c: string): [number, number, number, number] | null => {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/.exec(c ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
};
const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/** The colour the page is drawn in: the pane's wash laid over the base. */
export function groundColour(base: string, wash: string) {
  const b = parse(base);
  if (!b) return '#1e1b1a';
  const w = parse(wash);
  const a = w ? w[3] : 0;
  const mix = (i: number) => b[i] * (1 - a) + (w ? w[i] * a : 0);
  return `#${hex(mix(0))}${hex(mix(1))}${hex(mix(2))}`;
}

/* ------------------------------------------------------------ pictures */

// A PICTURE ON A PHONE PINCHES, PANS AND DOUBLE TAPS ("it's hard to view
// images like PNG's ... I can't zoom in on them", 2026-10-12). The picture
// view fits it to the screen, and nothing enlarged it.
const MAX_ZOOM = 6;

/** The scale two fingers ask for, from where the pinch began. */
export function pinchScale(start: { distance: number; scale: number }, distance: number) {
  if (!(start.distance > 0)) return start.scale;
  return Math.min(MAX_ZOOM, Math.max(1, start.scale * (distance / start.distance)));
}

/** A double tap: enlarged when fitted, fitted when enlarged at all. */
export function doubleTapScale(scale: number) {
  return scale > 1.01 ? 1 : 2.5;
}

/** How far the picture may move each way: as far as its enlargement reaches. */
export function panLimit(size: number, scale: number) {
  return Math.max(0, (size * scale - size) / 2);
}

/** Zoom for the picture view (.doc-picture), by touch. */
export function installPictureZoom() {
  let img: HTMLElement | null = null;
  let scale = 1;
  let x = 0;
  let y = 0;
  let pinch: { distance: number; scale: number } | null = null;
  let drag: { px: number; py: number; x: number; y: number } | null = null;
  let lastTap = 0;
  const gap = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const clampAndApply = () => {
    if (!img) return;
    const lx = panLimit(img.clientWidth, scale);
    const ly = panLimit(img.clientHeight, scale);
    x = Math.max(-lx, Math.min(lx, x));
    y = Math.max(-ly, Math.min(ly, y));
    img.style.transform = scale === 1 ? '' : `translate(${x}px, ${y}px) scale(${scale})`;
  };
  addEventListener('touchstart', (e) => {
    const hit = (e.target as Element | null)?.closest?.('.doc-picture') as HTMLElement | null;
    if (!hit) return;
    if (hit !== img) { img = hit; scale = 1; x = 0; y = 0; }
    if (e.touches.length === 2) {
      pinch = { distance: gap(e.touches), scale };
      drag = null;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap < 300) {
        scale = doubleTapScale(scale);
        x = 0;
        y = 0;
        clampAndApply();
        lastTap = 0;
        e.preventDefault();
        return;
      }
      lastTap = now;
      drag = { px: e.touches[0].clientX, py: e.touches[0].clientY, x, y };
    }
  }, { passive: false });
  addEventListener('touchmove', (e) => {
    if (!img || !(e.target as Element | null)?.closest?.('.doc-picture')) return;
    if (pinch && e.touches.length === 2) {
      scale = pinchScale(pinch, gap(e.touches));
      clampAndApply();
      e.preventDefault();
    } else if (drag && e.touches.length === 1 && scale > 1) {
      x = drag.x + (e.touches[0].clientX - drag.px);
      y = drag.y + (e.touches[0].clientY - drag.py);
      clampAndApply();
      e.preventDefault();
    }
  }, { passive: false });
  addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinch = null;
    if (e.touches.length === 0) drag = null;
    if (scale <= 1.01) { scale = 1; x = 0; y = 0; clampAndApply(); }
  });
}

/** Keyboard, edge colour and the home-screen swipe. Called once by the bridge. */
export function installPhoneScreen() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    const kb = keyboardInset({ innerHeight: window.innerHeight, height: vv.height, offsetTop: vv.offsetTop });
    root.style.setProperty('--kb', `${kb}px`);
    // WHERE what shows begins, as well as how tall it is. iOS scrolls the
    // window to keep the caret in view as one types, which slid the page up
    // and left a band under the reply box that grew with each line
    // (2026-10-12). The page is pinned there (phone.css, `:root body`).
    root.style.setProperty('--vvtop', `${Math.round(vv.offsetTop)}px`);
    // The home bar's room is under the keyboard while it is up.
    if (kb > 80) root.dataset.keyboard = 'up'; else delete root.dataset.keyboard;
  };
  fit();
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  installPictureZoom();

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  const paint = () => {
    const layout = document.querySelector('.workspace-layout');
    const base = getComputedStyle(document.body).backgroundColor;
    const wash = layout ? getComputedStyle(layout, '::before').backgroundColor : '';
    meta!.content = groundColour(base, wash);
  };
  paint();
  // The look can change.
  new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-skin', 'class', 'style'] });
  // AND THE INBOX IS DRAWN AFTER THIS RUNS, however long that takes. Two
  // timers of 0.5 and 2 seconds were not enough through the relay, where the
  // page comes from the computer: the colour behind the clock stayed the
  // first guess (2026-10-12). So it is set again when the layout appears.
  const drawn = new MutationObserver(() => {
    if (!document.querySelector('.workspace-layout')) return;
    drawn.disconnect();
    paint();
  });
  drawn.observe(document.body, { childList: true, subtree: true });

  // THE HOME-SCREEN APP HAS NO SWIPE BACK OF ITS OWN; Safari does, so this
  // only listens where Safari's would not fire.
  // iPhone's own flag for the home-screen app, as phone-alerts.ts reads it.
  // Not a media query: nothing in the window reads the machine that way
  // (tests/theme-choice.test.mjs). Android's back gesture is the system's and
  // already lands on the history step above, so it needs nothing from here.
  const standalone = (navigator as { standalone?: boolean }).standalone === true;
  if (!standalone) return;
  holdTheFloor(window);
  let start: { x: number; y: number } | null = null;
  let pane: HTMLElement | null = null;
  addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    pane = document.querySelector('.focus-pane');
    start = t && t.clientX <= 24 && pane ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!start || !t || !pane) return;
    const dx = Math.max(0, t.clientX - start.x);
    pane.style.transform = `translateX(${dx}px)`;
    pane.style.transition = 'none';
  }, { passive: true });
  addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (!start || !t || !pane) return;
    const go = edgeSwipeGoesBack({ startX: start.x, dx: t.clientX - start.x, dy: t.clientY - start.y, width: innerWidth });
    const el = pane;
    el.style.transition = 'transform .18s ease';
    el.style.transform = go ? `translateX(${innerWidth}px)` : '';
    setTimeout(() => {
      if (go && swipeMayGoBack(history.state)) history.back();
      el.style.transform = '';
      el.style.transition = '';
    }, go ? 170 : 200);
    start = null;
    pane = null;
  });
}
