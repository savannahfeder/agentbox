// THE INTRODUCTION SHOWS THE PRODUCT, AND THE WALK TEACHES THE GOAL.
//
// She walked the built version and sent it back.
//
//   "the user not even processing that something was there, especially on
//    screen 13."
//
// THE FIRST ONE IS A REVERSAL OF SOMETHING A SESSION DID ON PURPOSE, and that
// is why this file exists rather than a comment. It was about the PRACTICE APP,
// which round two drew as a second Agentbox shrunk inside her window. Anybody
// who reads that quote again and reaches for these pieces will fail this file
// first.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHOR, COPY, INTRO, SLAB_OF, beatRows, coach } from '../renderer/src/onboarding.ts';
import { PRACTICE_NOTE, PRACTICE_ROWS } from '../shared/first-run-practice.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const view = fs.readFileSync(path.join(root, 'renderer/src/components/Onboarding.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

describe('the introduction shows the product', () => {
  it('gives every introduction screen a piece of the app to stand beside', () => {
    // THREE.
    expect(COPY.intro.length).toBe(3);
    for (const slab of COPY.intro) {
      expect(slab.piece, `"${slab.head}" has no piece`).toBeTruthy();
    }
    // Three different pieces, not the same one three times: they are three
    // features and the picture is what says which.
    expect(new Set(COPY.intro.map((s) => s.piece)).size).toBe(3);
  });

  // AND THERE IS NO COUNT ON THESE SCREENS AT ALL SINCE 2026-10-01, which is
  // the one pin in this file that a change deliberately reversed.
  //
  // WHAT THIS TEST USED TO ASSERT: `COPY.introOn(1, COPY.intro.length)` is
  // '1 of 3', and the view calls it with the list's own length rather than a
  // typed-out 3. Both of those were true and the screen was still wrong. A PM
  // and an office manager each walked the whole thing on 2026-10-01 and both
  // read "3 OF 3" on the third slab, after which the walk showed the theme
  // picker and then a card headed "This is the tutorial.", and then twelve more
  // beats. The number was honest about the three slabs and nobody reading it
  // can tell that is what it was counting.
  //
  // So the counter is deleted rather than re-based, because every number that
  // could go there is a count of a PREFIX of an eighteen-beat walk and ends
  // before the steps do. What is pinned now is its absence, in all three
  // places it could come back: the copy, the view and the stylesheet.
  it('puts no counter in front of the heading, because any count of it ends early', () => {
    expect(COPY.introOn).toBeUndefined();
    expect(view).not.toContain('introOn');
    expect(view).not.toContain('fr-intro-on');
    expect(css).not.toContain('.fr-intro-on');
    // The Next button is untouched: it is how anybody gets off the screen.
    expect(COPY.introNext).toBe('Next');
  });

  it('draws each piece out of the app\'s own classes rather than an image', () => {
    // The list piece is rows in a list pane beside the real sidebar, which is
    // what makes it the app rather than a picture of it.
    // The sidebar replaced the old top tab strip here with w-ec62ab6b38
    // (2026-09-28), because the strip is not what anybody sees after the walk.
    expect(view).toMatch(/className="fr-piece fr-piece-with-nav"/);
    expect(view).toMatch(/className="workspace-navigation fr-piece-nav"/);
    expect(view).toMatch(/<nav className="workspace-tabs">/);
    expect(view).toMatch(/className="list-pane"/);
    expect(view).toMatch(/className="row"/);
    expect(view).toMatch(/className="subject"/);
    // AND THE ROWS ARE INSIDE A .list. The row's own left and right insets are
    // declared on that element and nowhere else, so a row outside one is drawn
    // hard against the card's edge. Shot once without it, on 08-24.
    expect(view).toMatch(/className="list"/);
    expect(css).toMatch(/\.list \{ --gutter/);
    // No <img> anywhere in the walk: a still of the app goes stale the day
    // anything moves, and she judges these at full size.
    expect(view).not.toMatch(/<img/);
  });

  it('never scales a piece down to make it fit', () => {
    // WHAT MAKES IT FIT IS THE WINDOW'S RIGHT EDGE, not a transform.
    const block = css.slice(css.indexOf('.fr-piece {'), css.indexOf('/* --- the practice band'));
    expect(block.length).toBeGreaterThan(200);
    expect(block).not.toMatch(/transform:\s*scale/);
    expect(block).not.toMatch(/zoom:/);
    // IT USED TO RUN OFF THE RIGHT EDGE to stay full size. At 1440 by 900 a
    // persona test read that as a panel that did not fit (2026-10-01), so it
    // stops short of the edge now and is still not scaled.
    expect(block).not.toMatch(/right:\s*-\d+px/);
    expect(block).toMatch(/right:\s*\d+px/);
  });

  it('centres the words with a flex box, never with a transform', () => {
    // A transform on .fr-corner makes it the containing block for the fixed
    // Next button inside it, and the button lands beside the headline instead
    // of in the window's corner. Shot once that way on 08-24; it is the same
    // trap that put every ring 38px low the day before.
    const rule = css.slice(css.indexOf('.fr-screen-intro .fr-corner {'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).not.toMatch(/transform:/);
    expect(body).toMatch(/justify-content:\s*center/);
  });
});

describe('the walk teaches the goal', () => {
  // ROUND FOUR, 2026-08-24.
  //
  // The reason it did not teach was not the wording. Beat thirteen said "Close
  // all three with E" over three rows, and one of the three is an agent STOPPED
  // waiting for an answer. So the climax of the walk taught the one move the
  // product exists to prevent, and the inbox it left behind was empty with
  // nothing running. These are the tests that stop that coming back.
  // AND IT CLAIMS NOTHING THAT IS NOT ON THE SCREEN. This card sits over an
  // EMPTY inbox, which means the app has drawn its idle page and the rail is
  // gone, so a line about an agent still running would be describing something
  // invisible. Shot that way once on 2026-08-24. The lesson is said as the two
  // things she just did instead, and why answering beats closing is said on
  // `unblock`, where the stuck row is on the screen.
  it('says the lesson as what she did, and claims nothing the screen is not showing', () => {
    // THE LESSON MOVED OFF THIS CARD ON 2026-08-24 AND ONTO THE BEAT WHERE IT
    // IS VISIBLE. It used to be said here, over the palette, as a claim about
    // two things that had happened a screen earlier. The beat in front of this
    // one walks the three tabs instead, so the agent still working and the
    // three tasks kept in Closed are ON THE SCREEN while the card names them.
    // Saying it here as well would be the third time and the only time nothing
    // backs it up.
    //
    // AND EVERY CARD ON THE TOUR IS TWO LINES SINCE 2026-08-28. The middle one
    // carried a third, 'An empty inbox does not mean nothing is happening. It
    // means nothing is happening that needs you.', which is thirty-one words
    // explaining a screen that is at that moment SHOWING an agent running with
    // an empty inbox behind it. The quiet line carries what the sentence
    // added, in five words, and the screen carries the rest.
    const tour = ['inbox', 'progress', 'done'].map((view) => coach('where', 0, { view }));
    const all = tour.map((c) => `${c.quiet} ${c.lead}`).join(' ').toLowerCase();
    expect(all).toContain('working without you');
    expect(all).toContain('everything you finished');
    for (const c of tour) expect(c.why).toBeUndefined();
    const command = coach('command', 0);
    const said = `${command.quiet} ${command.lead}${command.key}${command.tail}`.toLowerCase();
    // AND THE LAST CARD ENDS ON WHAT SHE DOES NEXT. It stopped at "Press ⌘K
    // any time", which is a permission rather than a step, and a tester did
    // not know what to do with it.
    // w-ec62ab6b38 (2026-09-28): her word for a row is thread now, not task.
    expect(said).toContain('first real thread');
    // AND THE HALF SHE SEES AFTER THE PRESS IS THE OTHER ROUND ON THIS CARD,
    // which stays: the card used to go off the screen the moment the palette
    // opened, so the beat that teaches ⌘K said nothing at the one moment
    // somebody was looking at ⌘K.
    expect(coach('command', 0, { palette: true }).quiet).toContain('Every command');
    expect(said, 'the rail is not on screen at inbox zero').not.toContain('running');
    // It is a line on a card that is already up, not a screen of its own. The
    // screen that said this was cut on 08-23 for reading as an ending while
    // the walk carried on, and INTRO plus IN_PRACTICE is the whole step list.
    expect(INTRO).not.toContain('zero');
  });

  it('never tells anybody to close the row an agent is stopped on', () => {
    const clear = coach('clear', 0, { left: 2 });
    const said = `${clear.quiet} ${clear.lead}${clear.key}${clear.tail}`.toLowerCase();
    expect(said).not.toContain('all three');
    expect(clear.key).toBe('E');
    // AND IT IS NOT A SENTENCE THAT PROTECTS THIS ANY MORE, IT IS THE ROW THE
    // BEAT POINTS AT. The card used to say "two" and leave the person walking
    // to work out which two, over four rows, with the ring round whichever the
    // list drew first.So what this test has to pin is that the rows E is
    // offered on are the finished ones and only those: not the one an agent is
    // stopped on, and not the one that is real work for another day.
    const run = { step: 'clear', examples: PRACTICE_ROWS.map((_, i) => `w-p${i + 1}`) };
    const rows = run.examples.map((id) => ({ id }));
    const waitingAt = PRACTICE_ROWS.findIndex((r) => r.waiting);
    const laterAt = PRACTICE_ROWS.findIndex((r) => r.later);
    const offered = beatRows('clear', run, rows, waitingAt, laterAt);
    expect(offered).not.toContain(run.examples[waitingAt]);
    expect(offered).not.toContain(run.examples[laterAt]);
    expect(offered.length).toBe(clear.caps);
    // And it walks them in the order they are drawn, one press at a time, so
    // the ring is on a row rather than on "whichever came first".
    expect(offered).toEqual(run.examples.filter((_, i) => i !== waitingAt && i !== laterAt));
  });

  it('teaches the stopped one by answering it, and says why closing it is wrong', () => {
    // THE REASON IS ON THE FIRST HALF, where the row is still in the list and
    // closing it is still what a hand wants to do having just closed two. It
    // was on the second half for one draft and it did not fit: five lines under
    // a strip of options 157 tall ran off the window, and the lift that keeps a
    // card on screen put it over options two and three while the sentence above
    // them offered three. Measured at 1752x986 on 2026-08-24.
    //
    // AND IT IS ON THE FIRST LINE OF THE FIRST HALF SINCE 2026-08-28. It was a
    // third block under a rule; the card is two lines now and the danger is
    // folded into the sentence describing the row, so it is read BEFORE the key
    // rather than after it. The other half of the old sentence, that answering
    // puts the agent back to work, is the whole of beat seventeen, where she
    // watches it happen.
    const listed = coach('unblock', 0);
    expect(listed.key).toBe('↵');
    const warns = `${listed.quiet}`.toLowerCase();
    expect(warns).toContain('stopped');
    expect(warns).toContain('stopped for good');
    expect(listed.why).toBeUndefined();
    const opened = coach('unblock', 0, { opened: true });
    expect(opened.key).toBe('1');
    // And the half that stands over the options carries no third block either,
    // or it covers the thing it is pointing at.
    expect(opened.why).toBeUndefined();
  });

  it('counts two lights on the beat that wants two presses, and nowhere else', () => {
    expect(coach('clear', 0).caps).toBe(2);
    for (const step of ['make', 'task', 'working', 'open', 'answer', 'unblock', 'command']) {
      expect(coach(step, 0)?.caps, `${step} should want one press`).toBeUndefined();
    }
  });

  it('fills the lights off the rows that are left, not off a tally of presses', () => {
    // A press that closed nothing, an E typed into a field, a row closed with
    // the mouse: all three put a counter out of step with the screen. The
    // component reads the list instead.
    const lights = view.slice(view.indexOf('function Lights('));
    expect(lights.slice(0, 900)).toMatch(/querySelectorAll\('\.list-pane \.row'\)/);
  });

  it('keeps the goal on the LAST introduction screen, drawn rather than said', () => {
    // THE GOAL IS THE LAST THING SAID BEFORE THE APP OPENS, and it is the one
    // that hands over the point of the product. A feature screen after it would
    // end the introduction on its quietest note, which is what the sidebar slab
    // did for one morning.
    expect(COPY.intro[COPY.intro.length - 1].piece).toBe('empty');
    expect(COPY.pieceEmpty).toBeTruthy();
    // The empty piece is an inbox with nothing in it.
    // The "Active agents" list under it was the project rail, which is
    // retired, so w-ec62ab6b38 (2026-09-28) stopped drawing it here and in the
    // look picker's picture.
    const piece = view.slice(view.indexOf('function IntroPiece('), view.indexOf('/** THE THREE INTRODUCTION SLABS'));
    // It is the app's own idle page now, the figure and "Inbox zero", not the
    // pieceEmpty sentence she called ugly (w-ec62ab6b38, 2026-09-28).
    expect(piece).toMatch(/className="zero-state idle"/);
    expect(piece).toMatch(/className="idle-zero"/);
    expect(piece).toMatch(/Inbox zero/);
    expect(piece).not.toMatch(/pieceAgents/);
    expect(view).not.toMatch(/COPY\.pieceAgents/);
  });

  // WHERE NEXT GOES IS READ OFF `INTRO`, NEVER OFF A SECOND LIST. This was a
  // literal `['away', 'goal', 'hand']` in the component, kept in step with
  // `INTRO` by nothing, and adding the sidebar slab on 2026-08-24 broke it in
  // both directions in one edit: slab two's Next skipped the new screen, and
  // slab four's Next ran off the end and called `onStep(undefined)`, which
  // stopped the walk dead on the last introduction screen. Both were caught by
  // driving the built walk and neither has any other symptom.
  it('walks the introduction off one list, so a new slab cannot be skipped', () => {
    // IT READ `INTRO` UNTIL 2026-08-25, AND THAT WAS STILL A SECOND COPY, one
    // screen long. `INTRO` ends at the hand-off, so when she moved the theme
    // picker in front of the hand-off the introduction's Next would have walked
    // straight past it. `go` asks `STEPS`, which is the walk's only order.
    const body = view.slice(view.indexOf('const slab = SLAB_OF[run.step];'));
    expect(body.slice(0, 400)).toContain('go(run.step)');
    expect(body.slice(0, 400)).not.toContain('INTRO[slab + 1]');
    expect(body.slice(0, 400)).not.toMatch(/const next: Step\[\] = \[/);
    // And the two lists really are one thing: every slab in the copy has a step
    // in INTRO, in the same order, with the hand-off last.
    expect(INTRO.slice(0, COPY.intro.length).map((s) => SLAB_OF[s]))
      .toEqual(COPY.intro.map((_, i) => i));
    expect(INTRO[INTRO.length - 1]).toBe('hand');
    expect(SLAB_OF.hand).toBeUndefined();
  });

  it('teaches the sidebar note nowhere, neither as a slab nor as a beat', () => {
    // There is no `notes` piece and no fourth slab. The note had one beat in
    // the walk, ringing the rail's panel, until w-ec62ab6b38 (2026-09-28):
    // the rail is no longer drawn, so that beat pointed at nothing and is gone.
    const piece = view.slice(view.indexOf('function IntroPiece('), view.indexOf('/* ------------------------- PICKING THE LOOK'));
    expect(piece).not.toMatch(/className="rail-note-body"/);
    for (const slab of COPY.intro) expect(slab.piece).not.toBe('notes');
    expect(ANCHOR.note).toBeUndefined();
    expect(coach('note', 0)).toBeNull();
    // NOT "GOALS", SINCE 2026-08-24. Goals were her example of what SHE keeps
    // in hers, and the practice project's note still does not use the word.
    expect(PRACTICE_NOTE).not.toMatch(/Goals/i);
  });

  it('draws the introduction pieces on the app\'s own opaque ground', () => {
    // There is no picture behind them, so transparency there is the app's own
    // grey through the app's own grey.
    expect(css).toMatch(/\.fr-piece \{[^}]*background: var\(--bg\)/s);
  });
});
