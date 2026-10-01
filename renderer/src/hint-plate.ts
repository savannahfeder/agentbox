// WHAT THE KEY HINT SAYS, AND WHERE IT HANGS. PURE.
//
// The hint used to swap a row's own right end for two keycaps after a long
// hover. That changed the component itself, and a hint that only appears on a
// slow hover goes unnoticed by anyone who does not hover much.
//
// So the hint is a PLATE that arrives beside the thing, and nothing the
// component was already saying moves or disappears. Five rounds of pictures on
// w-2f7fac6027 settled the whole of it, and every line below is a settled
// answer rather than a choice left open:
//
//   WHERE. Under the component, left edges aligned, hanging off its bottom edge
//   with a gap, covering no part of it, never overlaying it. A component
//   sitting on the floor of the window has no room under it, so those rise the
//   same distance instead; `placeHint` below is that rule and nothing else.
//
//   WHICH COMPONENTS. Seven. Excluded: the tick box, the reply pill, the
//   options an agent offered, the reply box, and any other place where the app
//   already shows the shortcut. That last clause is a RULE and not a list,
//   and it is why the search field, the command button and the approval card
//   are absent too: all three already print their key with nothing hovered.
//   Nothing may be added here without meeting it.
//
//   WHAT IT SAYS. The key AND what it does. Round three took the sentence off
//   every button and left the cap alone, and that was rejected: the plate has
//   to explain what the key does.
//
//   HOW IT IS WORDED. Clarity over creativity or sounding nice: one simple
//   fragment per line, so "Open it" becomes "Open task" or "Open agent". Every
//   line names the thing the key acts on, in the app's own word, as a fragment.
//   No pronoun standing in for a noun, because "it" never says what it is. No
//   idiom. No full stop, because a fragment does not take one.
//
//   HOW A CHORD IS DRAWN. One cap per glyph, chosen in round four.
//   THIS OVERRULES THE STANDING RULE IN `shortcuts.ts`, which says a
//   chord is one cap because "⌘ and K are not two keys to a reader". That file
//   now carries a note pointing here. `esc` and a bare arrow are one key
//   whatever their length, so only a real chord splits.

/** One line of a plate: the caps to draw, and the fragment beside them. */
export interface HintLine {
  /** The chord as the app writes it, e.g. '⌘⌥↓'. Split by `capsFor`. */
  key: string;
  /** What it does. A fragment, no full stop. See the wording rule above. */
  what: string;
}

/**
 * THE CAPS FOR ONE KEY.
 *
 *  A chord becomes one cap per glyph. Anything that is a single key stays whole
 *  however many characters it is written with, which is what keeps `esc` from
 *  being drawn as three caps.
 */
export function capsFor(key: string): string[] {
  if (key.length <= 1) return [key];
  // The words the app writes out for one physical key. Nothing else is
  // multi-character and single-key.
  if (key === 'esc') return [key];
  return [...key];
}

/**
 * EVERY COMPONENT THAT CARRIES A HINT, BY THE `data-hint` IT WEARS.
 *
 *  A component opts in by writing `data-hint="<id>"` on itself; the id is
 *  looked up here. Adding a component means adding it in both places, and
 *  `tests/the-hint-plate.test.mjs` holds the two lists to each other so a
 *  `data-hint` with nothing to say cannot ship.
 */
