// The magnifier, her pick of the four entry points drawn on ("approved",
// 2026-08-13): E1, in the corner, left of the panel toggle.
//
// Drawn to the same recipe as the plus, the cog and the panel mark beside it:
// 22px on a 24 grid, 1.1 hairline, round caps, no fill and no chrome. That is
// the whole reason it is a component rather than a character — a magnifier at
// default weight is the one every unfinished interface has, and next to three
// hairlines it reads as an icon from another app.
//
// It restores what she removed on 12 August but not what she removed it for:
// what went was a wide search BAR taking the room the plus needed. This is a
// 34px glyph in a family that already exists, and the layout does not move.

export function SearchIcon() {
  return (
    <svg
      className="compose-glyph"
      width="22" height="22"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.1" strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="M15.6 15.6 20 20" />
    </svg>
  );
}
