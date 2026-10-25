// PURE. Which keys an open emoji picker takes for its search box.

type Press = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'isComposing'>;

/**
 * The character to put in the search, or null to leave the key to whatever
 * has focus. Space is left alone because it presses the focused emoji; chords
 * are left alone so ⌘K and ⌘J still work with a picker open.
 */
export function searchKey(e: Press): string | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return null;
  if (e.key.length !== 1 || e.key === ' ') return null;
  return e.key;
}
