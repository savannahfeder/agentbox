// Team and Files were plain while Home and the Inbox wore the sky, so the app
// read as two themes. Measured on the stand-in team (scripts/lib/groups-stage.mjs)
// with the dark orange sky: Team and Files had no sky at all. They now draw the
// Inbox's header sky, on dark skies only, and never on a phone.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');
const rule = app.match(/const skyOnPlace = [^;]*;/)?.[0] ?? '';

describe('Team and Files under a sky', () => {
  it('wear it on the Team place and on Files', () => {
    expect(rule).toContain('chatsPlaceShown');
    expect(rule).toContain('filesShown');
  });

  it('only on a dark sky, and never on a phone', () => {
    expect(rule).toMatch(/^const skyOnPlace = !!sky && sky\.dark && !onPhone\(\) &&/);
  });

  it('not on Connections', () => {
    expect(rule).not.toContain('connectionsShown');
  });

  it('draw the Inbox sky, the same one at the same height', () => {
    expect(app).toContain('{skyOnPlace && sky && <InboxSky art={sky.art} />}');
  });

  it('mark the window so the header rule goes and the Team list lets the sky through', () => {
    expect(app).toContain("${skyOnPlace ? ' sky-shown sky-place' : ''}");
    expect(css).toMatch(/\.app\.sky-place \.cx-list \{ background: transparent; \}/);
  });

  it('keep the sky the shape the Inbox wears', () => {
    expect(css).toMatch(/\.inbox-sky-head \{ transform: scaleY\(-1\);\n/);
  });
});

// On the green and purple skies the Inbox's dim tabs, Team's Today / Yesterday
// / This week and the board's New thread button sat on the bright streak:
// measured against the brightest tenth of the sky pixels under each word
// (scripts/scratch, text hidden, sky read off a screenshot), 12 of 213 words
// were under 3:1 and the worst was 2.3. With the halo and the filled controls
// none is under 4.5 and the worst is 4.6.
describe('words over any sky', () => {
  const inboxSky = fs.readFileSync(new URL('../renderer/src/home/InboxSky.tsx', import.meta.url), 'utf8');
  const halo = css.match(/\.app\.sky-shown:not\(\.home-shown\) > \.topbar :is\(h1, button\)[^{]*\{([^}]*)\}/);

  it('know the colour under the sky, and lose it when the sky goes', () => {
    expect(inboxSky).toContain("host.style.setProperty('--sky-under', art.bg)");
    expect(inboxSky).toContain("host.style.removeProperty('--sky-under')");
  });

  it('sit in a patch of that colour: the header, tabs, board headings, Team and Files', () => {
    expect(halo).not.toBeNull();
    for (const part of ['.tm-tab', '.th-col-h', '.td-top', '.fp-bar', '.fp-tools', '.cx-search', '.pl-head']) expect(halo![0]).toContain(part);
    // A button does not inherit a text shadow, so each one is named.
    expect(halo![0]).toContain(':is(button, input)');
    expect(halo![1]).toMatch(/text-shadow:[^;]*var\(--sky-under/);
  });

  it('fill the buttons and search boxes with it, leaving hover and an open menu alone', () => {
    expect(css).toMatch(/:is\(\.th-new, \.th-disp, \.fp-find, \.cx-search, \.pl-btn\):not\(:hover\):not\(\[aria-expanded="true"\]\) \{\s*background-color: color-mix\(in srgb, var\(--sky-under/);
  });

  it('only under a sky: Home and the plain looks are untouched', () => {
    expect(halo![0]).toMatch(/^\.app\.sky-shown:not\(\.home-shown\)/);
  });
});

describe('the Inbox sky itself', () => {
  it('is the one approved', () => {
    expect(app).toContain('{skyOnInbox && sky && <InboxSky art={sky.art} />}');
    expect(app).toMatch(/const skyOnInbox = [\s\S]*?!filesShown && !connectionsShown && !chatsPlaceShown && !evPick;/);
  });
});
