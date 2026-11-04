// A LINK IN THE TERMINAL OPENS IN YOUR BROWSER.
//
// What broke, 2026-10-05: adding a second Claude account runs
// `claude auth login` in the Settings terminal, and it prints "If the browser
// didn't open, visit: https://claude.com/cai/oauth/authorize?..." as plain
// text. The link was drawn blue and underlined by nothing but its own colour,
// and clicking it did nothing at all: the app's xterm had no link provider, so
// no address in it was ever clickable. That URL is about 600 characters, so at
// any width it wraps over several rows, and a link finder that reads one row
// at a time finds seven broken fragments instead of one address.
//
// Measured against the screenshot from the report: the address spans seven
// rows of a 78 column terminal, and the row after it ("Paste code here if
// prompted > Login successful.") is a new line, not a continuation.

import { describe, expect, it } from 'vitest';
import { linksAtRow } from '../shared/terminal-links.mts';

/** A fake xterm buffer: one entry per row, `wrapped` meaning the row continues
 *  the one above it, which is what xterm's `isWrapped` says. */
function buffer(rows) {
  return (y) => (y >= 0 && y < rows.length ? rows[y] : undefined);
}

/** Lay a long line out the way a terminal does, `cols` cells to a row. */
function wrap(text, cols) {
  const rows = [];
  for (let i = 0; i < text.length; i += cols) rows.push({ text: text.slice(i, i + cols), wrapped: i > 0 });
  return rows;
}

const URL = 'https://claude.com/cai/oauth/authorize?code=true&client_id=00000000-0000-0000-0000-000000000000&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=org%3Acreate_api_key+user%3Aprofile+user%3Ainference&code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge_method=S256&state=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

describe('a link in the terminal', () => {
  it('is found whole when it wraps over several rows, from any of them', () => {
    const lead = "If the browser didn't open, visit: ";
    const rows = [
      { text: 'Opening browser to sign in…', wrapped: false },
      ...wrap(lead + URL, 78),
      { text: 'Paste code here if prompted > Login successful.', wrapped: false },
    ];
    const at = buffer(rows);
    const first = 1;
    const last = rows.length - 2;
    expect(last - first).toBeGreaterThan(2);
    for (let y = first; y <= last; y += 1) {
      const links = linksAtRow(at, y);
      expect(links.map((l) => l.url)).toEqual([URL]);
    }
    // xterm's ranges are 1-based and inclusive: the address starts just after
    // the lead on the first row and ends on the last row of the wrap.
    const [link] = linksAtRow(at, first);
    expect(link.range.start).toEqual({ x: lead.length + 1, y: first + 1 });
    expect(link.range.end.y).toBe(last + 1);
    expect(link.range.end.x).toBe((lead + URL).length - (last - first) * 78);
  });

  it('is found on a row of its own, with the sentence around it left out', () => {
    const at = buffer([{ text: 'Visit https://example.com/a?b=1. Then come back.', wrapped: false }]);
    const [link] = linksAtRow(at, 0);
    expect(link.url).toBe('https://example.com/a?b=1');
    expect(link.range.start).toEqual({ x: 7, y: 1 });
    expect(link.range.end).toEqual({ x: 31, y: 1 });
  });

  it('finds every address on a row', () => {
    const at = buffer([{ text: 'http://a.test and (https://b.test/x)', wrapped: false }]);
    expect(linksAtRow(at, 0).map((l) => l.url)).toEqual(['http://a.test', 'https://b.test/x']);
  });

  it('does not run on into the next line when that line is not a wrap', () => {
    const at = buffer([
      { text: 'see https://a.test/x', wrapped: false },
      { text: 'yz and more', wrapped: false },
    ]);
    expect(linksAtRow(at, 0).map((l) => l.url)).toEqual(['https://a.test/x']);
    expect(linksAtRow(at, 1)).toEqual([]);
  });

  it('only answers for the row it was asked about', () => {
    const at = buffer([
      { text: 'https://a.test/one', wrapped: false },
      { text: 'plain words', wrapped: false },
    ]);
    expect(linksAtRow(at, 1)).toEqual([]);
  });

  it('is not anything that only looks like an address', () => {
    const at = buffer([{ text: 'claude.com and ftp://x.test and file:///etc and https:// alone', wrapped: false }]);
    expect(linksAtRow(at, 0)).toEqual([]);
  });

  it('answers nothing for a row that is not there', () => {
    expect(linksAtRow(buffer([]), 4)).toEqual([]);
  });
});
