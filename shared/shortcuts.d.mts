// Types for shared/shortcuts.mjs, which is plain ESM so that the Settings page
// (Vite) and the supervisor (Node) read one list of keys. See the module for
// why each row reads the way it does.

export interface Shortcut {
  /**
   * The caps, drawn in order. A chord is ONE cap ('⌘K', '⌘↵'), the way the
   *  walk already draws them, because ⌘ and K are not two keys to a reader.
   *
   *  AND THE HOVER HINT NO LONGER AGREES WITH THAT. ⌘J was drawn both ways on
   *  w-2f7fac6027, one cap per key won, because a single ⌘J cap looked
   *  condensed next to the usual way shortcuts are drawn. So
   *  `capsFor` in hint-plate.ts splits a chord into one cap per glyph, and this
   *  page does not. That is a real disagreement between two surfaces and it is
   *  left standing rather than quietly resolved: this is a reference page where
   *  a chord is read as one thing to press, and the hint is a label on a
   *  control she is pointing at. If the page ever looks condensed too,
   *  the fix is to take `capsFor` here, not to put one cap back there. */
  keys: string[];
  /**
   * The word set between two caps. Absent means they simply sit side by side,
   *  which is what ↑ ↓ means: both of them, either way. */
  join?: 'or' | 'to';
  /** What it does, in plain English. ONE sentence, under seventy characters. */
  what: string;
}

export interface ShortcutGroup {
  /** THE HEADING SAYS WHEN THE KEYS WORK, LITERALLY, AND IT IS THE ONLY PROSE
   *  A GROUP GETS. There is deliberately no note field: see the module. */
  label: string;
  keys: Shortcut[];
}

export const SHORTCUTS: ShortcutGroup[];

/** Every cap drawn on the page, flattened. The test walks this. */
export function everyKey(groups?: ShortcutGroup[]): string[];

/** The keys as one block of plain text, for an agent's system prompt. */
export function keysForAgents(groups?: ShortcutGroup[]): string;
