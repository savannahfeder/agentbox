// ⌘K HAS A DOOR YOU CAN SEE, AND SEARCH MOVED OUT OF THE WAY TO MAKE ROOM.
//
// Four doors were drawn. And in the same breath, the objection that held the
// build for a day: "it ends up being a bit cluttered in the top-right corner…
// Search is specifically related to the item, whereas everything else here is
// more general settings."
//
// Three facts in that answer are worth a test rather than an eye, because each
// of them is a thing a later session would "tidy" straight back:
//
//   THE ORDER OF THE CORNER IS HERS. Plus, then ⌘, then the cog. The drawing
//   she approved had the ⌘ on the left and she moved it herself.
//
//   THE MAGNIFIER IS IN THE TAB ROW, NOT THE CORNER. That is the whole of what
//   the placement round decided, and the corner going back to four marks is the
//   clutter she objected to.
//
//   THE ⌘ MARK CARRIES NO LABEL. `Commands` beside it was option A and she
//   turned it down.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/styles.css');
const nav = read('renderer/src/components/WorkspaceNavigation.tsx');

const corner = app.slice(app.indexOf('<div className="topbar-right">'), app.indexOf('</header>'));
const tabNav = (() => {
  const start = app.indexOf('<nav\n          className="tabs"');
  return app.slice(start, app.indexOf('</nav>', start));
})();

describe('the corner is the three marks she named, in her order', () => {
  it('puts the plus on the LEFT of the ⌘ mark, which is the one edit she asked for', () => {
    const plus = corner.indexOf('aria-label="New thread"');
    const glyph = corner.indexOf('aria-label="Commands"');
    const cog = corner.indexOf('aria-label="Settings"');
    expect(plus, 'no plus in the corner').toBeGreaterThan(-1);
    expect(glyph, 'no ⌘ mark in the corner').toBeGreaterThan(-1);
    expect(plus).toBeLessThan(glyph);
    expect(glyph).toBeLessThan(cog);
  });

  it('holds it at three marks, because four is what she called cluttered', () => {
    // THE ROUND ON STOPPING AND FINISHING IS OPEN AND THREE OF ITS SEVEN LOOKS
    // PUT A MARK HERE (w-581dbc6cc4, 2026-09-22). They are switchable, they are
    // behind `stopLook()` in `renderer/src/stop-look.ts`, and `?look=` has to
    // be typed for any of them to draw. The count she settled is what this
    // corner holds on the default look, which is what the filter says: a
    // button whose line names one of the round's guards is not in the corner
    // she approved.
    //
    // WHEN SHE PICKS, the winner either stays out of this corner or this test
    // gains one more name, and `stop-look.ts` is deleted either way.
    const round = /stopInCorner\(\)|doneInCorner\(\)|versInMenu\(\)/;
    const labels = corner.split('\n').reduce((kept, line, i, lines) => {
      const found = line.match(/aria-label="([^"]+)"/);
      if (!found) return kept;
      const guard = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
      if (round.test(guard)) return kept;
      return [...kept, found[1]];
    }, []);
    expect(labels).toEqual(['New thread', 'Commands', 'Settings']);
  });

  it('has no magnifier left in it', () => {
    expect(corner).not.toContain('Search tasks');
    expect(corner).not.toContain('<SearchIcon />');
  });
});

