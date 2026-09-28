// LANDING AT THE BOTTOM AND STAYING THERE —, hers, 2026-08-20, and, hers,
// 2026-08-23.
//
// WHAT WAS WRONG THE FIRST TIME, MEASURED. The thread landed by calling
// `scrollIntoView({ block: 'end' })` on an empty div at the end of the
// messages, and that is short twice over:
//
//   1. THE FOOT IS NOT THE BOTTOM. Below the thread, inside the same scrolling
//      box, sit the files this row named and the row's own buttons. Aligning
//      the foot with the bottom edge therefore leaves everything under it out
//      of sight: 120px on every one of her seven live sessions, measured
//      2026-08-20 in the built renderer over her real transcripts
//      (`scripts/measure-thread-open.mjs`). Her footer was never on screen.
//
//   2. THE PAGE IS STILL GROWING WHEN THE SCROLL FIRES. A message with a
//      document preview under it is an iframe with no height until it loads,
//      and a picture has none until it decodes; both happen after React has
//      finished. On one thread carrying two previews,
//      the page grew 1,593px AFTER the landing and it came to rest 1,713px
//      short of the end.
//
// So landing became a HOLD: go to the true bottom of the scrolling box, and go
// there again every time the content changes height. That was right, and it is
// still what this does.
//
// WHAT WAS WRONG THE SECOND TIME, ALSO MEASURED. The hold ended on a TIMER —
// 2.5 seconds — and a conversation does not stop growing on a timer. Two
// numbers off her own machine, 2026-08-23:
//
//   HER WINDOW, CAUGHT IN THE ACT. A recorder installed in the window she was
//   working in caught three of her own clicks at 01:37:32, :39 and :43. On the
//   last one the pane sat at scrollTop 1901 against a scrollHeight of 3099 in a
//   897px viewport, from 53ms to 7850ms without moving once: 301px of the
//   conversation below the fold, for as long as she looked at it. 2798 - 897 is
//   1901 exactly, so the pin ran against a page 301px shorter than the one she
//   was left reading, and nothing ever pinned again.
//
//   THE HOLD'S REAL LIFETIME. `scripts/measure-how-long-the-hold-lives.mjs`
//   grows a real row's thread by 301px at a known moment after the click and
//   reads where the box goes. Growth at 150, 400, 1000, 2000, 2400 and 2600ms
//   was followed to the bottom. Growth at 3500 and 5000ms was not: the box
//   stayed put and left 323px under the fold. A task with a worker on it grows
//   for as long as the worker works, which is minutes, not 2.5 seconds.
//
// SO THE TIMER IS GONE, and what replaces it is the rule every chat app
// actually uses: STICK TO THE BOTTOM WHILE SHE IS AT THE BOTTOM. The box is
// pinned on every change of the content's height and every change of its own,
// for as long as it is resting at the end. The moment she scrolls up it stops,
// because a page that yanks itself down while she reads back is the same bug
// with the opposite symptom. If she scrolls back to the end it sticks again,
// which is what "open a chat in any other app" means and what a timer could
// never do.
//
// Nothing here polls forever. The only lasting machinery is a ResizeObserver
// and a scroll listener, both of which fire when something actually happens.
//
// INSTANTLY, NEVER SMOOTHLY. "Nothing animates" is the first line of what she
// has told us not to put back (decisions.md, 2026-08-19), so this writes
// `scrollTop` rather than asking for a behaviour.

/**
 * HOW LONG A RESTORE MAY KEEP REACHING FOR ITS PLACE.
 *
 * Sticking to the bottom needs no ceiling: the bottom always exists, so a stick
 * that never expires is always right. A RESTORE is the opposite case and is the
 * one place a window is honest. It is aiming at a number the page may never be
 * tall enough to reach — a run trimmed out of the middle, a document that no
 * longer previews — and reaching for a place that cannot exist forever would
 * hold her at a scroll position she cannot leave.
 *
 * 2.5s is far past every conversation read this machine has measured (the
 * longest was 508ms) and it ends the moment she touches the page.
 */
export const RESUME_WINDOW_MS = 2500;

/**
 * THE EVENTS A PERSON MAKES. A reflow, a picture decoding and a worker writing
 * another line make none of them, which is the whole point of reading these
 * rather than reading the scroll position.
 */
export const HER_GESTURES = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

