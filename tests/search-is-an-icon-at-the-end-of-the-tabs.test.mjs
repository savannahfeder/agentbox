// SEARCH IS AN ICON AT THE END OF THE TABS (w-3c51d02de5, 2026-10-14).
//
// The header's right end had grown to Search, New thread, the cloud button
// and the filters button, and read as cluttered. Measured in
// renderer/src/threads/Pages.tsx: `HeaderActions` drew
// `<SearchGlyph /><span>Search</span>` as the first of those four. Of four
// drawn options the picked one takes the word away and moves the bare
// magnifier down to the right end of the Needs you / In progress row, so the
// header keeps only New thread, the cloud and the filters.
//
// The board view draws no tabs row, so there the bare magnifier stays in the
// header: Search must never be missing from a page that can search.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const pages = read('../renderer/src/threads/Pages.tsx');
const css = read('../renderer/src/threads/pages.css');
const app = read('../renderer/src/App.tsx');

/** One function's source, from its `export function` line to the next one. */
function fn(name) {
  const at = pages.indexOf(`export function ${name}(`);
  expect(at, `no ${name}`).toBeGreaterThan(-1);
  const next = pages.indexOf('\nexport function ', at + 1);
  return pages.slice(at, next < 0 ? undefined : next);
}

/** One JSX element in App.tsx, from `<Name` to its self-closing `/>`. */
function element(name) {
  const at = app.indexOf(`<${name}\n`);
  expect(at, `no <${name}> in App`).toBeGreaterThan(-1);
  return app.slice(at, app.indexOf('/>\n', at));
}

describe('the Search button wears no word', () => {
  it('draws the magnifier and nothing else', () => {
    const button = fn('SearchButton');
    expect(button).toContain('<SearchGlyph />');
    expect(button).not.toMatch(/<span>Search<\/span>/);
  });
  it('still says what it is to a screen reader and on hover', () => {
    const button = fn('SearchButton');
    expect(button).toContain('aria-label="Search threads"');
    expect(button).toContain('data-hint="search"');
  });
  it('and the word appears nowhere in the threads page', () => {
    expect(pages).not.toMatch(/<span>Search<\/span>/);
  });
});

describe('it sits at the right end of the tabs row', () => {
  it('the tabs draw it after the last tab', () => {
    const tabs = fn('StateTabs');
    // With a team on, the team's faces sit between the tabs and Search (w-b5f23cff71).
    expect(tabs).toMatch(/<\/div>\s*(\{team\?\.corner\}\s*)?\{onSearch && <SearchButton/);
  });
  // Only on a phone since w-33611c2122: on a desktop the sidebar's Search row
  // and ⌘K find threads (the-list-draws-no-magnifier-where-the-sidebar-searches).
  it('the inbox hands the tabs its search on a phone', () => {
    expect(element('StateTabs')).toMatch(/onSearch=\{searchInTheList\}/);
  });
  it('is pushed to the far right of the row', () => {
    expect(css).toMatch(/\.th-bar > \.th-search \{[^}]*margin-left: auto/);
  });
  it('is a square, not a word-wide strip', () => {
    expect(css).toMatch(/\n\.th-search \{[^}]*width: 32px/);
  });
});

describe('the header draws it only where there are no tabs', () => {
  it('the header asks for search only on the board', () => {
    // With a team on the board sits under the tabs, which carry search (w-2b3e1a85e5).
    expect(element('HeaderActions')).toMatch(/onSearch=\{!teamMode && inboxDisplay\.view === 'board' \? searchInTheList : undefined\}/);
  });
  it('and draws nothing when it is not asked', () => {
    expect(fn('HeaderActions')).toMatch(/\{onSearch && <SearchButton onSearch=\{onSearch\} \/>\}/);
  });
});
