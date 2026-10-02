// Two themes on one token set, and the invariant that makes that safe.
//
// A colour token defined in ONE theme has no symptom until you are looking at
// the other one: the declaration that names it is invalid, so the browser drops
// the whole property and draws nothing. Nothing errors, nothing logs, a border
// is simply absent. `--line-strong` was exactly this before light mode existed:
// used in nine places, defined in none, so nine borders had never rendered and
// nobody could see the bug because the design "looked quiet".
//
// So the suite reads the stylesheet rather than trusting review.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

// A SELECTOR MAY SHARE ITS BLOCK. Since the dark tokens answer for two
// selectors at once, `:root[data-theme="dark"], :root[data-skin]`, because a
// picture theme implies dark and the stylesheet now says so itself. So a block
// is found by looking for the selector in a comma-separated LIST rather than by
// looking for the exact string followed by a brace, which found nothing the
// moment the second selector was added and threw rather than passing.
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
const dark = definedIn(':root[data-theme="dark"]');

describe('every token exists in both themes', () => {
  it('defines the dark theme on an attribute the toggle can set', () => {
    expect(dark.size).toBeGreaterThan(10);
  });

  it('has no token that only light defines', () => {
    // --mono is type and --radius is shape; neither is colour, and a corner
    // that changed between themes would be a bug rather than a feature. Both
    // are deliberately inherited rather than restated; everything else must be
    // answered.
    // --tag-radius joined them for a sharper version of the same reason: a tag
    // is square in every theme AND under every skin, so it is declared exactly
    // once and re-declaring it anywhere is the bug.
    const SHARED = new Set(['--mono', '--radius', '--tag-radius']);
    const missing = [...light].filter((t) => !dark.has(t) && !SHARED.has(t));
    expect(missing).toEqual([]);
  });

  it('has no token that only dark defines', () => {
    expect([...dark].filter((t) => !light.has(t))).toEqual([]);
  });

  it('draws dark on night paper, her pick out of five', () => {
    // Option D, Night paper, from designs/2026-08-13-dark-mode-five-ways.html.
    // Dark mode was hard to see; the ink was never the problem (14.8:1), the
    // ground was. Every surface moved up into the mid greys.
    //
    // Two grounds are dead and must not come back: #212226, the old charcoal
    // withdrawn on 2026-08-12, and #16181c/#191c1f, the near-black that
    // replaced it.
    const dark = block(':root[data-theme="dark"]');
    expect(dark).toMatch(/--surface:\s*#2e3136/);
    expect(dark).toMatch(/--bg:\s*#24262a/);
    expect(dark).not.toMatch(/#212226|#16181c|#191c1f/);
  });

  it('steps the card UP off the page, in both themes', () => {
    // The defect: the dark card sat 1.9 L* BELOW the page
    // behind it, under the point where an edge registers, so the screen read
    // as one flat sheet with text floating on it. Light always stepped up.
    // Now both do. If a future palette inverts this again, the screen goes
    // flat again and nothing else in the suite would notice.
    const lightness = (hexColour) => {
      const rgb = [1, 3, 5].map((i) => parseInt(hexColour.slice(i, i + 2), 16));
      const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const y = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
      return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
    };
    for (const selector of [':root', ':root[data-theme="dark"]']) {
      const b = block(selector);
      const page = b.match(/--bg:\s*(#[0-9a-f]{6})/)[1];
      const card = b.match(/--surface:\s*(#[0-9a-f]{6})/)[1];
      expect(lightness(card) - lightness(page), `${selector}: the card must sit above the page`)
        .toBeGreaterThan(2);
    }
  });
});

describe('no raw colour outside the token blocks', () => {
  // Everything below the token blocks must go through a token, or it cannot
  // answer both themes. A white wash is invisible on a light ground and a
  // black shadow is a smudge on one.
  //
  // THERE IS A THIRD TOKEN BLOCK, and it is one element's:
  // `.doc-pane.doc-html`.
  //
  // A MARKDOWN FILE IS NOT IN THAT BLOCK AND MUST NOT BE.We draw every pixel of
  // a markdown file, so there is nothing to guess and it follows the window
  // like everything else.
  //
  // So this is a decision, not an escape hatch: the rules BELOW it still have to
  // go through a token, and the block's own values are pinned by "an html file
  // holds one dark in every theme" below.
  const docPaneAt = css.indexOf('.doc-pane.doc-html {');
  const rules = docPaneAt === -1
    ? css.slice(css.indexOf('* { margin: 0'))
    : css.slice(css.indexOf('* { margin: 0'), docPaneAt) + css.slice(css.indexOf('}', docPaneAt) + 1);
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

describe('an html file holds one dark in every theme, and markdown does not', () => {
  // TWO HALVES, TWO DECISIONS, A DAY APART ON THE SAME SURFACE.
  //
  // The header is the card's own ground, so pinning the ground pins the header.
  // THE SELECTOR GREW A CONDITION ON 2026-08-22 AND THE BLOCK DID NOT
  // MOVE.Everything in this block is dark's own value, so it never painted
  // anything in a dark window or in a picture theme; it existed to turn a LIGHT
  // window's side panel charcoal. The decision is that block not applying there,
  // so it applies to every theme that is NOT light and to nothing else.
  //
  // `data-doc-bar="held"` kept the old behaviour reachable for one round so the
  // before and after could be one picture. The round was settled and it
  // went with the rest of the set, which is why this is one selector now rather
  // than two. The test below pins what is left: a light window may not be in
  // this list unconditionally, or the fix is silently undone.
  const html = block(':root:not([data-theme="light"]) .doc-pane.doc-html');
  const pane = block('.doc-pane');

  it('does not turn a light window charcoal unless she asks for it back', () => {
    const at = css.indexOf(':root:not([data-theme="light"]) .doc-pane.doc-html {');
    const selectors = css.slice(css.lastIndexOf('*/', at) + 2, at + 60);
    // The unconditional half must exclude light by name. If this ever reads
    // `.doc-pane.doc-html` on its own again, every light window has its dark
    // bar back and nothing else in this file would notice.
    expect(selectors).toContain(':root:not([data-theme="light"]) .doc-pane.doc-html');
    const list = selectors.slice(0, selectors.indexOf('{')).split(',').map((x) => x.trim());
    expect(list).not.toContain('.doc-pane.doc-html');
    // Every selector that carries it must say WHEN, or it carries it always.
    for (const sel of list) expect(sel).toMatch(/^:root[:[]/);
  });

  it('grounds a dark file on the app own card, which is what light does', () => {
    // So dark grounds it on ITS --surface, and this test is written as that
    // equality rather than as a hex, so the two cannot drift apart.
    const dark = block(':root[data-theme="dark"]');
    const surface = dark.match(/--surface:\s*([^;]+);/)[1].trim();
    expect(dark.match(/--doc-page:\s*([^;]+);/)[1].trim()).toBe(surface);
    const light = block(':root');
    expect(light.match(/--doc-page:\s*([^;]+);/)[1].trim())
      .toBe(light.match(/--surface:\s*([^;]+);/)[1].trim());
    // THE LAKE SLATE IS THE FIFTH DEAD ONE, IN A WINDOW WITH NO LAKE IN IT.
    // #292f3a is --skin-solid, measured off the reply box in the lake
    // photograph. On a grey window it measured saturation 17 against the
    // window's 8, so the open file was the bluest surface on the screen. It
    // still lives in the lake block, which is where it came from.
    expect(dark).not.toMatch(/--doc-page:\s*#292f3a/);
    // The others that lost: the photograph running through the file, charcoal
    // #1a191b, black, and ink #101216.
    expect(html).not.toMatch(/#1a191b|#101216|#000000/);
  });

  it('holds one ground for an html file that every theme answers', () => {
    // An html file cannot follow the window, so it names --doc-page-held rather
    // than carrying a hex. The regression this catches: an html file and a
    // markdown file sitting on two different grounds inside the same window.
    expect(html).toMatch(/--doc-page:\s*var\(--doc-page-held\)/);
    for (const sel of [':root', ':root[data-theme="dark"]', ':root[data-skin="lake"]']) {
      expect(block(sel), sel + ' does not answer --doc-page-held')
        .toMatch(/--doc-page-held:\s*[^;]+;/);
    }
    // THE LAKE TAKES THE APP'S CARD TOO, WHICH WAS THE PICK AND THE SAME RULE
    // LIGHT AND DARK TAKE.Both are named rather than typed, so the lake cannot
    // drift from the surface its own cards are on; the lake block layers over
    // the dark token set, so this resolves to #2e3136.
    const lake = block(':root[data-skin="lake"]');
    expect(lake.match(/--doc-page:\s*([^;]+);/)[1].trim()).toBe('var(--surface)');
    expect(lake.match(/--doc-page-held:\s*([^;]+);/)[1].trim()).toBe('var(--surface)');
    // The slate was considered and not picked. It stays the reply
    // box's colour and it never comes back as the ground under a file.
    expect(lake).not.toMatch(/--doc-page(-held)?:\s*var\(--skin-solid\)/);
    expect(lake).toMatch(/--skin-solid:\s*#292f3a/);
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

  it(`gives html the dark theme own ink, so a light window cannot reach it`, () => {
    // Every one of these is the value :root[data-theme="dark"] declares. If the
    // dark theme moves, this says so rather than letting the pane drift into a
    // second palette nobody is maintaining.
    for (const token of ['--text', '--text-dim', '--text-faint', '--line', '--line-strong', '--bg-raised', '--accent']) {
      const mine = html.match(new RegExp(token + ':\\s*([^;]+);'));
      const theirs = block(':root[data-theme="dark"]').match(new RegExp(token + ':\\s*([^;]+);'));
      expect(mine, token + ' is not declared on the html pane').toBeTruthy();
      expect(mine[1].trim(), token + ' has drifted from the dark theme').toBe(theirs[1].trim());
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

// ---------------------------------------------------------------------------
// A PICTURE IMPLIES DARK, IN THE STYLESHEET.
//
// The shape of the bug: with `data-theme="light"` and
// `data-skin="lake"` on the same root, the lake block overrode --text-dim,
// --text-faint, --bg and the hairlines but NOT --text, so the photograph and
// the card stayed dark while every heading, agent name and button kept the
// light theme's near-black ink. Measured on the built renderer with
// The harness: the headline at 1.01:1 and the agent names
// at 1.31:1, against 6.76:1 for the description line under each name, which is
// --text-faint and therefore was overridden. That is why only some text was
// affected, and why it looked like half a bug.
//
// `lookMeans` in renderer/src/skins.ts has always refused to produce that pair
// and `setLook` is the only writer of either key, so nothing a user could click
// reached it. This makes it unreachable rather than merely unreached.

describe('a window wearing a picture takes the dark ink', () => {
  it('answers the dark tokens for [data-skin] too, except where the picture asked to be light', () => {
    const listed = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .map((m) => m[1].split(',').map((x) => x.trim().replace(/^[\s\S]*\*\//, '').trim()))
      .find((l) => l.includes(':root[data-theme="dark"]'));
    expect(listed, 'the dark token block is missing').toBeTruthy();
    // What the paragraph above this block protects is that the two keys cannot
    // DISAGREE, and that is untouched: `setLook` still writes both at once and
    // `lookMeans` still decides. A window is light here only when the store says
    // light, and the store says light only for a picture whose own entry asked.
    // The exact string is asserted so that widening this again has to be a
    // deliberate edit to this line rather than a selector nobody re-read.
    expect(listed).toContain(':root[data-skin]:where(:not([data-theme="light"]))');
    expect(listed, 'the bare selector is back, so no picture can be light')
      .not.toContain(':root[data-skin]');
  });

  it('does not outweigh the per-picture blocks it sits above', () => {
    // THIS SHIPPED BROKEN FOR ONE COMMIT ON 2026-09-04 AND IT IS THE REASON
    // THIS TEST EXISTS.
    //
    // The exception above was written as a bare `:not([data-theme="light"])`. A
    // bare :not COUNTS toward specificity, so the selector went from (0,2,0) to
    // (0,3,0) and started beating every `:root[data-skin="<id>"]` block in the
    // file, which are all (0,2,0) and win only by being later. Every dark
    // picture lost its wash and its photograph at once: measured in the built
    // renderer, Valley Haze computed `--skin-image: none` and `--skin-pane:
    // #2e3136`.
    //
    // `:where` has zero specificity, which is the fix. This measures the weight
    // rather than the spelling, so any other way of writing the exception is
    // allowed and any other way of getting it wrong is caught.
    const weigh = (sel) => {
      // Enough of a specificity counter for the selectors this app writes.
      // `:where` contributes nothing, including its contents, so it goes
      // first. `:not` and `:is` contribute nothing THEMSELVES but their
      // contents do, so the wrapper is unwrapped rather than dropped. What is
      // left is counted one each for attributes, classes and pseudo-classes,
      // which is the middle column of a specificity triple.
      const flat = sel
        .replace(/:where\([^)]*\)/g, '')
        .replace(/:(?:not|is)\(([^)]*)\)/g, '$1');
      return (flat.match(/\[[^\]]+\]/g) ?? []).length
        + (flat.match(/\.[\w-]+/g) ?? []).length
        + (flat.match(/:[a-z-]+/g) ?? []).length;
    };
    // THE COMMENT ABOVE THE BLOCK IS FULL OF COMMAS, so splitting the chunk
    // between two braces on ',' leaves prose in the list. The test above only
    // asks whether one string is present and never noticed; this one reads every
    // entry, so it keeps the ones that are actually selectors.
    const listed = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .map((m) => m[1].split(',').map((x) => x.trim().replace(/^[\s\S]*\*\//, '').trim()))
      .find((l) => l.includes(':root[data-theme="dark"]'))
      .filter((s) => s.startsWith(':root'));
    expect(listed.length, 'the dark block should list exactly its two selectors').toBe(2);
    const skinBlock = weigh(':root[data-skin="lake"]');
    for (const sel of listed) {
      expect(weigh(sel), `${sel} outweighs a picture's own block, so the picture cannot win`)
        .toBeLessThanOrEqual(skinBlock);
    }
  });

  // --text is the one this was actually about, so it is named rather than left
  // to the set comparison above to catch by accident.
  it('gives a picture --text and not only the dims and faints', () => {
    expect(dark.has('--text')).toBe(true);
    const lake = definedIn(':root[data-skin="lake"]');
    expect(lake.has('--text-faint'), 'lake still sets its own faint').toBe(true);
    expect(lake.has('--text'), 'lake does not need to restate --text').toBe(false);
  });
});