/**
 * HOW LONG ONE GESTURE OF HERS OWNS THE SCROLLING IT CAUSES.
 *
 * A gesture and the scroll events it produces are not the same event, and they
 * do not arrive together: a wheel notch scrolls over several frames, a scrollbar
 * drag is one mousedown and then a run of scroll events with no further gesture
 * at all, and momentum on a trackpad keeps going after her fingers have left it.
 * So a scroll counts as hers if a gesture of hers came shortly before it.
 *
 * MEASURED in the built renderer on a real task, 2026-08-25
 * (`scripts/measure-how-long-her-hand-lasts.mjs`), recording every gesture and
 * every scroll on the pane:
 *
 *   six wheel notches            6 scrolls, widest gap   0ms
 *   one continuous gesture      91 scrolls, widest gap   1ms
 *   four presses of page down    9 scrolls, widest gap 159ms
 *
 * 159ms is the keyboard's own smooth scroll still running after the key came
 * up. 700ms is comfortably past it and far short of anything she would still be
 * reading through.
 *
 * TWO THINGS THAT RUN WERE NOT MEASURED, and neither should be read as if they
 * were. A scrollbar DRAG produced no scrolling at all, because this pane's
 * scrollbar measured 0px wide — they are overlay scrollbars and there is nothing
 * to take hold of. And headless Chrome has no trackpad, so macOS momentum is
 * absent; on a real Mac the wheel events keep arriving through the glide and
 * each one re-arms this window, but that is reasoning, not a reading.
 */
export const HER_HAND_MS = 700;

/**
 * THE THINGS A PLACE ON THE PAGE IS HELD BY. Paragraphs, headings, list items,
 * pictures and frames: the pieces she reads, in the order she reads them.
 */
const READ_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, tr, img, iframe';

/** Which piece of the page sits at the top of the box, and how far down it sits. */
export type Place = { node: Element; offset: number };

/**
 * WHERE SHE IS READING, AS A THING ON THE PAGE RATHER THAN A NUMBER. A
 * scrollTop means nothing once the page re-wraps; the paragraph at the top of
 * the box still does. Null when the box has no DOM to read, as in a test fake.
 */
export function placeIn(el: HTMLElement): Place | null {
  if (typeof el.querySelectorAll !== 'function' || typeof el.getBoundingClientRect !== 'function') return null;
  const top = el.getBoundingClientRect().top;
  const blocks = el.querySelectorAll(READ_BLOCKS);
  // In page order, so the first one whose bottom is below the top edge is found
  // by halving rather than by measuring every paragraph on every scroll.
  let lo = 0, hi = blocks.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (blocks[mid].getBoundingClientRect().bottom > top) { found = mid; hi = mid - 1; } else lo = mid + 1;
  }
  if (found < 0) return null;
  const node = blocks[found];
  return { node, offset: node.getBoundingClientRect().top - top };
}

/**
 * PUT THAT PIECE BACK WHERE IT WAS. Returns false when it is no longer on the
 * page, so the caller can fall back on something rougher.
 */
export function returnTo(el: HTMLElement, place: Place): boolean {
  if (!place.node.isConnected || !el.contains(place.node)) return false;
  const now = place.node.getBoundingClientRect().top - el.getBoundingClientRect().top;
  const want = Math.max(0, Math.min(bottomOf(el), Math.round(el.scrollTop + now - place.offset)));
  if (Math.round(el.scrollTop) !== want) el.scrollTop = want;
  return true;
}

/** How wide the words in the box are laid out, or -1 when there is no layout. */
function widthOf(el: HTMLElement): number {
  const w = el.clientWidth;
  const inner = (el.firstElementChild as HTMLElement | null)?.clientWidth;
  return typeof w === 'number' ? w * 100000 + (typeof inner === 'number' ? inner : 0) : -1;
}

/** The three numbers a scrolling box has. */
export type Scroller = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

/** The scrollTop that puts the LAST pixel of content on the screen. */
export function bottomOf(s: Scroller): number {
  return Math.max(0, Math.round(s.scrollHeight - s.clientHeight));
}

/** How much content is still under the fold. The app means she can see the end. */
export function gapToBottom(s: Scroller): number {
  return Math.max(0, bottomOf(s) - Math.round(s.scrollTop));
}

/**
 * A pixel of slack, because a fractional layout can leave scrollTop a hair
 * under the maximum and nothing is hidden by that.
 */
