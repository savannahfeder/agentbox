// PURE. WHAT SHE GETS WHEN SHE COPIES SOME OF A CHANGE.
//
// Rounds one and two were the keyboard. This is the mouse, and it was worse
// than the arrows had been.
//
// MEASURED ON THE REAL PANE, 2026-08-27, before any of this existed: dragging
// down seven lines of the change selected ONE line, fifteen characters. Not a
// short selection — the same one line however far she dragged. So there was no
// way to take a function, a block or even two lines out of the code she was
// reading, which is most of what anyone does at a diff.
//
// WHY, and it is the same fact rounds one and two kept running into: EVERY LINE
// IS ITS OWN contentEditable. A browser will not let a MOUSE selection leave the
// editing host it started in, so the drag was refused at the end of line one and
// nothing on the screen said so. Measured in three DOM shapes side by side
// (/tmp probe, 2026-08-27): lines as their own editing hosts 1 line, plain divs
// 7, one big editing host 7.
//
// AND THE SECOND HALF: even where the selection DID span, what landed on the
// clipboard carried the diff's gutter. A seven line copy pasted as fourteen
// lines with a bare "+" on every other one, because the mark beside each line is
// its own flex box and serialises as a line of its own. `user-select: none` on
// it does NOT fix that — measured, the "+" still came through — so the copy has
// to be built here rather than left to the browser.
//
// WHAT IS DELIBERATELY NOT HERE: the removed lines of a hunk. She is copying
// code to use it, and a "-" line is not in the file any more. It is drawn so she
// can read what went, and it is skipped by the caller when it builds the list
// below, the same way it is refused a caret.

/**
 * WHICH OF THE ROWS A SELECTION TOUCHES GO ON THE CLIPBOARD, by index, or
 * null to leave the copy to the browser.
 *
 * `removed` is one flag per touched row, in the order drawn. The count is of
 * EVERY touched row, removed ones included: counting only the surviving ones
 * called a removed line plus its replacement "one line", stood aside, and the
 * browser copied nothing, so the paste brought back whatever was on the
 * clipboard before (2026-10-04,
 * tests/a-copy-across-a-removed-line-takes-what-was-selected.test.mjs).
 *
 * Removed rows are skipped when any surviving row is selected; when only
 * removed rows are, she chose them, and they are what she gets.
 */
export function linesToCopy(removed: boolean[]): number[] | null {
  if (removed.length < 2) return null;
  const live = removed.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
  return live.length ? live : removed.map((_, i) => i);
}

/**
 * The text of a run of lines, clipped at both ends the way a selection is.
 *
 * `lines` is every line the selection touches, in the order drawn.
 * `from` is how far into the FIRST of them the selection starts, `to` how far
 * into the LAST of them it ends. One line in, and it is one clip of one line.
 */
export function copiedText(lines: string[], from: number, to: number): string {
  if (!lines.length) return '';
  if (lines.length === 1) {
    const only = lines[0];
    const a = Math.max(0, Math.min(from, only.length));
    const b = Math.max(a, Math.min(to, only.length));
    return only.slice(a, b);
  }
  const head = lines[0];
  const tail = lines[lines.length - 1];
  return [
    head.slice(Math.max(0, Math.min(from, head.length))),
    ...lines.slice(1, -1),
    tail.slice(0, Math.max(0, Math.min(to, tail.length))),
  ].join('\n');
}
