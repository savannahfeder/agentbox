// One left edge for every word in the list.
//
// The founder caught the mockups indenting row titles about 27px past the group
// label and the hairline above them, at a glance, before anything else in the
// design: "though note that the indentation on the rows is a little weird in
// the images, make sure they're correctly left aligned" (2026-08-12).
//
// The reason it is worth a test rather than an eye: the title's left edge is
// not a padding, it is the SUM of three things (the gutter the select box sits
// in, the box's own width, and the flex gap after it), while the group label's
// is a single padding. Two numbers that agree today and are changed in
// different places is exactly how the drift happens again, and it is a defect
// nobody notices in a diff.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
const list = fs.readFileSync(path.join(root, 'renderer/src/components/List.tsx'), 'utf8');

function px(re) {
  const m = css.match(re);
  expect(m, `no match for ${re}`).toBeTruthy();
  return parseFloat(m[1]);
}

describe('the list has one text edge', () => {
  const gutter = px(/--gutter:\s*([\d.]+)px/);
  const textX = px(/--text-x:\s*([\d.]+)px/);
  const markWidth = px(/\.mark \{[^}]*?width:\s*([\d.]+)px/s);

  it('starts the row text and the day label at the same variable', () => {
    // Both name --text-x, so there is one number to change rather than two
    // paddings that agree today.
    expect(css).toMatch(/\.row \{[^}]*padding:[^;]*var\(--text-x\)/s);
    expect(css).toMatch(/\.day-label \{[^}]*padding:[^;]*var\(--text-x\)/s);
  });

  it('keeps the select box out of the flow, inside that padding', () => {
    // In the flow the box pushed every title 22px further in and the founder
    // asked why the day label sat so far from the card's edge. Out of flow it
    // costs the text nothing, but only if it still FITS in the padding it is
    // positioned inside, or it overlaps the first letter.
    expect(css).toMatch(/\.mark \{[^}]*position: absolute[^}]*left: var\(--gutter\)/s);
    expect(gutter + markWidth).toBeLessThanOrEqual(textX);
  });

  it('puts the box on the gutter line, not 2px inside it', () => {
    // The founder photographed a select-all: "It doesn't feel properly aligned
    // when you have these rows selected" (w-d72ba17a60, 2026-09-23). The box
    // was centred in its 18px hit square, so it sat at 10px while every
    // hairline in the list starts at 8px, and a ticked row was the only thing
    // in the card disagreeing with that edge. `left: 0` inside the square IS
    // the gutter. Centring it again would put the 2px back.
    expect(css).toMatch(/\.mark \.box \{[^}]*position: absolute; left: 0;/s);
  });

  it('puts the box on the middle of the title’s capitals', () => {
    // Measured on the real row before the change: the box's middle sat 2.51px
    // low. 21.5 measures back at 0.01px, and the box rides 2px below this
    // number because it is vertically centred in the 18px square. A round 24
    // or 22 is the drift this catches.
    expect(px(/\.mark \{[^}]*?top:\s*([\d.]+)px/s)).toBe(21.5);
  });
});

