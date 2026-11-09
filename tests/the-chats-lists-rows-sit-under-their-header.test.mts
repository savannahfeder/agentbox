// "I still don't see the proper indentation under the AI teammates, people,
// etc. ... especially because it's a toggleable list? Not much, but enough
// that it looks really clean." Each row's picture started at 10 px, left of
// its header's words at 26 px (2 px of head, 6 of the fold button, a 12 px
// chevron and a 6 px gap), so the rows read as beside the header rather than
// under it. Measured on the stage at 1512 wide: header words at 143, row
// pictures at 127. Rows now start where their header's words do.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/teammates/teammates.css', import.meta.url), 'utf8');
const column = fs.readFileSync(new URL('../renderer/src/teammates/ChatsColumn.tsx', import.meta.url), 'utf8');
const rule = (sel) => { const at = css.indexOf(`${sel} {`); return at < 0 ? '' : css.slice(at, css.indexOf('}', at)); };
const px = (text, prop) => Number(new RegExp(`${prop}: ([0-9]+)px`).exec(text)?.[1]);
// The left of a `padding` shorthand: its fourth value, else its second, else its only one.
const leftOf = (text) => {
  const v = (/padding: ([^;]+);/.exec(text)?.[1] ?? '').trim().split(/\s+/).map((x) => Number.parseFloat(x));
  return v.length === 4 ? v[3] : v.length >= 2 ? v[1] : v[0];
};

describe('a row in the Chats list', () => {
  it('starts where its section header\'s words start', () => {
    const headWords = leftOf(rule('.cx-head')) + leftOf(rule('.cx-fold')) + 12 + px(rule('.cx-fold'), 'gap');
    expect(headWords).toBe(26);
    expect(px(rule('.cx-sec > .cx-row'), 'padding-left')).toBe(headWords);
  });

  it('is indented only inside a section, and the chevron is the 12 px one the sum assumes', () => {
    expect(column).toMatch(/const CHEVRON = \(open: boolean\) => <svg width="12" height="12"/);
    expect(column).toMatch(/return <div className="cx-sec" key=\{id\}>/);
    expect(rule('.cx-row')).toMatch(/padding: 0 10px;/);
  });
});
