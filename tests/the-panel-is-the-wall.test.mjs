// The panel is the wall, and the thing she opened is the object.
//
//   1. it was the only card on the screen
//   2. it carried the largest type in the window (29px, against a 21px title)
//   3. its labels were caps at 700, heavier than the task's own headings
//   4. its figures were the only half-bold numbers anywhere
//   5. its door was the only saturated pixel
//
// None of this touches WHAT the panel says. The dashboard's rule is asserted
// here too: an unmeasured number is still never a plausible figure, and it is
// now told apart by its words rather than by weight, which is the stronger of
// the two (a colour can be dimmed by a later change; the word "unmeasured"
// cannot).
//
// Asserted against the stylesheet because this repo has no DOM test
// environment (see shortcuts-swallow-their-key.test.mjs).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

// The body of one rule, by selector, so a value can be read without matching
// the whole file.
const rule = (selector) => {
  const i = css.indexOf(`\n${selector} {`);
  expect(i, `no rule for ${selector}`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

describe('nothing about the panel is lit', () => {
  it('gives it no card: no surface, no shadow, no radius', () => {
    const r = rule('.rail');
    expect(r).toMatch(/background:\s*transparent/);
    expect(r).toMatch(/box-shadow:\s*none/);
    expect(r).toMatch(/border-radius:\s*0/);
  });

  it('takes only the width its words need', () => {
    const width = Number(rule('.rail').match(/flex:\s*0 0 (\d+)px/)[1]);
    expect(width).toBeLessThan(384);
  });

  it('stands off the card and off the window edge by about the same air', () => {
    // (2026-08-13). Its left air is the body's 19px gap plus its own left
    // padding; its right air is the body's 22px margin plus its own right
    // padding. They were 41 and 22.
    const [, right, left] = rule('.rail').match(/padding:\s*30px (\d+)px 30px (\d+)px/).map(Number);
    const bodyRule = css.slice(css.indexOf('\n.body {'), css.indexOf('}', css.indexOf('\n.body {')));
    const gap = Number(bodyRule.match(/gap:\s*(\d+)px/)[1]);
    const margin = Number(bodyRule.match(/padding:\s*0 (\d+)px/)[1]);
    expect(Math.abs((gap + left) - (margin + right))).toBeLessThanOrEqual(6);
  });

  it('keeps its labels as words, not as bold caps', () => {
    // At 11px/700 caps they were heavier than the 12px/600 headings inside the
    // task, so the wall's labels shouted over the subject's.
    const r = rule('.rail-section-label');
    expect(r).toMatch(/text-transform:\s*none/);
    expect(Number(r.match(/font-weight:\s*(\d+)/)[1])).toBeLessThan(700);
  });

  it('has no figures in it at all any more', () => {
    // This used to check the four metric rows were unbolded, so they read as
    // lines rather than as a ledger. The rows came off on 2026-08-14: nothing
    // measured them, so each one printed "unmeasured" beside an instruction
    // to go connect something that does not exist yet.
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\.rail-row|\.rail-headline/);
  });

  // This used to read `.rail-shelf-go`, the "see everything →" door into the
  // made screen, and check it was grey rather than accent-blue at rest. The
  // door and the screen behind it went on 2026-08-19. The rule it stood for
  // outlives it, so what is checked now is that nothing in the panel is lit:
  // no rail rule paints itself the accent at rest.
  it('leaves no saturated pixel in it: nothing in the panel is lit at rest', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of bare.matchAll(/\n(\.rail-[a-z-]+|\.sibling-status)[^{]*\{([^}]*)\}/g)) {
      if (/:hover|\.s-claimed/.test(m[0])) continue;
      expect(m[2], `${m[1]} is lit at rest`).not.toMatch(/var\(--accent\)/);
    }
  });
});

describe('the thing she opened is the lit object', () => {
  it('fades the composer to the ground it sits on, not to something else', () => {
    // Both halves move together or the bottom third of every opened task is a
    // different white from the top: "there's a diff colored white background in
    // the second half of all the focused page" (2026-08-12).
    expect(rule('.focus-dock')).toMatch(/background:\s*var\(--surface\)/);
    expect(css).toMatch(/\.focus-dock::before \{[^}]*linear-gradient\(to bottom, transparent, var\(--surface\)\)/s);
  });
});

