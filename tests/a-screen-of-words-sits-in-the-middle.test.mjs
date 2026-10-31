// A SCREEN OF WORDS SITS IN THE MIDDLE.
//
// What broke (2026-10-26, the founder's screenshot of the web app at laptop
// size): "Connect your computer" sat at the left of a 720px column, "super far
// left, sort of almost arbitrarily placed. The grouping of this content is fine
// but the group is placed in the wrong place." Any screen that is only words
// goes in the middle of the space under the tabs: the connect steps as one
// group, still left-aligned inside; an empty tab's line; a tab the filters
// emptied; and "Nothing needs you" on a phone, where it shows without its
// composer. Measured in Chromium (scripts/scratch) as the group's centre
// against the pane's centre; pinned here on the rules that place it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('renderer/src/threads/pages.css');
const phone = read('renderer/src/phone.css');
const pages = read('renderer/src/threads/Pages.tsx');

describe('words-only screens are centred', () => {
  it('the connect steps are one group, centred, left-aligned inside', () => {
    expect(pages).toMatch(/<div className="th-connect-group">[\s\S]*<h2>Connect your computer<\/h2>[\s\S]*<\/ol>[\s\S]*Use another account[\s\S]*<\/div>\s*<\/div>;/);
    expect(css).toMatch(/\.th-start > \.th-connect-group \{[^}]*width: fit-content;[^}]*align-self: center;/);
  });

  it('each sits between equal sides, so the middle is the pane\'s middle', () => {
    // Measured: 32px on the left and 24px on the right put the group 4px right of centre.
    expect(css).toMatch(/\.th-clear\.th-start\.th-connect \{ padding-left: 24px; padding-right: 24px; \}/);
    expect(css).toMatch(/\.th-empty \{[^}]*padding: 32px 24px 12vh;/);
    expect(css).toMatch(/\.th-clear\.th-clear-filtered \{[^}]*padding: 40px 24px 12vh;/);
  });

  it('an empty tab\'s line is in the middle of the pane', () => {
    // The words moved into ./page-rules (`emptyTabWords`) so a test can read
    // them; what is checked here is still that one span sits in the pane.
    expect(pages).toMatch(/<div className="th-empty"><span>\{emptyTabWords\([^)]*\)\}<\/span><\/div>/);
    expect(css).toMatch(/\.th-empty \{[^}]*flex: 1;[^}]*align-items: center;[^}]*justify-content: center;[^}]*text-align: center;/);
  });

  it('a tab the filters emptied is in the middle of the pane', () => {
    expect(css).toMatch(/\.th-clear\.th-clear-filtered \{[^}]*flex: 1;[^}]*align-items: center;[^}]*justify-content: center;[^}]*text-align: center;/);
  });

  it('the pane is a column for each of them', () => {
    expect(css).toMatch(/\.list-pane:has\(> \.th-start\), \.list-pane:has\(> \.th-empty\), \.list-pane:has\(> \.th-clear-filtered\) \{ display: flex; flex-direction: column; \}/);
  });

  it('on a phone, "Nothing needs you" alone is centred', () => {
    expect(phone).toMatch(/\.th-start:not\(\.th-connect\) > h2 \{ text-align: center; \}/);
  });
});
