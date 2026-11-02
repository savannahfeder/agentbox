// THE BIG FILE VIEW SITS ON THE FILE PAGE AND KEEPS ITS VERSION CONTROLS IN THE TOP BAR.
//
// Opening v14 of a 15-version markdown file in the Ember theme, 2026-11-02:
// - the view was painted #1a1817, the window's near-black ground, while the
//   same file's card in Files and in a thread sits on #282625 (--doc-page);
//   both colours were read off full-window screenshots;
// - "v15 is the newest. Show v15" floated over the top of the document in a
//   band with `pointer-events: none`, so the button could not be pressed
//   (a Playwright click on it timed out), and sat flush against the sentence;
// - the byline under it said "Version 14" again, which the top bar already said;
// - "Side by side" drew in the monospaced tag font because it inherited the
//   version counter's font.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const css = read('renderer/src/components/artifact-view.css');
const view = read('renderer/src/components/ArtifactView.tsx');
const rule = (sel) => css.match(new RegExp(`(^|\\n)${sel.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';
const versionsGroup = view.match(/<span className="av-versions">([\s\S]*?)\n\s*<\/span>\n/)?.[1] ?? '';

describe('the big file view', () => {
  it('takes the file page colour as its ground, so everything that paints the ground follows', () => {
    expect(rule('.artifact-view')).toMatch(/--bg:\s*var\(--doc-page\)/);
  });

  it('offers the newest version from the top bar, as a button that can be pressed', () => {
    expect(versionsGroup).toMatch(/className="av-newest"[^\n]*>Show v\{/);
    expect(rule('.av-newest')).not.toMatch(/pointer-events:\s*none/);
  });

  it('no longer lays a "newest" band over the document', () => {
    expect(view).not.toMatch(/is the newest\./);
  });

  it('leaves the version number to the top bar, not the byline', () => {
    expect(view).not.toMatch(/`Version \$\{v\.n\}`/);
  });

  it('draws only the counter in the tag font, so Side by side is in the button font', () => {
    expect(rule('.av-versions')).not.toMatch(/--mono/);
    expect(rule('.av-of')).toMatch(/--mono/);
  });
});
