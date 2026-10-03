// HOW WIDE THE OPENED TASK'S SCROLLBAR IS, handed to the reply box.
//
// The words sit inside `.focus-scroll` and the reply box sits under it, outside
// the scroll. A scrollbar takes layout room (about 11 points with
// `scrollbar-width: thin`), so the words centre in the pane minus the
// scrollbar while the box centred in the whole pane, and began 5.5 points to
// the right of the first word (w-a9b77c7b57, measured off a 2x shot: 59
// against 70). The pane is told the width as `--scroll-gutter`, and the dock
// adds it to its right padding so both centre in the same width. A scrollbar
// macOS overlays takes no room and reads as 0, which moves nothing.

type Measured = { offsetWidth: number; clientWidth: number };

/** The room the scrollbar takes, in px. `.focus-scroll` has no border, so the difference is all scrollbar. */
export function scrollGutter(el: Measured): number {
  return Math.max(0, el.offsetWidth - el.clientWidth);
}

/**
 * Keeps `--scroll-gutter` on the scroller's parent (`.focus-pane`) current.
 * The scroller itself is observed: a scrollbar appearing or going narrows or
 * widens its content box, which is what a ResizeObserver reports, and so does
 * the window changing size.
 */
export function watchScrollGutter(scroller: (Measured & { parentElement: { style: { setProperty(k: string, v: string): void } } | null }) | null): () => void {
  const pane = scroller?.parentElement;
  if (!scroller || !pane) return () => {};
  const apply = () => pane.style.setProperty('--scroll-gutter', `${scrollGutter(scroller)}px`);
  apply();
  if (typeof ResizeObserver === 'undefined') return () => {};
  const ro = new ResizeObserver(apply);
  ro.observe(scroller as unknown as Element);
  return () => ro.disconnect();
}
