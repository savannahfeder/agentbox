// THE WALK'S CARD STAYS WITH THE THING IT IS TALKING ABOUT, AND ⌘K STOPS GOING
// SILENT.
//
// Three defects were measured off the built walk at 1752x986 before anything
// was changed, by driving it with the keys a person would press and reading the
// app's own rectangles (scripts/shot-the-built-walk.mjs). Each of the three has
// a test here, and each test fails if the fix is undone.
//
//   1  THE CARD LEFT ITS RING. Distance from the edge of the ring to the edge
//      of the card, over the twenty one coached beats: 18px on fifteen of them,
//      then 99, 107, 182 and 256. The 256 is the clearing beat, where the ring
//      is on the first of four rows and the card sat under all four saying
//      "This one is finished".
//
//   2  ⌘K TAUGHT NOTHING. The palette opened and the card left the screen: nine
//      command rows, no sentence anywhere in the window, nothing saying how to
//      get out, on the one beat that exists to teach ⌘K.
//
//   3  THE SCHEDULED TAB HAD NO NAME. The tour rings the tab the next press
//      opens, by asking for a `data-tab`. That tab carried none, so the ring
//      fell back to the whole strip: 418 by 65, with the search glass and all
//      four tabs inside it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ANCHOR, COACHED, FLOOR, TEXT_GAP, UNDER, coach } from '../renderer/src/onboarding.ts';
import { NAME } from '../shared/product-name.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
/**
 * The source without its essays, for the assertions that say a rule is GONE.
 *  Every rule this walk has ever dropped is written up where it stood, quoting
 *  itself, so matching the prose would fail forever on the paragraph explaining
 *  the removal. Same guard `the-walk-holds-her-to-the-beat` uses. */
