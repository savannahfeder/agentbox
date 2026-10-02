/** THE HALF CIRCLE ON THE MATCH MY SYSTEM TILE.
 *
 *  Not an emoji and not a font glyph: one circle with a half disc over it, so it
 *  is the same shape at any size and in any theme.
 *
 *  IT IS THE ONLY THING THAT SAYS THE TILE IS THE FOLLOWING ONE. Match my system
 *  draws whichever of Light and Dark the Mac is on right now (the `data-machine`
 *  rules in styles.css), which is honest about what pressing it would give you
 *  and, on a dark Mac, indistinguishable from the Dark tile beside it without
 *  this mark. Its own component because three screens draw the tile — Settings,
 *  the ⌘K theme bar and the walk's fourth step — and the same drawing copied
 *  three times is the fault that broke the introduction's Next button.
 */
export function MatchMark() {
  return (
    <svg className="match-mark" width="13" height="13" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6 0.8 A5.2 5.2 0 0 1 6 11.2 Z" fill="currentColor" />
    </svg>
  );
}
