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

/** The card's gap from the foot of the window, as in styles.css. */
export const CARD_FOOT = 22;
const GAP = 8;

type Box = { left: number; right: number; top: number; bottom: number };

/**
 * How far up the card stands so it covers no box a person types in. Below every
 * such box it would touch, or as high as the window lets it.
 */
export function cardLift(card: { left: number; right: number; height: number }, boxes: Box[], viewport: number): number {
  let lift = CARD_FOOT;
  for (const box of boxes) {
    if (box.right <= box.left || box.bottom <= box.top) continue;
    if (box.right <= card.left || box.left >= card.right) continue;
    if (box.bottom <= viewport - CARD_FOOT - card.height) continue;
    lift = Math.max(lift, viewport - box.top + GAP);
  }
  return Math.min(lift, Math.max(CARD_FOOT, viewport - card.height - GAP));
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
    // `.dock-pill` is the Reply box folded: it is a button until it is pressed.
    const boxes = [...document.querySelectorAll('textarea, [contenteditable="true"], .dock-pill')]
      .filter((box) => !el.contains(box))
      .map((box) => box.getBoundingClientRect());
    root.style.setProperty(LIFT, `${cardLift(card, boxes, window.innerHeight)}px`);
  };
  lift();
  const looking = setInterval(lift, 400);
  return () => {
    watch?.disconnect();
    clearInterval(looking);
    root.style.removeProperty(ROOM);
    root.style.removeProperty(LIFT);
  };
}
