/** The main card's box in the window's pixels. */
export type CardBox = { left: number; top: number; width: number; height: number };

/** How long the card holds still before a sky stretched by a new size is drawn again. */
export const STILL_MS = 150;

/** The card's left edge with the sidebar folded: the least seen while it was folded. */
let foldedLeft = Infinity;

/**
 * Keeps a sky on the main card and draws it as seldom as it can: drawing one
 * takes tens of milliseconds, and the sidebar sliding open moves the card on
 * every frame.
 *
 * While the sidebar folds away under the pointer (`folds`), the sky is drawn as
 * wide as the card is with the sidebar folded and pinned to the card's right
 * edge, so opening the sidebar covers the sky's left edge instead of drawing it
 * again. Any other new size stretches the drawn sky until the card has held
 * still for STILL_MS, then draws it again. A change with the card in place, such
 * as the writing box landing, draws at once.
 *
 * `paint` is given how far the drawing reaches left of the card, and answers
 * with what else the drawing depends on and how to draw it.
 */
export function followTheCard(host: HTMLElement, wrap: HTMLElement, canvas: HTMLCanvasElement, sky: {
  card: () => CardBox | null;
  paint: (card: CardBox, reach: number) => { key: string; draw: () => void };
}, { watch = [], folds = true }: { watch?: Element[]; folds?: boolean } = {}): () => void {
  let frame = 0;
  let wait: ReturnType<typeof setTimeout> | undefined;
  let placed = '';
  let sized = 0;
  let drawn: string | null = null;
  const look = () => {
    const card = sky.card();
    if (!card) return null;
    if (host.classList.contains('workspace-collapsed')) foldedLeft = Math.min(foldedLeft, card.left);
    const reach = folds && foldedLeft < card.left ? card.left - foldedLeft : 0;
    const at = [card.left, card.top, card.width, card.height].join(',');
    const moved = at !== placed;
    if (moved) {
      placed = at;
      Object.assign(wrap.style, { left: `${card.left}px`, top: `${card.top}px`, width: `${card.width}px`, height: `${card.height}px` });
    }
    const width = Math.round(card.width + reach);
    if (width !== sized) { sized = width; canvas.style.width = `${width}px`; }
    const { key, draw } = sky.paint(card, reach);
    return { moved, drawing: [width, Math.round(card.height), key].join(','), draw };
  };
  const follow = () => {
    frame = 0;
    const seen = look();
    if (!seen) return;
    clearTimeout(wait);
    wait = undefined;
    if (seen.drawing === drawn) return;
    if (drawn === null || !seen.moved) { drawn = seen.drawing; seen.draw(); return; }
    wait = setTimeout(() => {
      wait = undefined;
      const still = look();
      if (still) { drawn = still.drawing; still.draw(); }
    }, STILL_MS);
  };
  const later = () => { if (!frame) frame = requestAnimationFrame(follow); };
  follow();
  const ro = new ResizeObserver(later);
  ro.observe(host);
  for (const el of watch) ro.observe(el);
  // The card moves when the sidebar opens or folds, which changes the window's classes, not its size.
  const classes = new MutationObserver(later);
  classes.observe(host, { attributes: true, attributeFilter: ['class'] });
  return () => { ro.disconnect(); classes.disconnect(); if (frame) cancelAnimationFrame(frame); clearTimeout(wait); };
}
