// THE LIST KEEPS OUT FROM UNDER THE APPROVAL CARD.
//
// The card is fixed to the bottom-right corner, above everything, because a
// worker is frozen until it is answered, and the inbox scrolled underneath it:
// the last rows of Needs you sat behind the card with nothing below them left
// to scroll.
//
// A number in the stylesheet would be a guess. The card is 149px with a bare
// command and half as tall again once it carries a description, a folder and a
// host, so this measures the card and writes what it found; styles.css reads
// `--approval-room` and leaves the list that much room at its foot.

const ROOM = '--approval-room';
const LIFT = '--approval-lift';
const WIDTH = '--approval-width';

/** The card's gap from the foot of the window, and its width, as in styles.css. */
export const CARD_FOOT = 22;
export const CARD_WIDTH = 440;
/** Narrower than this and the card stands above the box instead: lifted, it hangs over the thread. */
export const NARROWEST = 340;
const GAP = 8;
/** Air between the card and a box it stands beside. */
export const SIDE_GAP = 16;

type Box = { left: number; right: number; top: number; bottom: number };

/**
 * Where the card stands so it covers no box a person types in: in its corner,
 * narrowed to end beside any such box it would touch, or, when that would make it
 * narrower than NARROWEST, at full width above them, as high as the window lets it.
 * `card` is its full-width place in the corner.
 */
export function cardPlace(card: { left: number; right: number; height: number }, boxes: Box[], viewport: number): { lift: number; width: number } {
  const full = card.right - card.left;
  const under = boxes.filter((box) => box.right > box.left && box.bottom > box.top
    && box.right > card.left && box.left < card.right
    && box.bottom > viewport - CARD_FOOT - card.height);
  const width = Math.min(full, ...under.map((box) => card.right - box.right - SIDE_GAP));
  if (width >= NARROWEST) return { lift: CARD_FOOT, width };
  const lift = Math.max(...under.map((box) => viewport - box.top + GAP));
  return { lift: Math.min(lift, Math.max(CARD_FOOT, viewport - card.height - GAP)), width: full };
}

/**
 * Keep the foot of the list clear of `el` for as long as it is on screen.
 * Returns the undo, which the caller runs when the card goes.
 */
export function roomForTheCard(el: HTMLElement): () => void {
  const root = document.documentElement;
  const write = () => root.style.setProperty(ROOM, `${Math.round(el.getBoundingClientRect().height)}px`);
  write();
  // A card grows when a worker sends a long description, and the stack behind
  // it grows with the queue.
  const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(write) : null;
  watch?.observe(el);
  // A thread opening under the card brings its Reply box with it.
  const lift = () => {
    const card = el.getBoundingClientRect();
    // Measured from its full-width place, or a narrowed card would clear the box and widen
    // again on the next look. On a phone it spans the screen, wider than CARD_WIDTH.
    const corner = { left: card.right - Math.max(card.width, CARD_WIDTH), right: card.right, height: card.height };
    // `.dock-pill` is the Reply box folded: it is a button until it is pressed.
    const boxes = [...document.querySelectorAll('textarea, [contenteditable="true"], .dock-pill')]
      .filter((box) => !el.contains(box))
      .map((box) => box.getBoundingClientRect());
    const place = cardPlace(corner, boxes, window.innerHeight);
    root.style.setProperty(LIFT, `${place.lift}px`);
    root.style.setProperty(WIDTH, `${place.width}px`);
  };
  lift();
  const looking = setInterval(lift, 400);
  return () => {
    watch?.disconnect();
    clearInterval(looking);
    root.style.removeProperty(ROOM);
    root.style.removeProperty(LIFT);
    root.style.removeProperty(WIDTH);
  };
}