const wiring = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ---------------------------------------------------------------------------
// 1. THE CARD KEEPS ITS RING, BECAUSE THE LIST MOVES INSTEAD.
//
// The old rule was right about the problem it was solving. Hanging the card
// 18px under the first of four rows prints it across the second and third, and
// that was photographed too. So the choice was cover a row or leave the ring
// behind, and `UNDER` took the second. The third option is the list opening a
// gap: the rows AFTER the ringed one slide down by the height of the card, the
// card sits in the gap, and nothing is covered.
//
// WHAT THIS FILE CAN HOLD is the arithmetic and the wiring, because the sliding
// itself only exists in a window. The measurement of the real thing is in
// designs//the-flow-and-the-words/, shot on both sides of the fix.
describe('the gap the list opens', () => {
  const src = read('renderer/src/components/Onboarding.tsx');
  const css = read('renderer/src/styles.css');

  it('is never opened any more: the card is an overlay and the list does not move', () => {
    // w-ec62ab6b38: gap removed, the card floats over the rows below.
    // The card is not meant to move anything out of the way. So there is no
    // gap to size: ROOM_AIR and makeRoom are gone and every placement clears.
    expect(src).not.toContain('ROOM_AIR');
    expect(src).not.toMatch(/function makeRoom\b/);
    expect(src).not.toMatch(/\bmakeRoom\(/);
    expect(src).toMatch(/clearRoom\(\);\n\s*\};\n\s*measure\(\);/);
    expect(src).toContain('useLayoutEffect(() => {\n    clearRoom();\n  });');
    // The card still stands off its ring by the same air.
    expect(TEXT_GAP + FLOOR).toBe(28);
  });

  it('moves the rows AFTER the ringed one and never the ones above it', () => {
    // What is being read is the row and the words under it. Moving the list
    // above them would slide that pair off the place the eye is already on.
    expect(css).toContain('.list-pane .row[data-fr-room] ~ .row');
    expect(css).toContain('transform: translateY(var(--fr-room, 0px));');
  });

  it('opens on the two beats that ring one row out of a stack, and no others', () => {
    // These are exactly the beats `UNDER` was invented for. If a third one is
    // ever added to UNDER, this fails and whoever adds it has to say which
    // behaviour they meant.
    expect(Object.keys(UNDER).sort()).toEqual(['clear', 'snooze']);
    expect(src).toContain("makesRoom={(run.step === 'clear' || (run.step === 'snooze' && !picking))");
  });

  it('does not also walk the card down off the ink, which would chase the rows', () => {
    // The rows below the ring have moved down by the height of the card. If the
    // card then walked down off whatever ink it found, the next pass would move
    // the rows again from the card's new place and the two would go down the
    // window together.
    expect(src).toContain('if (g.below && !under && !makesRoom) {');
  });

  it('never marks a row or sets the depth, so nothing can slide', () => {
    // w-ec62ab6b38 (2026-09-28): the walk only removes the mark now, so the CSS slide never triggers.
    // The old test guarded a slide restarting five times a second; with no
    // writer left there is no slide to restart, only the eraser.
    expect(src).not.toMatch(/setAttribute\('data-fr-room'/);
    expect(src).not.toMatch(/setProperty\('--fr-room'/);
    expect(src).toContain("el.removeAttribute('data-fr-room')");
    expect(src).toContain("pane?.style.removeProperty('--fr-room')");
  });

  it('takes the gap away again when the walk stops', () => {
    expect(src).toContain('useLayoutEffect(() => () => clearRoom(), []);');
  });
});

// ---------------------------------------------------------------------------
// 2. THE LAST BEAT SPEAKS WHILE THE PALETTE IS OPEN.
//
// The rule that took the card away is hers and it stays: the walk does not draw
// over something she has opened. What was wrong is that the ring was on the ⌘
// button in the corner, OUTSIDE the palette, so the card correctly went quiet
// on the one screen the beat is for. Ringing the palette itself puts the card
// inside the thing it is talking about and leaves her rule alone.
describe('the ⌘K beat', () => {
  it('says nothing about the palette until the palette is up', () => {
    const shut = coach('command', 0, {});
    expect(shut.quiet).not.toContain('day ends');
    // WHAT IS THERE INSTEAD IS THE WAY BACK, which is hers off a tester's
    // onboarding and has nowhere else to go: the card is two lines, and the
    // other half of this beat is only read by somebody who pressed.
    expect(shut.quiet).toContain('type tutorial');
    // w-ec62ab6b38 (2026-09-28): her word for a row is thread now, not task.
    expect(`${shut.lead}${shut.tail}`).toBe('Press  to find any command, or N to start your first real thread.');
    expect(shut.key).toBe('⌘K');
  });

  it('says what the palette is for, and the one key that leaves it', () => {
    const open = coach('command', 0, { palette: true });
    expect(open.quiet).toBe(`Every command in ${NAME} is in this list.`);
    expect(open.key).toBe('esc');
  });

  it('is never the same card twice, because that reads as a screen that did not notice', () => {
    expect(coach('command', 0, { palette: true }).quiet)
      .not.toBe(coach('command', 0, {}).quiet);
  });

  it('rings the palette, and the palette before the key that opens it', () => {
    // AND THE PALETTE, NOT THE LIST INSIDE IT. `.palette-list` scrolls, so the
    // run of its children is the height of everything in it rather than the
    // height of what is on show: the ring came out 630 by 1449 in a 986 tall
    // window and ran off the bottom of the screen. Photographed once.
    expect(ANCHOR.command).toEqual(['.modal.palette', 'button[aria-label="Commands"]']);
    expect(ANCHOR.command[0]).not.toContain('palette-list');
  });

  it('stands the card off the palette rather than off the tab strip', () => {
    // The strip rule would drop the card on top of the commands: it covered the
    // search field and the first row of the list it was talking about.
    const src = read('renderer/src/components/Onboarding.tsx');
    expect(src).toContain("besideRing={run.step === 'command' && !!palette}");
    // `besideLeft` takes the bar to clear as an argument since 2026-08-28, so
    // the beat that teaches how a task ends can stand off its own buttons. The
    // palette branch is unchanged and this still fails if it is taken away.
    expect(src).toContain('left: besideRing ? Math.round(geo.ring.x + geo.ring.w + 26) : besideLeft(geo, besideOf),');
  });

  it('puts the ending beat above its ring instead, and clears it by measuring', () => {
    // IT STOOD BESIDE `.focus-actions button` FROM 2026-08-28 TO 2026-09-01,
    // and both halves of that rule are gone. The buttons went first, when she
    // had them taken out of the reading pane on 2026-08-27, and the beat's own
    // ring went with them: it pointed at `.focus-resolve` and therefore at
    // nothing, so no card was placed for the rule to apply to..
    //
    // The ring is the reply box now. It sits on the bottom edge of the window,
    // so `ring` flips the sentence above it rather than beside it, and there
    // are no neighbouring buttons left to stand off.
    const src = wiring('renderer/src/components/Onboarding.tsx');
    // The tab tour stands beside its ring except in the team layout, where a
    // card beside one tab sat on the tabs after it (2026-10-01).
    expect(src).toContain("beside={(run.step === 'where' && !teamStrip) || (run.step === 'command' && !!palette)}");
    expect(src).not.toContain("run.step === 'answer' ||");
    expect(src).not.toContain('.focus-actions button');
    expect(src).toContain('const all = [...document.querySelectorAll(sel)];');
  });

  it('and a card placed above its ring is lifted by its real height, not by an estimate', () => {
    // `ring` reserves ONE line above (`ty = y - TEXT_GAP - LINE_H`) and a card
    // is two lines and its own padding, so the flip alone leaves the bottom of
    // the sentence on top of the thing it is about. MEASURED on the first beat
    // ever to flip, at 1752x986: the ring on the reply box ran 885 to 955, the
    // card started at 845, and it printed 27 points inside the box the same
    // sentence invites her to type in. Driving the built walk after this
    // change: card 519,787 80 tall, ring top 885, `overDock` 0.
    //
    // Same rule as the window overhang directly above it, and for the same
    // stated reason: read the height off the card once it is on the screen, do
    // not guess at it twice.
    const src = read('renderer/src/components/Onboarding.tsx');
    expect(src).toContain('const onto = geo && !geo.below ? Math.round(box.bottom - (geo.ring.y - TEXT_GAP)) : 0;');
    expect(src).toContain('const over = Math.max(off, onto);');
    expect(src).toContain('lift(cardRef.current, geo);');
  });

  it('is still one of the coached beats', () => {
    expect(COACHED).toContain('command');
  });
});

// ---------------------------------------------------------------------------
// 3. EVERY TAB IS NAMED, BECAUSE THE TOUR ASKS FOR THEM BY NAME.
describe('the tab strip', () => {
  const app = read('renderer/src/App.tsx');

  it('names the Scheduled tab the way the other three are named', () => {
    expect(app).toContain('data-tab="snoozed"');
    for (const tab of ['inbox', 'progress', 'done', 'snoozed']) {
      expect(app, `${tab} tab`).toContain(`data-tab="${tab}"`);
    }
  });

  it('leaves the whole strip as the floor and never as the target', () => {
    // The whole list of tabs is what the ring falls back to for the render
    // between two views where neither is up yet. It is not a thing to point
    // at: a ring round everything says nothing about where the press goes,
    // which is the only thing that beat is for.
    // The sidebar's list comes first since w-ec62ab6b38 (2026-09-28), because
    // the sidebar is what the walk draws now; `.tabs` is the last floor.
    // The team layout's own strip leads since 2026-10-01: there the sidebar
    // holds only Inbox and Team, so it is not the strip the tour is about.
    expect(ANCHOR.where).toEqual(['.th-bar .tm-tabs', '.workspace-navigation .workspace-tabs', '.tabs']);
    const src = read('renderer/src/components/Onboarding.tsx');
    // `goingTo` was called `nextTab` until 2026-09-02, when the working out
    // behind it moved into ../onboarding so the card's own sentences could be
    // drawn off the same answer as the ring. Same ring, and the name it gave
    // up is now the shared function's.
    // The sidebar's own row is rung first, the old strip's tab after it.
    // And the team strip's own tab before both, found by its place (`teamTab`).
    expect(src).toContain('[...(teamTab(goingTo) ? [teamTab(goingTo) as string] : []), `.workspace-navigation [data-tab="${goingTo}"]`, `.tabs .tab[data-tab="${goingTo}"]`, ...ANCHOR.where ?? []]');
    expect(src).toContain("const goingTo = run.step === 'where' ? nextTab(tabs, view) : null;");
    // And the card stands off the sidebar's right edge on that beat.
    expect(src).toContain("besideOf={run.step === 'where' ? '.workspace-navigation, .tabs' : undefined}");
  });
});
