// WHAT AN OPENED THREAD LAID OUT, a moment after it opened, for the app to check
// it painted (main/blank-page.mts, tests/a-thread-page-that-draws-nothing-is-recorded).
const WAIT_MS = 1500;
const TEXT_CAP = 12;

type Rect = { x: number; y: number; width: number; height: number };

/** The text inside the thread page that sits in the window, and one line of it to photograph. */
export function paneFacts(doc: Document, win: Window) {
  const pane = doc.querySelector<HTMLElement>('.focus-pane');
  const dock = doc.querySelector<HTMLElement>('.focus-dock');
  const scroll = doc.querySelector<HTMLElement>('.focus-scroll');
  const listPane = doc.querySelector<HTMLElement>('.list-pane');
  const app = doc.querySelector<HTMLElement>('.app');
  const inWindow = (r: DOMRect) => r.width >= 4 && r.height >= 4 && r.bottom > 0 && r.right > 0 && r.top < win.innerHeight && r.left < win.innerWidth;
  let text = 0;
  let strip: Rect | null = null;
  if (pane) {
    const walk = doc.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();
    for (let n = walk.nextNode(); n && text < TEXT_CAP; n = walk.nextNode()) {
      // Text a style hides on purpose is not a window failing to paint it.
      if (!n.nodeValue?.trim() || (n.parentElement && win.getComputedStyle(n.parentElement).visibility !== 'visible')) continue;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (!inWindow(r)) continue;
      text++;
      strip ??= { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, 600), height: Math.min(r.height, 60) };
    }
  }
  const box = (el: HTMLElement | null) => (el ? (({ x, y, width, height }) => [x, y, width, height].map(Math.round))(el.getBoundingClientRect()) : null);
  return {
    text,
    dock: !!dock && inWindow(dock.getBoundingClientRect()) && win.getComputedStyle(dock).visibility !== 'hidden',
    strip,
    pane: box(pane),
    listPane: listPane ? win.getComputedStyle(listPane).display : null,
    layout: app?.dataset.artifactLayout ?? null,
    appClass: app?.className ?? null,
    scrollTop: scroll ? Math.round(scroll.scrollTop) : null,
    scrollHeight: scroll?.scrollHeight ?? null,
  };
}

/** Checks the thread page once, a moment after it opens. Returns the way to call it off. */
export function watchForBlank(thread: string): () => void {
  const send = window.zero?.blankCheck;
  if (!send) return () => {};
  let longTaskMs = 0;
  let watch: PerformanceObserver | null = null;
  try {
    watch = new PerformanceObserver((list) => { for (const e of list.getEntries()) longTaskMs += e.duration; });
    watch.observe({ type: 'longtask' });
  } catch { watch = null; }
  const due = Date.now() + WAIT_MS;
  const timer = setTimeout(() => {
    watch?.disconnect();
    // A window behind others is not painted by design.
    if (document.visibilityState !== 'visible') return;
    void send({ thread, facts: paneFacts(document, window), lateMs: Date.now() - due, longTaskMs: Math.round(longTaskMs) }).catch(() => {});
  }, WAIT_MS);
  return () => { clearTimeout(timer); watch?.disconnect(); };
}
