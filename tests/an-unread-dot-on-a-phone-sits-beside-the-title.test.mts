// AN UNREAD DOT ON A PHONE SITS BESIDE THE TITLE.
//
// What broke (the founder's iPhone screenshot of the web app, 2026-10-26): the
// orange unread dot sat on the title's second line, over its first letter
// ("·testing", "·happened."). The desktop puts it at 13px from the row's left
// and half way down, which is the gutter beside a one-line row. On a phone the
// text starts at 16px and a title wraps to two lines, so 13px is inside the
// words and half way down is the second line. On a phone it now sits at 5px,
// level with the title's first line: the row's 14px top padding plus half of
// one 21.6px line (16px at 1.35), less half the 6px dot, is 21.8px.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const phone = fs.readFileSync(new URL('../renderer/src/phone.css', import.meta.url), 'utf8');
const pages = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
const rule = (src, sel) => {
  const at = src.indexOf(`${sel} {`);
  expect(at, `no rule for ${sel}`).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf('}', at) + 1);
};

describe('the unread dot', () => {
  it('on a phone is in the margin, level with the first line of the title', () => {
    const r = rule(phone, ':root:root:root .th-table .row.unread::before');
    expect(r).toMatch(/left: 5px;/);
    expect(r).toMatch(/top: 22px;/);
  });
  it('sits left of where the words start', () => {
    const left = Number(/left: (\d+)px/.exec(rule(phone, ':root:root:root .th-table .row.unread::before'))[1]);
    const textX = Number(/--text-x: (\d+)px/.exec(rule(phone, ':root:root:root .list'))[1]);
    expect(left + 6).toBeLessThan(textX);
  });
  // The first row is always the keyboard's pick on a phone, and the rule that
  // hides the pick's marker took the top row's dot with it (measured: 3 of 4
  // unread rows drew a dot).
  it('stays on the row the keyboard has picked', () => {
    expect(phone).toMatch(/\.row\.selected:not\(\.unread\)::before, :root:root:root \.row\.selected::after \{ display: none; \}/);
    expect(phone).not.toMatch(/:root:root:root \.row\.selected::before/);
  });
  it('and on the desktop stays where it was', () => {
    expect(rule(pages, '.th-table .row.unread::before')).toMatch(/left: 13px; top: 50%;/);
  });
});