export const AT_BOTTOM_SLACK = 2;

export function isAtBottom(s: Scroller, slack = AT_BOTTOM_SLACK): boolean {
  return gapToBottom(s) <= slack;
}

/**
 * HOW FAR SHE HAS TO SCROLL UP TO MEAN IT.
 *
 * Sticking has to survive the ordinary noise of a page settling: a font
 * swapping, a picture arriving, a row of buttons appearing under the thread.
 * Any of those can leave the box a few pixels off the end for one frame, and
 * treating that as "she scrolled away" would unstick a conversation nobody
 * touched. It is deliberately small: this is a tolerance, not a region.
 */
export const LEAVE_SLACK = 24;

// WHAT A RESTORE HAS DONE TO THIS BOX, for the stick to read.
//
// The two are armed by different components at different moments and neither
// can wait for the other: the pane arms the restore the instant it mounts, and
// the thread arms the stick only once the conversation has been read off her
// disk. Measured on a reload of a real row, 2026-08-23, with every step stamped:
//
//     79ms   the restore arms for 2998, page is 1072 tall, reaches 11
//    113ms   the page reaches 5459, the restore reaches 2998 and lets go
//    115ms   the thread mounts and the stick arms — and pins her to 4398
//
// So "stand down while a restore is running" is not enough on its own, because
// by the time the stick exists the restore is already over. What the stick needs
// is not a lock, it is the ANSWER: somebody put her at 2998 on purpose, and 2998
// is still where the box is, so she is not at the end and must not be taken
// there.
//
//   live    how many restores are reaching for this box right now. While it is
//           above zero the stick watches and writes nothing.
//   placed  where the last finished restore left her, or null. Read once, when
//           a stick arms, and only while the box is still sitting on it.
type RestoreMark = { live: number; placed: number | null };
const restores = new WeakMap<HTMLElement, RestoreMark>();
const markOf = (el: HTMLElement): RestoreMark => {
  const was = restores.get(el);
  if (was) return was;
  const fresh: RestoreMark = { live: 0, placed: null };
  restores.set(el, fresh);
  return fresh;
};

/**
 * Keep a scrolling box at its bottom for as long as it is at its bottom.
 *
 * Returns the release: calling it stops the stick for good, which is what the
 * component's own cleanup does when she leaves the task. Her scrolling up stops
 * it too, until she scrolls back down.
 */
