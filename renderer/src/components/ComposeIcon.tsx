// The new-task button's mark.
//
// A hairline plus: long arms, thin stroke, and the size to survive the
// thinness. Chosen 2026-08-12 out of five, after an earlier set that swapped
// the symbol for pencils and nibs and read as immature.
//
// The proportions ARE the design and they are the whole reason this is drawn
// here rather than typed as a character: a plus at default stroke and full
// width is the one every unfinished interface has.

export function ComposeIcon() {
  return (
    <svg
      className="compose-glyph"
      width="22" height="22"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.1" strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 4.4v15.2M4.4 12h15.2" />
    </svg>
  );
}
