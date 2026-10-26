// THE TRAY'S LIST GAINS "MOVE TO", AND IT OPENS INTO THE FOUR CORNERS
// (w-6da6d4ad24).
//
// Nobody knew the tray could be moved: QA filed it as a bug for covering
// another app's button. The design picked was "Move to" and a small screen
// with four dots in it, after Size; its dots were "too small to click
// reasonably", so pressing it should expand. It is one button, and it turns
// the list into the screen with a big button in each corner. A first build
// used a different design, a Place pill with four right angles, which was
// not the one picked; these checks hold the picked one.
//
// Measured by drawing the pieces to markup, and against the page and its
// stylesheet: one button after Size with the tray's own corner lit, three
// corners to press and the fourth saying where the tray is now, each big
// enough to hit.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MoveButton, PlacePicker, placeSpots } from '../renderer/src/corner-tag/place.tsx';

globalThis.React = React;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/main.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/corner-tag.css'), 'utf8');
const rule = (sel) => [...css.matchAll(new RegExp(`(?:^|\\n)${sel.replace(/[.[\]"()=:*]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(' ');
const draw = (el) => renderToStaticMarkup(el);
const count = (html, re) => (html.match(re) ?? []).length;

describe('"Move to", at the foot of the list', () => {
  const html = draw(React.createElement(MoveButton, { here: 'br', onOpen: () => {} }));

  it('says Move to, and the words and the small screen are one button', () => {
    expect(html).toContain('>Move to<');
    expect(count(html, /<button/g)).toBe(1);
    expect(html).toContain('aria-label="Move the tray to another corner"');
    expect(html.indexOf('Move to')).toBeLessThan(html.indexOf('ct-mini-screen'));
  });

  it('draws a small screen with four corners and lights only the one the tray is in', () => {
    for (const here of ['tl', 'tr', 'bl', 'br']) {
      const one = draw(React.createElement(MoveButton, { here, onOpen: () => {} }));
      expect(count(one, /class="ct-mini-corner/g)).toBe(4);
      expect(count(one, /ct-mini-corner is-here/g)).toBe(1);
    }
    expect(count(draw(React.createElement(MoveButton, { here: undefined, onOpen: () => {} })), /is-here/g)).toBe(0);
  });

  it('is not the Place pill that was built by mistake', () => {
    expect(html).not.toContain('Place');
    expect(html).not.toContain('ct-steps');
  });

  it('sits after Size and before Turn off, and is told the tray\'s corner', () => {
    const foot = page.slice(page.indexOf('<div className="ct-foot">'));
    const at = foot.indexOf('<MoveButton here={state.corner}');
    expect(at).toBeGreaterThan(foot.indexOf('<span className="ct-size">'));
    expect(at).toBeLessThan(foot.indexOf('ct-off'));
  });

  it('lights the corner in the tray\'s own apricot and leaves the rest quiet', () => {
    expect(rule('.ct-mini-corner.is-here')).toMatch(/fill:\s*var\(--ct-lat\)/);
    expect(rule('.ct-mini-corner')).toMatch(/fill:\s*var\(--ct-faint\)/);
  });
});

describe('what Place opens into', () => {
  for (const here of ['tl', 'tr', 'bl', 'br']) {
    it(`offers the other three corners, and says the tray is in ${here} now`, () => {
      const html = draw(React.createElement(PlacePicker, { here, tray: React.createElement('i', { id: 'tray' }), onPick: () => {}, onBack: () => {} }));
      // Back, and one button for every corner but its own
      expect(count(html, /<button/g)).toBe(1 + 3);
      expect(html).toContain('>Back<');
      expect(html).toContain('Move the tray to');
      expect(html).toMatch(new RegExp(`<div class="ct-spot ct-spot-${here} is-here"><i id="tray"></i><span>Here now</span></div>`));
      expect(html).not.toMatch(new RegExp(`<button class="ct-spot ct-spot-${here}"`));
    });
  }

  it('names the corners in plain words, in the order the screen lays them out', () => {
    expect(placeSpots('br').map((s) => [s.corner, s.name, s.here])).toEqual([
      ['tl', 'Top left', false], ['tr', 'Top right', false], ['bl', 'Bottom left', false], ['br', 'Bottom right', true],
    ]);
  });

  it('marks no corner as here when it does not know where the tray is', () => {
    expect(placeSpots(undefined).some((s) => s.here)).toBe(false);
  });

  it('moves the tray through the bridge, and Back only goes back', () => {
    expect(page).toMatch(/onPick=\{\(c\) => bridge\?\.place\(c\)\}/);
    expect(page).toMatch(/onBack=\{\(\) => setPlacing\(false\)\}/);
  });
});

describe('the corners are big enough to press', () => {
  it('makes each corner a button at least 36 points tall, laid out two by two', () => {
    const h = Number((rule('.ct-spot').match(/height:\s*calc\((\d+)px/) ?? [])[1]);
    expect(h).toBeGreaterThanOrEqual(36);
    expect(rule('.ct-screen')).toMatch(/grid-template-columns:\s*1fr 1fr/);
  });

  it('puts the mark on the side of the screen it stands for', () => {
    expect(rule('.ct-spot-tr, .ct-spot-br')).toMatch(/row-reverse/);
  });
});

describe('the list never reopens on the corners', () => {
  it('goes back to its threads when it shuts, and on Escape', () => {
    expect(page).toMatch(/bridge\?\.onOpen\(\(o\) => \{ if \(!o\) setPlacing\(false\); \}\)/);
    expect(page).toMatch(/if \(placing\) setPlacing\(false\); else bridge\?\.toggle\(\);/);
  });
});