export function holdAtBottom(el: HTMLElement | null, opts: { now?: () => number } = {}): () => void {
  if (!el) return () => {};
  const now = opts.now ?? (() => Date.now());
  let live = true;
  // SHE IS AT THE BOTTOM UNTIL SHE ISN'T. A task opens at its end, so this
  // starts true and only something moving the box turns it off.
  let stuck = true;
  // THE LAST POSITION THIS KNOWS THE BOX WAS IN, whether because it wrote it or
  // because a scroll event reported it. -1 is "nothing yet". A scrollTop that
  // does not match it is one nobody told us about.
  //
  // Without it the stick can only learn about a move from the box's own scroll
  // event, and scroll events are delivered asynchronously. Measured on a reload
  // 2026-08-23: the restore reached her place at 94.7ms and let go, and the
  // stick's own observer ran on that same resize a fraction later with its flag
  // still saying "at the bottom", because the scroll event her place had just
  // fired was still queued. It put her at 4398 instead of 2998.
  //
  // IT IS NOT ON ITS OWN AN ANSWER, and believing it was is. See `hers` below.
  let mine = -1;
  // WHETHER A RESTORE HAS OWNED THIS BOX SINCE THE LAST TIME WE LOOKED. Where a
  // finished restore left her is a decision somebody made on purpose, so the
  // stick has to read it rather than write over it, and it has to read it at the
  // moment the restore ENDS. Before, that was inferred from the position, which
  // is the same mistake `hers` is about.
  let underRestore = false;

  // WHEN SHE LAST PUT A HAND ON THIS BOX, and -Infinity for never.
  //
  // THIS IS THE WHOLE OF. The stick used to decide she had taken over from the
  // POSITION alone: a scrollTop it had not written itself was hers, on the
  // reasoning that a page growing does not move scrollTop. That reasoning is
  // right about a page growing and wrong about a page RE-WRAPPING. When the
  // document pane opens beside the thread the reading column halves in width,
  // every paragraph re-wraps taller, and the browser moves scrollTop ITSELF to
  // keep the reading position steady. The stick read that as her hand and
  // switched off for good, hundreds of pixels short of the end.
  //
  // Measured on the built renderer over her real store, 2026-08-25
  // (`scripts/measure-e-lands-at-the-bottom.mjs`): walking her inbox with E,
  // with the document pane stubbed out, 0 of 12 landings came to rest short of
  // the end. With the pane doing what it really does, 6 of 8 did, median 422px
  // short, and none recovered. One landing frame by frame: at the bottom of a
  // 10,115px page at 9,200, then the column goes 1,375px wide to 589px, the page
  // becomes 12,437px, and the box is left at 11,230 of a possible 11,522.
  //
  // So the answer is the one `resumeTo` below already reached for its own case:
  // it really does have to be her gestures rather than the scroll position,
  // because the position cannot tell us apart from her. Nothing but a hand of
  // hers may switch this off.
  let hand = -Infinity;
  const hers = () => now() - hand <= HER_HAND_MS;

  // HOW WIDE THE COLUMN WAS LAST TIME WE LOOKED, and the paragraph she was
  // reading when she was not at the end. The pair is what survives a re-wrap.
  let width = widthOf(el);
  let place: Place | null = null;

  const pin = () => {
    if (!live) return;
    // A RESTORE OWNS THE BOX WHILE IT RUNS, and standing down is not enough:
    // this has to keep WATCHING, or the moment the restore lets go it has no
    // idea where she was put and assumes she is at the end.
    if (markOf(el).live > 0) {
      underRestore = true;
      mine = Math.round(el.scrollTop);
      return;
    }
    if (underRestore) {
      underRestore = false;
      stuck = gapToBottom(el) <= LEAVE_SLACK;
      mine = Math.round(el.scrollTop);
    }
    // THE COLUMN CHANGED WIDTH, so whatever moved scrollTop just now was the
    // page re-wrapping and not her, even with her hand a moment behind it: the
    // click that opens a document beside the thread is itself a mousedown in
    // this box. Measured on w-3795af61f5, 2026-09-23, off her own screenshots:
    // she pressed a file's open button while reading the last message, the
    // column went to under half its width, and she was left in the middle of a
    // script three messages up. At the end she stays at the end. Anywhere else
    // she keeps the paragraph she was reading, at the height she was reading it.
    const w = widthOf(el);
    const rewrapped = w !== width;
    width = w;
    if (rewrapped && !stuck) {
      if (place && returnTo(el, place)) { mine = Math.round(el.scrollTop); place = placeIn(el); }
      return;
    }
    // A MOVE NOBODY TOLD US ABOUT, AND ONLY THEN. The position says the box
    // moved; her hand says the move was hers. Both, or a re-wrap reads as her
    // scrolling away and a page that has merely grown reads as it too.
    if (!rewrapped && hers() && mine >= 0 && Math.round(el.scrollTop) !== mine) {
      stuck = gapToBottom(el) <= LEAVE_SLACK;
    }
    if (!stuck) { place = placeIn(el); return; }
    const want = bottomOf(el);
    // Only write when it would actually move. A no-op write still fires a
    // scroll event, and a scroll event this thing has to reason about is worth
    // not creating in the first place.
    if (Math.round(el.scrollTop) !== want) el.scrollTop = want;
    mine = want;
  };

  // WHETHER SHE IS STILL AT THE END, DECIDED ON HER SCROLLING AND NOTHING ELSE.
  //
  // Our own pin lands exactly at the bottom, so the event it fires reads as
  // still stuck, which is true.
  const onScroll = () => {
    if (!live) return;
    // A re-wrap the observer has not been told about yet: settle it first, or
    // the browser's own move reads as her scrolling away.
    if (widthOf(el) !== width) { pin(); return; }
    if (hers() && Math.round(el.scrollTop) !== mine) {
      stuck = gapToBottom(el) <= LEAVE_SLACK;
    }
    if (!stuck) place = placeIn(el);
    // Learned, either way. Leaving it unrecorded would make the NEXT growth
    // look like somebody had moved the box: growth changes the gap without
    // changing scrollTop, so a stale marker turns "she came back to the end"
    // into "she is 1,253px from it" the moment another line arrives.
    mine = Math.round(el.scrollTop);
  };

  // Every height change inside the box: a preview or a picture arriving late, a
  // worker writing another line, a fold she opened.
  const RO = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  const ro = RO ? new RO(() => pin()) : null;

  // A PICTURE FINISHING IS NOT A RESIZE OF ANYTHING WE OBSERVE, when it is
  // inside a box whose own height the layout has already decided. `load`
  // capture catches every image and iframe in the thread for the cost of one
  // listener.
  const onLoad = () => pin();

  // HER HAND. The same four `resumeTo` gives way to, for the same reason: these
  // are the events a person makes, and a reflow makes none of them. A scrollbar
  // drag is `mousedown` and then a run of scroll events with no further gesture,
  // which is why this is a window and not a one-shot.
  const took = () => { hand = now(); };

  function release() {
    if (!live) return;
    live = false;
    ro?.disconnect();
    el!.removeEventListener('scroll', onScroll);
    el!.removeEventListener('load', onLoad, true);
    for (const ev of HER_GESTURES) el!.removeEventListener(ev, took);
  }

  el.addEventListener('scroll', onScroll, { passive: true });
  el.addEventListener('load', onLoad, true);
  for (const ev of HER_GESTURES) el.addEventListener(ev, took, { passive: true });
  // BOTH BOXES, because the two ways to fall short of the end are different
  // things growing. The content growing is the obvious one. The box itself
  // SHRINKING is the other, and it happens every time the options strip or the
  // reply composer under the pane takes another line: `clientHeight` drops,
  // the end moves down, and nothing inside the thread changed at all.
  if (ro) {
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
  }

  // WHAT A RESTORE LEFT BEHIND, if this is arming into one that has just
  // finished. Only while the box is still sitting exactly where it was put: she
  // may have scrolled since, and then her own position is the newer answer and
  // the ordinary rules below decide it.
  const placed = markOf(el).placed;
  if (placed !== null && Math.round(el.scrollTop) === placed) {
    stuck = gapToBottom(el) <= LEAVE_SLACK;
    mine = placed;
  }

  pin();
  return release;
}