describe('the door to ⌘K', () => {
  it('is a bare glyph and not the word she turned down', () => {
    const btn = corner.slice(corner.indexOf('aria-label="Commands"') - 400, corner.indexOf('aria-label="Commands"') + 500);
    expect(btn).toContain('<span className="cmd-glyph" aria-hidden="true">⌘</span>');
    // Option A was a control reading `Commands` with ⌘K printed beside it in
    // the app's own keycap, 121 points wide. She picked the glyph over it.
    expect(btn).not.toMatch(/<kbd>/);
    expect(btn).not.toMatch(/>Commands</);
  });

  it('opens the very palette the key opens, so there is only ever one', () => {
    expect(corner).toMatch(/aria-label="Commands"[\s\S]{0,400}onClick=\{\(\) => setModal\('palette'\)\}/);
    expect(app).toMatch(/\(e\.metaKey \|\| e\.ctrlKey\) && e\.key\.toLowerCase\(\) === 'k'[\s\S]{0,120}setModal\(\(m\) => \(m === 'palette' \? null : 'palette'\)\)/);
  });

  it('is a bare ⌘ mark that says ⌘K when she points at it', () => {
    // The button itself never grows a label: "A bare ⌘ in the corner family, no
    // label, no keycap, no border."
    expect(corner).toMatch(/aria-label="Commands"[\s\S]{0,300}<span className="cmd-glyph" aria-hidden="true">⌘<\/span>/);
    // AND IT CARRIES A HINT AGAIN SINCE 2026-09-24. It was left out on the rule
    // that a component already showing its key gets no plate, and she reported
    // the result: "When I hover over certain buttons, like the ones shown in
    // image 2, nothing happens." An icon of a ⌘ is a picture of a button, not a
    // statement that the chord is ⌘K.
    expect(corner).toMatch(/data-hint="commands"[\s\S]{0,160}aria-label="Commands"/);
  });

  it('draws the ⌘ as a character, not as a stroked icon', () => {
    const rule = css.match(/\.cmd-glyph \{[^}]*\}/s);
    expect(rule, 'no .cmd-glyph rule').toBeTruthy();
    expect(rule[0]).toContain('font-size: 18px');
    expect(rule[0]).toContain('font-weight: 400');
  });
});

describe('search stands at the head of the tab row', () => {
  it('is inside the nav, before the first tab', () => {
    const mag = tabNav.indexOf('aria-label="Search tasks"');
    const inbox = tabNav.indexOf("view === 'inbox' ? 'tab active' : 'tab'");
    expect(mag, 'no magnifier in the tab row').toBeGreaterThan(-1);
    expect(mag).toBeLessThan(inbox);
    expect(tabNav).toMatch(/className="icon-btn tab-search"/);
  });

  it('stands down while the field is up, because the field carries its own', () => {
    // The open field replaces the whole tab row and puts `.search-glyph` at the
    // same x=22 the button occupies, so nothing on screen moves on the click.
    expect(tabNav).toMatch(/\{search === null && <button\s*\n\s*className="icon-btn tab-search"/);
    expect(app).toMatch(/<span className="search-glyph"><SearchIcon \/><\/span>/);
  });

  it('keeps the 41 points of drift she accepted, and says so in numbers', () => {
    // 26 wide + the row's 26px gap − 11px of pull-back = the 41 points Inbox
    // moves off the card's left edge. Every one of those three numbers was
    // measured on the drawn app before she picked; changing one silently makes
    // the picture she approved a lie.
    const rule = css.match(/\.tabs \.tab-search \{[^}]*\}/s);
    expect(rule, 'no .tabs .tab-search rule').toBeTruthy();
    expect(rule[0]).toContain('width: 26px');
    expect(rule[0]).toContain('height: 26px');
    expect(rule[0]).toContain('margin-right: -11px');
    expect(css).toMatch(/\.tabs \{[^}]*gap: 26px/s);
  });

  it('leaves the magnifier with no hint, because it already prints one', () => {
    // The strip's hint slot is gone (w-2f7fac6027). The magnifier is also out
    // of the set that carries a plate at all: the search field it opens prints
    // / at its own right end, and her rule is that a component already showing
    // its key gets nothing. The nav around it carries the SECTIONS hint, which
    // is ⌘⌥↓ and ⌘⌥↑ and belongs to the four tabs.
    expect(app).not.toContain('className="tab-hint');
    expect(app).not.toContain('STRIP_HINTS');
    expect(tabNav).toMatch(/aria-label="Search tasks"[\s\S]{0,200}onClick=\{openSearch\}/);
    // The sections hint moved onto each TAB when the keys became ⌘1 to ⌘4, and
    // the tabs she actually sees are the sidebar's.
    expect(nav).toContain('data-hint={sectionHint(slot + 1)}');
  });
});
