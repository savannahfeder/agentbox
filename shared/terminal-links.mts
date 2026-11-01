// THE WEB ADDRESSES ON ONE ROW OF THE APP'S TERMINAL, for xterm's link provider
// (renderer/src/components/TaskTerminal.tsx), which opens them in the browser.
//
// The terminal had none, so `claude auth login`'s "If the browser didn't open,
// visit: https://..." was text you could not click (2026-10-05). That address
// is about 600 characters and wraps over many rows, so the search runs over the
// whole LOGICAL line, every row joined to the ones it wraps onto, and a link is
// handed back for any row it touches, with its range spanning all of them.
//
// IT LIVES IN `shared` SO IT CAN BE TESTED without a DOM: xterm's buffer is
// read through `at(y)`, which answers `{ text, wrapped }` for a 0-based row,
// `wrapped` being xterm's `isWrapped` (this row continues the one above).
// Ranges come back the way xterm takes them, 1-based and inclusive. One
// character is one cell, which holds for anything an address can contain.

// The scheme, at least one character after it, and none of the characters that
// end an address in prose.
const ADDRESS = /https?:\/\/[^\s"'<>`]+/g;
// Punctuation that closes the sentence around an address, not the address.
const TRAILING = /[.,;:!?)\]}'"]+$/;

/**
 * @param {(y: number) => ({ text: string, wrapped: boolean } | undefined)} at
 * @param {number} row 0-based
 * @returns {{ url: string, range: { start: { x: number, y: number }, end: { x: number, y: number } } }[]}
 */
export function linksAtRow(at, row) {
  if (!at(row)) return [];
  let top = row;
  while (top > 0 && at(top)?.wrapped && at(top - 1)) top -= 1;
  const rows = [at(top).text];
  for (let y = top + 1; at(y)?.wrapped; y += 1) rows.push(at(y).text);

  // Where each row starts in the joined string, to turn an index back into a
  // cell.
  const starts = [];
  let joined = '';
  for (const text of rows) { starts.push(joined.length); joined += text; }
  const cell = (i) => {
    let r = starts.length - 1;
    while (r > 0 && starts[r] > i) r -= 1;
    return { x: i - starts[r] + 1, y: top + r + 1 };
  };

  const out = [];
  for (const m of joined.matchAll(ADDRESS)) {
    const url = m[0].replace(TRAILING, '');
    if (!/^https?:\/\/./.test(url)) continue;
    const start = cell(m.index);
    const end = cell(m.index + url.length - 1);
    if (start.y > row + 1 || end.y < row + 1) continue;
    out.push({ url, range: { start, end } });
  }
  return out;
}