export const HINTS: Record<string, HintLine[]> = {
  // The list, as she opens it.
  // N, not C, since w-fb9051e597. C still opens it; only N is advertised.
  // "Thread" is the app's word for a row since w-ec62ab6b38.
  'new-task': [{ key: 'N', what: 'New thread' }],
  sidebar: [{ key: '\\', what: 'Show or hide the sidebar' }],
  // ONE PER TAB, NOT ONE FOR THE STRIP. While the keys were ⌘⌥ and an arrow
  // they moved BETWEEN the four, so they belonged to the nav and not to any one
  // of them. ⌘1 to ⌘4 go straight to a section, so each tab now says its own
  // number and the plate lands under the tab she is pointing at.
  //
  // THE NUMBER IS THE POSITION AND THE LABEL IS NOT WRITTEN HERE. Scheduled
  // comes and goes with whether anything is deferred (`workspaceDestinations`),
  // so the fourth tab is Closed on most days and the third on some. The tab
  // knows which slot it is drawn in; `sectionHint` below turns that into the id.
  'section-1': [{ key: '⌘1', what: 'Go to this section' }],
  'section-2': [{ key: '⌘2', what: 'Go to this section' }],
  'section-3': [{ key: '⌘3', what: 'Go to this section' }],
  'section-4': [{ key: '⌘4', what: 'Go to this section' }],
  // A task in the list. THE ONLY COMPONENT IN HERE THAT IS NOT A BUTTON, and
  // the reason it says three whole fragments rather than three bare caps: a row
  // carries no verb anywhere on it, so the caps alone would say nothing.
  //
  // J and K are NOT on this plate. They move the selection through the list,
  // which is not a thing this row does and not a thing any component owns; a
  // plate on a row promising "Next task" would be the row talking about its
  // neighbours. They stay on the shortcuts page, which is where the full list
  // lives.
  row: [
    { key: '↵', what: 'Open task' },
    // Close is being renamed to Done on another branch, so E says Mark done
    // rather than close. Until that branch lands the
    // sidebar still says Closed while this says Mark done; whichever merges
    // second makes them agree. Do not put "Close" back.
    { key: 'E', what: 'Mark done' },
    { key: 'S', what: 'Schedule for later' },
  ],
  // THE CORNER OF THE TOP BAR, AND THESE THREE WERE MISSING AT FIRST: hovering
  // them showed no shortcut at all.
  //
  // THEY WERE LEFT OUT ON A RULE AND THE RULE WAS READ TOO WIDELY. A component
  // that already shows its key gets no plate, and these
  // were held to it: the ⌘ mark "is" its key and the search field prints / at
  // its right end. That is true of the reply pill, where R is printed as a
  // keycap next to a word, and it is not true here: an icon of a ⌘ is a picture
  // of a button, not a statement that the chord is ⌘K, and nothing about a
  // magnifier says what pressing it costs. A button she points at and gets
  // nothing from is the fault.
  commands: [{ key: '⌘K', what: 'Everything by name' }],
  search: [{ key: '/', what: 'Search your tasks' }],
  // A task she has opened.
  // THE MARK THAT FINISHED IT IS A ROW NOW (w-e731ca9376, 2026-10-01): Mark
  // done, in the thread's menu, which prints E beside its words. A component
  // that already shows its key carries no plate, so its line went with it.
  terminal: [{ key: '⌘J', what: 'Show or hide the terminal' }],
  back: [{ key: 'esc', what: 'Go back one level' }],
};

export interface Rect { top: number; left: number; right: number; bottom: number; width: number; height: number }
export interface Size { width: number; height: number }

/** The gap between the component's edge and the plate. */
export const HINT_GAP = 7;
/** How close to the window's edge the plate may come. */
export const HINT_MARGIN = 8;

/**
 * WHERE THE PLATE GOES, given the component it belongs to and how big the plate
 *  turned out to be.
 *
 *  Under, with the left edges lined up. `align: 'right'` lines the RIGHT edges
 *  up instead, for a component in the right-hand corner whose plate would
 *  otherwise run off the window. `rose` is returned rather than inferred so the
 *  caller and the tests can both see which rule fired.
 */
export function placeHint(
  comp: Rect,
  plate: Size,
  viewport: Size,
  align: 'left' | 'right' = 'left',
  /**
   * THE WORDS INSIDE THE COMPONENT, when it has any. The plate lines its own
   *  first CAP up with the first LETTER of these rather than with the edge of
   *  the box around them.
   *
   *  Under a task row the plate used to sit too far left, because it was
   *  aligned with the inbox border rather than with the text.
   *
   *  A row's box starts at the card's edge and its title starts 26 points
   *  further in, past the tick box; a tab's box starts at the sidebar's edge and
   *  its label starts past the icon. Lining up with the box is what makes the
   *  plate look shoved left of everything it is about.
   *
   *  `inset` is the plate's OWN left padding plus its border, which has to come
   *  off again: it is the cap that should sit under the letter, not the plate's
   *  edge. Absent for a component with no text, where the box is all there is.
   */
  text?: { left: number },
  inset = 0,
): { top: number; left: number; rose: boolean } | null {
  // A BOX OF NOTHING IS NOT A PLACE. A detached element measures 0 by 0 at 0,0,
  // and the clamp below would turn that into the window's top-left corner,
  // which is where a row's keys once ended up, sitting over the traffic
  // lights. The caller drops the hint rather than drawing it somewhere.
  if (comp.width <= 0 && comp.height <= 0) return null;
  const rose = comp.bottom + HINT_GAP + plate.height > viewport.height - HINT_MARGIN;
  const top = rose ? comp.top - HINT_GAP - plate.height : comp.bottom + HINT_GAP;
  const wanted = align === 'right'
    ? comp.right - plate.width
    : (text ? text.left - inset : comp.left);
  const left = Math.max(HINT_MARGIN, Math.min(wanted, viewport.width - plate.width - HINT_MARGIN));
  return { top: Math.round(top), left: Math.round(left), rose };
}

/**
 * THE HINT ID FOR THE TAB DRAWN IN THIS SLOT, counting from one, or undefined
 *  past the fourth. A fifth section would need a fifth key before it could have
 *  a hint, and saying nothing is the honest answer until it does.
 */
export function sectionHint(slot: number): string | undefined {
  return slot >= 1 && slot <= 4 ? `section-${slot}` : undefined;
}