describe('a row is padded evenly to the eye', () => {
  // Two different bugs live here, and the fix for the first nearly caused the
  // second.
  //
  // ONE: a row after a day label used to give up its top padding to make room
  // for the label, so it had 11px above the title and 26px below the summary.
  // Invisible until a row was selected and drew a panel around it. Group
  // spacing belongs to the LABEL's own margins, never to the row's padding.
  //
  // THE FOUNDER OVERRULED HALF OF ONE ON 2026-09-24 (w-ad426c52ae) AND THE BAN
  // THAT USED TO BE THE LAST TEST HERE IS GONE. She picked a twelve-point gap
  // below a group label out of five, and twelve is not reachable from the
  // label's margins: the row's own top padding is 19, so the label would need a
  // negative margin to get there. The row gives it up again, at 9.
  //
  // What made ONE a bug was never the lopsided row on its own, it was the panel
  // that drew a box around it and showed the lopsidedness. There is no panel any
  // more: a selected row is an underline under its title and nothing else, by
  // her pick of 2026-08-12, and styles.css draws no background, border or box on
  // .row.selected at all. Checked before this was relaxed rather than assumed.
  // What survives is the bound below, so the give-back can never go so far that
  // a first row reads as a different shape from the rows under it.
  //
  // TWO: equal padding numbers do not look equal. A line box leaves more air
  // under a descender than over a cap, so 22/22 read as "the chin of these
  // rows is a little bigger than their foreheads" (2026-08-12). Optical
  // balance needs the bottom number slightly SMALLER, which is why this
  // asserts a bounded difference in one direction rather than equality.
  const m = css.match(/\.row \{[^}]*padding:\s*([\d.]+)px\s+var\(--row-r\)\s+([\d.]+)px/s);

  it('pads the bottom a little less than the top, never more', () => {
    expect(m, 'row padding shorthand not found').toBeTruthy();
    const top = parseFloat(m[1]);
    const bottom = parseFloat(m[2]);
    expect(bottom).toBeLessThanOrEqual(top);
    expect(top - bottom).toBeLessThanOrEqual(6);
  });

  // The row under a label may give up top padding, but not all of it, or its
  // title sits on the label and the row stops looking like a row. Her five
  // options bottomed out at 8 points of gap and she picked twelve, so the floor
  // here is deliberately below what she chose and above nothing at all.
  it('lets a row after a day label give up top padding, but not all of it', () => {
    const relaxed = css.match(/\.day-label \+ \.row \{ padding-top: ([\d.]+)px/);
    if (!relaxed) return;
    const top = parseFloat(m[1]);
    expect(parseFloat(relaxed[1])).toBeGreaterThanOrEqual(4);
    expect(parseFloat(relaxed[1])).toBeLessThan(top);
  });
});

describe('the selected row is underlined, and nothing else', () => {
  // ELEVEN treatments were built and rejected across two families before she
  // picked this (2026-08-12): a full-bleed tint, a tinted panel, an outline
  // ring, an edge rule, a gutter dot, bracketed hairlines, a whisper tint, and
  // four ways of varying the ink.
  //
  // The rule is drawn on the TEXT, so it is as wide as the words are and never
  // a band across the card.
  it('draws the rule on the text, never on the row', () => {
    expect(css).toMatch(/\.row\.checked \.subject \{ text-decoration-color: var\(--underline\)/);
    // The panel every rejected treatment painted into is gone with them, so
    // there is nothing left for a future one to reach for by habit.
    expect(css).not.toMatch(/\.row::before/);
  });

  it('answers hover with the same mechanism at a lower strength', () => {
    // One idea at two weights, so a row under both the pointer and the
    // keyboard is read once, not twice.
    expect(css).toMatch(/\.row:hover \.subject \{ text-decoration-color: var\(--line-strong\)/);
  });

  it('keeps the rule off the accent, in both themes', () => {
    // At full accent it was "a little less strong colored, though still
    // visible", and it competed with the unread blue, which is a different
    // fact and the only colour this app really spends.
    const light = css.slice(css.indexOf(':root {'), css.indexOf(':root[data-theme="dark"]'));
    const dark = css.slice(css.indexOf(':root[data-theme="dark"]'));
    expect(light).toMatch(/--underline: rgba\([^)]*0\.\d+\)/);
    expect(dark.slice(0, dark.indexOf('}'))).toMatch(/--underline: rgba\([^)]*0\.\d+\)/);
  });

  it('leaves no trace of the ten she turned down', () => {
    // The switcher that offered them is deleted, and so is every attribute it
    // keyed off. A rule left behind for an option nobody can select is dead
    // weight the next person has to reason about.
    expect(css).not.toMatch(/data-select|data-compose/);
  });

  it('is written once and answers both themes through tokens', () => {
    const perTheme = css.match(/:root\[data-theme="dark"\][^{]*\.row[^{]*\{/g) ?? [];
    expect(perTheme).toEqual([]);
  });
});

describe('the list spends no colour on itself', () => {
  it('marks unread rows in no way at all', () => {
    // (2026-08-12).
    expect(css).not.toMatch(/--unread/);
    expect(css).not.toMatch(/\.row\.unread/);
    expect(list).not.toMatch(/unseen|'unread'/);
  });
});

// These two describes replace the ones that guarded the headline figure, the
// four metric rows and the "Next move" line: how the em dash was dimmed, that
// the figure never grew larger than the title beside it, that no tinted panel
// came back. All of it went on 2026-08-14 when she took the whole block off —
// "get rid of the section from 'Six Steps to Launch' up to 'Next Move'. It'll
// only give the name, the description, and what it has made" — so the rules
// they protected no longer exist to be broken. What is worth guarding now is
// the shorter rail itself.
describe('the panel says what it still says', () => {
  const rail = fs.readFileSync(path.join(root, 'renderer/src/components/Rail.tsx'), 'utf8');
  // Comments carry her quoted reasons and name the classes; strip them, or
  // this reads the explanation of the removal as the removal undone.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const markup = rail.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // AND WHAT IT NO LONGER SAYS. The negative half is the half worth keeping: a
  // later session that re-adds either one breaks this test rather than quietly
  // restoring something she deleted. THE DESCRIPTION IS STILL HERE, it just is
  // not a line of its own any more.So `.rail-oneliner` is gone and the
  // one-liner is handed to the note, which draws it in the same place and lets
  // her change it. A later session that puts the uneditable line back breaks
  // this rather than quietly undoing what she asked for.
  it('renders the name, the description and the live agents, and nothing it has made', () => {
    expect(markup).toMatch(/rail-product/);
    expect(markup).not.toMatch(/rail-oneliner/);
    expect(markup).toMatch(/oneLiner=\{/);
    expect(markup).toMatch(/<RailNote/);
    expect(markup).toMatch(/Active agents/);
    expect(markup).toMatch(/rail-agent-said/);
    expect(markup).not.toMatch(/Also open|rail-sibling|sibling-status/);
    expect(markup).not.toMatch(/What it has made|see everything|rail-artifact|ShelfDigest/);
    expect(bare).not.toMatch(/\.rail-artifact|\.rail-shelf-go|\.ra-title/);
    expect(bare).not.toMatch(/\.rail-sibling|\.sibling-status/);
  });

  it('renders no headline figure, no metric rows and no next move', () => {
    // The reason is not taste, it is that nothing feeds them: every row printed
    // "unmeasured" beside an instruction to connect analytics or payments, and
    // there is no connector screen to send anyone to yet.
    expect(markup).not.toMatch(/rail-headline|rail-rows|rail-row-|rail-intent/);
    expect(markup).not.toMatch(/Next move/);
  });

  it('leaves no styling behind for them either', () => {
    expect(bare).not.toMatch(/\.rail-headline|\.rail-rows|\.rail-row|\.rail-intent|\.rail-quiet/);
  });

  it('still asks the fold for the description, and for nothing else', () => {
    expect(markup).toMatch(/api\.dashboard/);
    expect(markup).not.toMatch(/railHeadline|railRows|railValue|railIntent/);
  });
});

describe('the rail head carries the name and nothing else', () => {
  const rail = fs.readFileSync(path.join(root, 'renderer/src/components/Rail.tsx'), 'utf8');

  it('has no stage pill and no live dot', () => {
    // (2026-08-12). Both were blue, both were permanent, and neither answered
    // a question she was asking of this panel.
    expect(rail).not.toMatch(/rail-stage|rail-live/);
    expect(css).not.toMatch(/\.rail-stage|\.rail-live/);
  });

  it('does not still compute whether a session is live for it', () => {
    // The prop went with the dot. A value threaded through three components to
    // render nothing is the kind of thing that survives for a year.
    expect(rail).not.toMatch(/live\?: boolean/);
  });
});

describe('the panel stays quieter than the task beside it', () => {
  // What survives from the headline's own rule. The figure that broke it is
  // gone; the ceiling it was measured against is the thing to keep, so nothing
  // new in here can climb over the title again.
  it('carries no type larger than the opened task title', () => {
    const title = Number(css.match(/\.focus-title \{[^}]*font-size:\s*([\d.]+)px/s)[1]);
    const sizes = [...css.matchAll(/\.rail[\w-]*[^{}]*\{[^}]*font-size:\s*([\d.]+)px/gs)]
      .map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThan(title);
  });

  it('offers no other presentation, now that she has picked one', () => {
    expect(css).not.toMatch(/data-headline/);
  });
});
