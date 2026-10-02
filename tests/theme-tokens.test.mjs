// One token set, and the invariants that keep it honest.
//
// A colour token that is named but never defined has no symptom: the
// declaration that names it is invalid, so the browser drops the whole property
// and draws nothing. Nothing errors, nothing logs, a border is simply absent.
// `--line-strong` was exactly this before light mode existed: used in nine
// places, defined in none, so nine borders had never rendered and nobody could
// see the bug because the design "looked quiet".
//
// There used to be two themes here and an invariant that every token was
// defined in both. The app went to one light look (w-9e434e8671), so the
// `:root` block is the only token block, and what is left to hold is that every
// token a rule names is declared there and that no raw colour leaks past it.
//
// So the suite reads the stylesheet rather than trusting review.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

// A SELECTOR MAY SHARE ITS BLOCK, so a block is found by looking for the
// selector in a comma-separated LIST rather than by the exact string followed
// by a brace.
function block(selector) {
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const list = m[1].split(',').map((x) => x.trim().replace(/^[\s\S]*\*\//, '').trim());
    if (list.includes(selector)) return m[2];
  }
  expect.fail(`${selector} block is missing`);
}

function definedIn(selector) {
  return new Set([...block(selector).matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
}

const light = definedIn(':root');

describe('the one token block', () => {
  it('is the only block that declares the colour tokens', () => {
    // No theme or picture block may come back and answer them a second time.
    expect(light.size).toBeGreaterThan(10);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/:root\[data-(theme|skin|machine)/);
    expect(css.match(/^\s*--text:/gm) ?? []).toHaveLength(1);
    expect(css.match(/^\s*--accent:/gm) ?? []).toHaveLength(1);
  });

  it('steps the card UP off the page', () => {
    // The defect, found on the old dark theme: the card sat 1.9 L* BELOW the
    // page behind it, under the point where an edge registers, so the screen
    // read as one flat sheet with text floating on it. Light always stepped
    // up. If a future palette inverts this, the screen goes flat and nothing
    // else in the suite would notice.
    const lightness = (hexColour) => {
      const rgb = [1, 3, 5].map((i) => parseInt(hexColour.slice(i, i + 2), 16));
      const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const y = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
      return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
    };
    const b = block(':root');
    const page = b.match(/--bg:\s*(#[0-9a-f]{6})/)[1];
    const card = b.match(/--surface:\s*(#[0-9a-f]{6})/)[1];
    expect(lightness(card) - lightness(page), 'the card must sit above the page')
      .toBeGreaterThan(2);
  });
});

describe('no raw colour outside the token block', () => {
  // Everything below the token block must go through a token, so a colour is
  // decided in one place. A white wash is invisible on a light ground and a
  // black shadow is a smudge on one.
  //
  // There used to be a second, one-element token block, `.doc-pane.doc-html`,
  // that held an html file dark. It went with the dark theme, so everything
  // after the token block is held to the rule.
  const rules = css.slice(css.indexOf('* { margin: 0'));
  // The prose is not the rules. This file's comments carry the measurements a
  // surface was drawn at, and half of those are colours; a hex inside /* */ has
  // never painted anything. Stripping them is what lets a comment say what a
  // value was without the comment itself failing this.
  const afterTokens = rules.replace(/\/\*[\s\S]*?\*\//g, '');

  it('has no bare white or black rgba in the rules', () => {
    expect(afterTokens.match(/rgba\((?:255, 255, 255|0, 0, 0)/g) ?? []).toEqual([]);
  });

  it('has no hardcoded hex colour in the rules either', () => {
    // The rgba check alone was not enough. `.dock-card` carried a literal
    // #26272c, so the reply composer stayed dark on the light theme, and a
    // screenshot showed parts of dark mode inside light mode. Four other
    // surfaces had the same bug, all
    // invisible until someone switched themes and scrolled to them.
    //
    // Four literals are allowed, and every one is a DOCUMENT rather than
    // chrome: an artifact's own page is white in both themes, and a
    // switched-off game screen is black in both.
    //
    // The last two are the reader's, and they are the same kind of thing one
    // step on. #ece7dd is the paper a PDF is painted onto and #15171b is the
    // dark room it is held in. Neither may follow the theme, for the reason a
    // photograph does not: the thing being looked at is the paper. It is white
    // brought down two steps because a true white page filling the screen in
    // the evening is a lamp, and the ground is darker than any Agentbox surface
    // so the page is the brightest thing on it. Both are named once in
    // renderer/src/reader-rules.ts, where the component reads them from, and
    // repeated in the stylesheet because a canvas needs a colour before it has
    // drawn anything.
    //
    // NOTHING ELSE IN THE READER IS A LITERAL HEX. Its ink is written as
    // rgb(240, 241, 243), which is `--text` on the dark theme, spelled out
    // rather than tokenised for the same reason: on a light theme `--text` is
    // nearly black, and nearly black on that ground is a control nobody sees.
    const allowed = new Set(['#fff', '#000', '#ece7dd', '#15171b']);
    const found = (afterTokens.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).filter((h) => !allowed.has(h));
    expect(found).toEqual([]);
  });

  it('names every token it uses', () => {
    const used = new Set([...afterTokens.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    // Geometry defined on the element that owns it rather than on a theme: the
    // row's edges on .list, and on .app the width of the sheet a task is set on
    // and the panel's span, which exist so the panel's width, the sheet and the
    // centring that pays for both cannot drift apart. --fill is the same kind:
    // how far along its own track one slider is, written by the component that
    // owns it, so the filled part of the track and the thumb cannot drift apart
    // the way a second element would. --doc-page and --doc-wash used to be
    // listed here, as the pane's own. There is no theme answer to "which way
    // does the fourteenth piece go". --wayout-top is geometry too: the middle
    // of an opened task's title on its FIRST line, derived from the topbar,
    // `.focus` and `.focus-head`. Two rules need it, one fixed to the window
    // and one pinned to the pane a topbar lower, and a literal in each of them
    // would drift. --wayout-top-flat and --quiet-strip are the same chain on an
    // OPENED task, where the 100px bar is a 34px drag strip instead: 66 was
    // read off the built app, and the rules pinned to the pane pay it less the
    // strip. They are variables because the literals in two files had already
    // drifted 2px apart. --fr-lift is geometry: how far the tether card is
    // pulled back onto the screen when it is taller than the ring assumed. It
    // rides in the same transform as --fr-drop and is a number of pixels, never
    // a colour. --fr-key-glow is one more of the same kind: how strongly the
    // walk's keycap glows when it answers a press, mixed off --text on the card
    // that owns it so the wrong-key pulse and the breathing cannot drift apart.
    // It is derived from a theme token rather than being one. --did-mark,
    // --did-gap and --did-hang are geometry on the thread, and the reason they
    // are variables at all is that the three of them are ONE number said three
    // ways: the mark box, the gap after it, and the distance the line hangs
    // left so the mark sits outside the reading column and every verb starts
    // where the user's own messages do. A literal in each place is how the machinery
    // ended up 16px right of the message column with nothing in the box holding
    // it there.
    const local = new Set(['--gutter', '--text-x', '--row-r', '--panel-span', '--read-w', '--fill', '--fr-drop',
      '--fr-drift', '--fr-fall', '--fr-spin', '--fr-key-glow', '--fr-lift',
      // How deep a gap the list opens under the row the walk is talking about,
      // so the card can sit 18px under its own ring instead of below the whole
      // stack. Geometry, and a variable rather than a literal because the depth
      // is the card's own measured height plus its air, which only the running
      // window knows: see `makeRoom` in components/ Onboarding.tsx. Same shape
      // as --fr-drop and --fr-lift above.
      '--fr-room',
      '--wayout-top', '--wayout-top-flat', '--quiet-strip',
      // How far the search line pulls back off the strip's right edge so it
      // still ends where the inbox card ends: 0 with the panel down, the rail
      // plus the body's gap with it up. Geometry, not colour, and a variable
      // because the two states that need it are set on .app while the line
      // that reads it is on the nav.
      '--search-rule-inset',
      // The height of the label line a tick on the import card has to sit in
      // the middle of, which is 18.75px next to a project name and 17.55px next
      // to an agent's. It is a variable because the rule that centres the box
      // is one rule and the two rows it serves are different sizes; measured, a
      // literal per row is how they ended up 2.79px apart.
      '--tick-line',
      // The two the header band on a task is built out of, shipped 2026-08-29.
      // Both are geometry and neither names a colour: the band's only colour is
      // --line, the hairline, which every theme answers.
      //
      // --keep-inset is the distance from a word to the edge of the pane, which
      // is half the leftover after a 780 point sheet plus that sheet's own 32
      // points of padding. The band's words and the band's hairline both start
      // at it, and a literal in each place is how they end up a pixel apart.
      //
      // --keep-lift is how far the title is pushed down inside the band so that
      // its first line sits level with the back chevron, less the 16 points the
      // whole header came up by on 2026-08-29. It differs between the
      // two screens because 17px and 20px have different line boxes. Every
      // reading is off the drawn screen.
      //
      // --keep-base, --keep-rise AND --keep-ground WERE HERE AND ARE GONE. The
      // first two were the halves of --keep-lift while the height was still a
      // dial with three stops on it; the third was a derived colour for the
      // looks that drew a tinted or a shadowed band. All three went when the
      // round was settled.
      '--keep-inset', '--keep-lift',
      '--did-mark', '--did-gap', '--did-hang']);
    expect([...used].filter((t) => !light.has(t) && !local.has(t))).toEqual([]);
  });
});

describe('an open file follows the light window, html and markdown alike', () => {
  // On 2026-08-22 the block that held an html file's side panel charcoal
  // stopped applying in a light window, and when the app went to one light
  // look (w-9e434e8671) that block went with the dark theme. What is pinned
  // now is that nothing brings a charcoal html pane back into the light window.
  const pane = block('.doc-pane');

  it('does not turn a light window charcoal unless she asks for it back', () => {
    // No rule may re-ink an html pane. If one ever does, every light window
    // has its dark bar back and nothing else in this file would notice.
    expect(css).not.toMatch(/\.doc-pane\.doc-html[^{]*\{[^}]*--(text|line|bg-raised|accent|doc-page)[\w-]*:/);
    expect(css).not.toContain('[data-doc-bar="held"]');
  });

  it('grounds a file on the app own card', () => {
    // Written as that equality rather than as a hex, so the two cannot drift
    // apart.
    const light = block(':root');
    expect(light.match(/--doc-page:\s*([^;]+);/)[1].trim())
      .toBe(light.match(/--surface:\s*([^;]+);/)[1].trim());
  });

  it('grounds a light window on a light page, which is the whole of her fix', () => {
    // The filed bug: in a light window the pane still drew slate. If this
    // ever reads #292f3a again, that is the same defect back.
    const lightPage = block(':root').match(/--doc-page:\s*(#[0-9a-f]{3,6})/)[1];
    expect(lightPage).not.toBe('#292f3a');
    // Light, not merely different. Well above the mid point.
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const rgb = [1, 3, 5].map((i) => parseInt(lightPage.slice(i, i + 2), 16));
    const y = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    expect(y, 'the light document page must actually be light').toBeGreaterThan(0.7);
  });

  it('leaves the pane itself declaring no ink, so markdown follows the window', () => {
    // THE REGRESSION THIS CATCHES IS THE ORIGINAL BUG. `.doc-pane` used to
    // carry the dark theme's eight values, which did nothing in a dark window
    // and forced dark in a light one. Anything reintroduced here hits markdown
    // in light mode again, which is exactly the bug that was filed.
    for (const token of ['--text', '--text-dim', '--text-faint', '--line', '--line-strong', '--bg-raised', '--accent', '--doc-page']) {
      expect(pane, token + ' is back on .doc-pane and light markdown is dark again')
        .not.toMatch(new RegExp('^\\s*' + token + ':', 'm'));
    }
  });

  it('keeps the card she picked, air and all', () => {
    const card = css.match(/\n\.doc-card \{[^}]*\}/)[0];
    // Card one, 08-21: 14 top, 16 right, 16 foot, 14 left, a 10px corner, a
    // hairline and no shadow. UNEVEN BY 2px ON PURPOSE: card two was that
    // correction, and card one was picked over it anyway.
    expect(card).toMatch(/margin:\s*14px 16px 16px 14px/);
    expect(card).toMatch(/border-radius:\s*10px/);
    expect(card).toMatch(/border:\s*1px solid var\(--line\)/);
    expect(card).not.toMatch(/box-shadow/);
  });
});
