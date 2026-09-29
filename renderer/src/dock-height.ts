// HOW TALL THE REPLY BOX GETS.
//
// THE LIMIT IS A SHARE, NOT A LINE COUNT, and that is the whole reason
// this file exists instead of one number in the stylesheet. The pane is not the
// same height on every machine: 568px on a 13 inch at a zoomed setting, 718px
// on a mid-size screen, 931px on a 16 inch (`designs/reply-stop/`). A fixed twelve
// lines is therefore 63% of a 13 inch page and 38% of a 16 inch one, and the
// 13 inch case is the one that fails: it leaves 6.9 lines of the agent's
// message, one of them faded. A share is the only rule that lets the box grow
// freely and still keeps the page readable, so it stops at 40% of the pane:
// 6 lines on a 13 inch, 9 on the mid-size one, 12 on a 16 inch. The page always keeps
// three fifths.
//
// THE SHARE IS OF THE WHOLE CARD, not of the text area, which is why `chrome`
// is subtracted below. What costs her the page is everything the dock draws:
// the footer sentence, an attachment row, the options strip. Capping only the
// text and letting the furniture spill past 40% would be the same bug wearing
// a smaller number.

/** The ceiling: the dock card never takes more than this share of the pane. */
export const DOCK_SHARE_OF_PANE = 0.4;

/** The floor, in whole lines, if a window is ever too short to honour the share. */
export const DOCK_MIN_LINES = 3;

export type DockMetrics = {
  /** `.focus-pane`: the task and its dock, which is the "page" the share is of. */
  paneHeight: number;
  /** Everything in the card that is not the text area: footer, attach row, options. */
  chromeHeight: number;
  /** Computed line-height of the text area, in px. */
  lineHeight: number;
  /** The text area's own vertical padding, which holds no line. */
  padY: number;
  /** The resting height (CSS `min-height`), which nothing may go under. */
  floor: number;
  /** What the text actually needs: the element's `scrollHeight`. */
  scrollHeight: number;
};

/**
 * How many whole lines the box may show. Whole lines on purpose: a ceiling
 * counted in pixels lands mid-line and leaves a band of half-height text at the
 * bottom edge, which reads as the box being broken rather than full.
 *
 * Whole lines of TEXT, to be exact. The box keeps its 6px of bottom padding
 * inside the scroll area, so once she is past the ceiling the top of the next
 * line shows through it as a sliver. That is left alone deliberately: it is the
 * one cue in the card that says there is more of her reply below, and it is
 * the same cue a scrollbar would give without taking a column of width.
 */
export function dockCapLines(m: DockMetrics, share = DOCK_SHARE_OF_PANE): number {
  const room = m.paneHeight * share - m.chromeHeight - m.padY;
  if (!Number.isFinite(room)) return DOCK_MIN_LINES;
  return Math.max(DOCK_MIN_LINES, Math.floor(room / m.lineHeight));
}

/** That cap in pixels. */
export function dockCeiling(m: DockMetrics, share = DOCK_SHARE_OF_PANE): number {
  return dockCapLines(m, share) * m.lineHeight + m.padY;
}

/**
 * The height to draw: what the text needs, never under the resting floor and
 * never over the ceiling.
 *
 * THE FLOOR WINS AGAINST THE CEILING, deliberately. On a window short enough
 * that 40% of it is less than three lines, honouring the share would mean a
 * box SMALLER than the resting one, which defeats the point of letting it grow.
 * At rest nothing changes under any option, and that promise outranks the
 * share in the one case where they disagree.
 */
export function dockHeight(m: DockMetrics, share = DOCK_SHARE_OF_PANE): number {
  const wanted = Math.min(m.scrollHeight, dockCeiling(m, share));
  return Math.max(m.floor, wanted);
}

/** Whether the user's own text is being hidden at this height, i.e. she must scroll. */
export function dockScrolls(m: DockMetrics, share = DOCK_SHARE_OF_PANE): boolean {
  return m.scrollHeight > dockHeight(m, share) + 1;
}

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Read the six numbers off the live element.
 *
 * `scrollHeight` is only honest once the element is not already holding a
 * height taller than its text, so the caller resets height to `auto` first;
 * that is what `applyDockHeight` does and why measuring is not public.
 */
function measureDock(el: HTMLTextAreaElement): DockMetrics {
  const cs = getComputedStyle(el);
  const lineHeight = num(cs.lineHeight) || num(cs.fontSize) * 1.55 || 22;
  const padY = num(cs.paddingTop) + num(cs.paddingBottom);
  const card = el.closest('.dock-card');
  const pane = el.closest('.focus-pane');
  // A pane that has not been laid out yet would cap the box at three lines
  // forever, so the window is the fallback: it is the only other height that
  // is always real, and it is close, the pane being the window less the rail
  // and the header.
  const paneHeight = pane?.getBoundingClientRect().height || window.innerHeight || 0;
  const chromeHeight = card
    ? Math.max(0, card.getBoundingClientRect().height - el.getBoundingClientRect().height)
    : 0;
  return {
    paneHeight,
    chromeHeight,
    lineHeight,
    padY,
    floor: num(cs.minHeight),
    scrollHeight: el.scrollHeight,
  };
}

/**
 * Grow the box to fit what she has written, stopping at its share of the page.
 * Safe to call on every keystroke: it writes two properties and reads layout
 * once, and it never touches the scroll position of the task above.
 */
export function applyDockHeight(el: HTMLTextAreaElement | null, share = DOCK_SHARE_OF_PANE): void {
  if (!el) return;
  el.style.height = 'auto';
  const m = measureDock(el);
  const h = dockHeight(m, share);
  el.style.maxHeight = `${dockCeiling(m, share)}px`;
  el.style.height = `${h}px`;
}
