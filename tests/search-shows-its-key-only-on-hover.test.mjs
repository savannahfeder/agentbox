// SEARCH SHOWS ITS KEY ONLY ON HOVER (w-facfc092e1, 2026-10-02).
//
// The rule: a keyboard shortcut is not printed on a control, it is shown on
// hover. The Search button at the right of the Inbox header printed a "/"
// after its word anyway, a stray mark between Search and New thread. Measured
// in renderer/src/threads/Pages.tsx: the button's markup ended
// `<span>Search</span><kbd>/</kbd>`, and pages.css carried a `.th-search kbd`
// rule to style it.
//
// What must still hold: hovering Search still says "/", through the hint
// plate (`data-hint="search"`, hint-plate.ts), so the key is not lost, only
// moved to where the rule puts it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const pages = read('../renderer/src/threads/Pages.tsx');
const css = read('../renderer/src/threads/pages.css');
const plate = read('../renderer/src/hint-plate.ts');

/** The Search button's whole opening tag and contents, up to its </button>. */
function searchButton() {
  const at = pages.indexOf('className="th-search"');
  expect(at).toBeGreaterThan(-1);
  const start = pages.lastIndexOf('<button', at);
  return pages.slice(start, pages.indexOf('</button>', at));
}

describe('the Search button prints no key', () => {
  it('has no keycap inside it', () => {
    expect(searchButton()).not.toMatch(/<kbd>/);
  });
  it('and no bare "/" after its word either', () => {
    expect(searchButton()).not.toMatch(/<\/span>\s*\/\s*$/);
  });
  it('still says Search, so it is only the key that went', () => {
    expect(searchButton()).toMatch(/<span>Search<\/span>/);
  });
  it('and the style for the keycap went with it', () => {
    expect(css).not.toMatch(/\.th-search kbd/);
  });
});

describe('hovering it still tells you the key', () => {
  it('carries the search hint', () => {
    expect(searchButton()).toMatch(/data-hint="search"/);
  });
  it('and that hint is the / key', () => {
    expect(plate).toMatch(/search:\s*\[\{\s*key:\s*'\/'/);
  });
});

describe('the rest of the header prints no key either', () => {
  // New thread's N lives in its hint and its tooltip, never on its face.
  it('New thread wears no keycap', () => {
    const at = pages.indexOf('className="th-new"');
    const button = pages.slice(pages.lastIndexOf('<button', at), pages.indexOf('</button>', at));
    expect(button).not.toMatch(/<kbd>/);
  });
});
