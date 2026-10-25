// PURE. Which keys the model drawer takes, and from where.
//
// WHERE THE PRESS CAME FROM IS THE WHOLE QUESTION. Escape means the same thing
// anywhere in the drawer, so it is answered for the drawer rather than for the
// word that opens it: handled on the word alone it never arrived once focus
// had moved onto a level. Every other key is the opposite. Enter on the word
// picks the model row under the cursor, Enter on a level sets that level, and
// one handler taking both would do both at once.

type Press = Pick<KeyboardEvent, 'key'>;

/** What the drawer should do, or null to leave the key to whatever has focus. */
export type DrawerMove = 'open' | 'close' | 'up' | 'down' | 'pick';

export function modelDrawerKey(
  e: Press,
  { open, from }: { open: boolean; from: 'word' | 'inside' },
): DrawerMove | null {
  if (!open) {
    // Nothing inside a shut drawer has focus, and the box's own Escape folds
    // it, so a shut drawer takes nothing but the keys that open it.
    if (from === 'inside') return null;
    return ['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key) ? 'open' : null;
  }
  if (e.key === 'Escape') return 'close';
  if (from === 'inside') return null;
  if (e.key === 'ArrowDown') return 'down';
  if (e.key === 'ArrowUp') return 'up';
  if (e.key === 'Enter') return 'pick';
  return null;
}