/**
 * PUT HER BACK WHERE SHE WAS, once, across a reload.
 *
 * So this is only ever driven by the ⌘R restore, never by a click.
 *
 * It is not one write. The conversation is read off her disk after the pane is
 * drawn, so at the moment a reload finishes the box is a few hundred pixels
 * tall and a scrollTop of 4,000 clamps to whatever fits. This keeps reaching for
 * the place as the page grows, and stops the moment it gets there, she touches
 * the page, or the window above runs out.
 *
 * WRITING THE SCROLL IS ALSO HOW IT STANDS DOWN THE STICK. `holdAtBottom` reads
 * her position off the box's own `scroll` events, so a restore that lands short
 * of the end unsticks the thread by doing its job, and the two never fight over
 * the same box.
 */
export function resumeTo(
  el: HTMLElement | null,
  top: number,
  opts: { now?: () => number; window?: number } = {},
): () => void {
  if (!el || !(top > 0)) return () => {};
  const now = opts.now ?? (() => Date.now());
  const window_ = opts.window ?? RESUME_WINDOW_MS;
  const started = now();
  let live = true;

  const mark = markOf(el);
  mark.live += 1;
  mark.placed = null;

  const reach = () => {
    if (!live) return;
    const want = Math.min(top, bottomOf(el));
    if (Math.round(el.scrollTop) !== want) el.scrollTop = want;
    // Arrived. A page that grows further from here is hers to follow or not.
    if (want >= top) release();
  };

  // HER HAND ENDS IT, and here it really does have to be her gestures rather
  // than the scroll position: every scroll event in this window is one this
  // function just caused, so the position cannot tell us apart from her.
  const HERS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

  const RO = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  const ro = RO ? new RO(() => reach()) : null;

  const timer = setInterval(() => {
    if (now() - started >= window_) { release(); return; }
    reach();
  }, 100);

  function release() {
    if (!live) return;
    live = false;
    // WHERE IT LEFT HER, kept after it has gone. A stick that arms two
    // milliseconds later has no other way to know she was placed on purpose.
    mark.live = Math.max(0, mark.live - 1);
    mark.placed = Math.round(el!.scrollTop);
    ro?.disconnect();
    clearInterval(timer);
    for (const ev of HERS) el!.removeEventListener(ev, release);
  }

  for (const ev of HERS) el.addEventListener(ev, release, { passive: true });
  if (ro) {
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
  }

  reach();
  return release;
}