// ---------------------------------------------------------------------------
// AN OPENED TASK IS ONE SURFACE, AND THE WORDS ARE IN THE MIDDLE OF THE WINDOW.
//
// Design C, her pick 2026-08-13 on the same item: "take the card away works
// best, hands down. That also solves the full screen problem. But keep the UI
// for the inbox the same with the highlight thing."
//
// It reverses the card this file pinned onto the opened task earlier the same
// day, and that is deliberate, not drift. The card was put there to out-light
// the panel; the panel is unlit now, and what remained was a card so wide that
// the column of words inside it sat 170px left of the centre of the window.
//
// The centring is arithmetic, not a look, so it is pinned as arithmetic: the
// left padding on the pane must equal the panel's whole span, or the words
// drift off centre again by half of whatever the difference is.
describe('an opened task is one surface, centred on the window', () => {
  const flat = (selector) => rule(selector.startsWith('.app.flat') ? selector : `.app.flat ${selector}`);

  it('takes the card away: no surface step, no shadow, no corner', () => {
    // Stated, not omitted. The pane's base rule carries the LIST's card, so
    // leaving these out left a full-bleed pane rounding the window's own corners
    // and casting a shadow against nothing. Caught by measuring a built page.
    const r = flat('.list-pane.pinned');
    expect(r).toMatch(/background:\s*transparent/);
    expect(r).toMatch(/box-shadow:\s*none/);
    expect(r).toMatch(/border-radius:\s*0/);
  });

  it('makes the whole window the one surface she reads on', () => {
    expect(rule('.app.flat')).toMatch(/background:\s*var\(--surface\)/);
  });

  it('draws exactly two hairlines: under the tabs, and before the panel', () => {
    expect(flat('.topbar')).toMatch(/border-bottom:\s*1px solid var\(--line\)/);
    expect(flat('.rail')).toMatch(/border-left:\s*1px solid var\(--line\)/);
  });

  it('runs the surface to the window edges, so there are no double corners', () => {
    // The two foreheads: a ~11px window corner with a 14px card corner 22px
    // inside it drew two arcs at each end of the top edge.
    expect(flat('.body')).toMatch(/padding:\s*0;/);
    expect(flat('.body')).toMatch(/gap:\s*0/);
  });

  it('centres the column on the WINDOW, but never against the panel', () => {
    // The pane ends at the hairline, so a column auto-centred in it lands half
    // the panel's span too far left. A left padding of the full span moves it
    // back by exactly half. Any other number is an off-centre screen.
    // Both sides name --panel-span, so they cannot be edited apart.
    //
    // Two 72px gaps, one of them kept as a floor beside the panel.
    expect(rule('.app.flat')).toMatch(/--panel-span:\s*\d+px/);
    expect(flat('.rail')).toMatch(/flex:\s*0 0 var\(--panel-span\)/);
    expect(rule('.app.flat.panel-up .list-pane.pinned')).toMatch(
      /padding-left:\s*clamp\(0px, calc\(100% - var\(--panel-span\) - var\(--read-w\) - 144px\), var\(--panel-span\)\)/,
    );
  });

  it('keeps 72px of white between the words and the panel at every width', () => {
    // The gap is the thing her pick bought, so it is pinned as arithmetic
    // rather than as a look. Measured in the built renderer, both themes:
    // 1600 -> gutters 384/72, 1440 -> 224/72 (they were 410/46 and 296/0).
    const span = Number(rule('.app.flat').match(/--panel-span:\s*(\d+)px/)[1]);
    const read = Number(rule('.app').match(/--read-w:\s*(\d+)px/)[1]);
    const gap = Number(
      rule('.app.flat.panel-up .list-pane.pinned').match(/- var\(--read-w\) - (\d+)px/)[1],
    ) / 2;
    const pad = (w) => Math.min(span, Math.max(0, w - span - read - gap * 2));
    // The white left between the column's box and the hairline.
    const gutterRight = (w) => (w - span - pad(w) - read) / 2;
    for (const w of [1710, 1600, 1508, 1440, 1288]) expect(gutterRight(w)).toBeGreaterThanOrEqual(gap);
    // Below 1288 there is nothing spare left to keep it with, and the words
    // still come first: the padding is already 0 there.
    expect(pad(1280)).toBe(0);
  });

  it('never pays for the centring out of the line she reads', () => {
    // The clamp's middle term is what is left after the panel's span and the
    // sheet have been paid, so the sheet is paid first and the centring gets the
    // remainder. This app opens at 1440 and drags down to 980, where a flat span
    // would have taken 364px straight out of the words.
    const span = Number(rule('.app.flat').match(/--panel-span:\s*(\d+)px/)[1]);
    const read = Number(rule('.app').match(/--read-w:\s*(\d+)px/)[1]);
    const gap = Number(
      rule('.app.flat.panel-up .list-pane.pinned').match(/- var\(--read-w\) - (\d+)px/)[1],
    ) / 2;
    const pad = (w) => Math.min(span, Math.max(0, w - span - read - gap * 2));
    const columnAt = (w) => Math.min(read, w - span - pad(w));
    for (const w of [980, 1440, 1508, 1710, 2560]) expect(columnAt(w)).toBe(Math.min(read, w - span));
    // And exactly centred wherever there is room to be, which after her pick B
    // is 1652px up (the span twice, the sheet, and the two gaps). Her own
    // window is 1710. Below that the centring is what gives, never the words.
    const offsetAt = (w) => (pad(w) + (w - span)) / 2 - w / 2;
    expect(offsetAt(1710)).toBe(0);
    expect(offsetAt(span * 2 + read + gap * 2)).toBe(0);
    expect(offsetAt(1600)).toBe(-26);
  });

  it('sets the task and its composer on one sheet, named once', () => {
    expect(rule('.app')).toMatch(/--read-w:\s*\d+px/);
    expect(rule('.focus')).toMatch(/max-width:\s*var\(--read-w\)/);
    // The dock takes the sheet MINUS the sheet's own side padding, because
    // --read-w is the sheet and .focus spends 32px of each side of it on air.
    // Set to the full sheet, the reply card began 32px left of every word
    // above it (410 against 442, measured at her width).
    expect(rule('.focus-dock-inner')).toMatch(/max-width:\s*calc\(var\(--read-w\) - 64px\)/);
    const focusPad = Number(rule('.focus').match(/padding:\s*\d+px (\d+)px/)[1]);
    const dockTrim = Number(rule('.focus-dock-inner').match(/var\(--read-w\) - (\d+)px/)[1]);
    expect(dockTrim).toBe(focusPad * 2);
  });

  it('gives every run of words in an opened task ONE left edge and ONE right', () => {
    // Three left edges in one column, measured at her width before this went
    // in: reply card 410, the words 442, the file footer 460.
    //
    // The file footer that used to be the third edge is DELETED
    // (w-38d7d32c88, 2026-09-23), so there is no `.attached` rule to hold to
    // zero any more. What is left below the words is the frame, and it indents
    // from nothing either.
    expect(css).not.toMatch(/\n\.attached[ .{]/);
    // And the title fills the column. `balance` evens a wrapped heading's
    // lines, which on two lines ends BOTH of them where half the title fits;
    // `pretty` only protects the last line. Measured on her own title in the
    // built renderer: balance reached 935, pretty and plain wrap both 1155,
    // against a paragraph reaching 1155.
    expect(rule('.focus-title')).not.toMatch(/text-wrap:\s*balance/);
  });

  it('corrects nothing when there is no panel to correct for', () => {
    // With the panel down the pane IS the window and the column's own auto
    // margins already centre it. Measured at 0px offset before and after.
    expect(css).not.toMatch(/\n\.app\.flat \.list-pane\.pinned \{[^}]*padding-left/s);
  });

  it('does not re-flow one row of the panel', () => {
    // Its text column was 322 - 12 - 12 = 298px on the list, and it stays 298px
    // here: the span absorbs the 19px gap, the 22px window margin and the 1px
    // hairline, and hands the difference to the padding.
    const span = Number(rule('.app.flat').match(/--panel-span:\s*(\d+)px/)[1]);
    const [, top, right, , left] = flat('.rail').match(/padding:\s*(\d+)px (\d+)px (\d+)px (\d+)px/).map(Number);
    expect(span - 1 - Number(left) - Number(right)).toBe(298);
    expect(top).toBe(30);
  });

  it('keeps the panel standing off the hairline and the window by the same air', () => {
    // Her 2026-08-13 note, re-declared off the new edges: 31 and 34, not 41/22.
    const [, right, , left] = flat('.rail').match(/padding:\s*30px (\d+)px (\d+)px (\d+)px/).map(Number);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(6);
  });

  it('keeps the 44px under the composer that the card used to provide', () => {
    // (2026-08-13). It had 22px of its own padding inside a card whose own
    // margin was another 22px off the window. The card went; the air it stood
    // in does not go with it.
    const pad = Number(rule('.focus-dock').match(/padding:\s*0 32px (\d+)px/)[1]);
    expect(pad).toBe(44);
  });
});

describe('the inbox list is untouched', () => {
  // The two things that make it a card are the step off the page and the
  // shadow, and both are still pinned here. The corner is NOT one of them and
  // has moved twice: 14px until, then 0 until. It is the app's one token now,
  // so it cannot drift back to a number of its own.
  // tests/one-corner-for-the-whole- app.test.mjs owns that law; this file only
  // pins that the card is a card.
  it('is still a card, and its corner is the app standard', () => {
    const r = rule('.list-pane');
    expect(r).toMatch(/background:\s*var\(--surface\)/);
    expect(r).toMatch(/box-shadow:\s*var\(--shadow-card\)/);
    expect(r).toMatch(/border-radius:\s*var\(--radius\)/);
  });

  it('still sits in the frame, with its margins and its gap', () => {
    const r = rule('.body');
    expect(r).toMatch(/padding:\s*0 22px 22px/);
    expect(r).toMatch(/gap:\s*19px/);
  });

  it('still underlines the selected row, which is the highlight she means', () => {
    // Her pick 2026-08-12, out of eleven: the rule is on the TEXT, never a band
    // across the row. Nothing in design C goes near it.
    expect(css).toMatch(/\.row\.selected \.subject,\s*\n\.row\.checked \.subject \{ text-decoration-color: var\(--underline\); \}/);
  });
});
