// THE END OF THE WALK, AND THE THREE EXAMPLES SAYING SO.
//
// Both halves are pinned here, because both are the kind of thing a later
// session tidies back out: a card at the end reads like a stray screen, and
// "Example:" on a title reads like a leftover debug prefix.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { COPY, BEAT, N_BEATS, coach, finishCard, forcedStep, walkRows } from '../renderer/src/onboarding.ts';
import { EXAMPLES } from '../shared/first-run-examples.mjs';

const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
const card = fs.readFileSync(new URL('../renderer/src/components/Onboarding.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
// The names the card keeps are saved in main now, so the check that they are
// still saved at all has to look where they are saved.
const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');

describe('the walk ends by saying it is over', () => {
  it('has a step after the command bar, and it is still beat ten', () => {
    expect(forcedStep('done')).toBe('done');
    expect(BEAT.done).toBe(N_BEATS);
  });

  it('says she is ready, in her own words, and does not recap the walk', () => {
    expect(COPY.finishHead).toBe('You are ready to get started.');
    expect(COPY.finishLine.length).toBeLessThan(90);
    // No list of what just happened. The card is the end of reading.
    expect(COPY.finishLine).not.toMatch(/⌘K|press |beat|step/i);
  });

  it('stands over an empty inbox, because that is what it says', () => {
    // IT USED TO STAND OVER THE REAL LIST, and on a Mac with Claude Code
    // already running that list is not empty.
    const run = { step: 'done', examples: ['a'], item: 'a' };
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'agent:9' }];
    expect(walkRows(rows, run)).toEqual([]);
    expect(walkRows(rows, { ...run, step: 'landed' }).map((r) => r.id)).toEqual(['a', 'b', 'agent:9']);
  });

  it('gives the way out a real click as well as the key', () => {
    // A drawn way out that only answers the keyboard is that bug again.
    //
    // THE WAY OUT MOVED ON 2026-08-28 AND THE CLAIM DID NOT. Every Mac that is
    // not blocked ends on <ImportAgents> now, empty or full, so the button is
    // that card's `.ia-walk-on` and the key is its ⌘↵, which answers with the
    // way on when there is nothing to bring across.
    const ia = fs.readFileSync(new URL('../renderer/src/components/ImportAgents.tsx', import.meta.url), 'utf8');
    expect(ia).toMatch(/className="ia-walk-on" onClick=\{walk\.onSkip\}/);
    expect(ia).toMatch(/if \(walk && !some\) \{ walk\.onSkip\(\); return; \}/);
    expect(ia).toMatch(/addEventListener\('keydown', key\)/);
  });

  it('waits for the palette to close instead of ending under it', () => {
    expect(app).toMatch(/sawPalette/);
    // AND CLOSING THE PALETTE BRINGS THE CARD ITSELF. It went to a separate
    // agents screen for a few hours on 08-22; that screen is on the card now.
    //
    // THE ONE LINE BECAME FOUR ON 2026-08-28 AND THE CLAIM DID NOT CHANGE. This
    // asserted the exact expression `if (sawPalette.current)
    // setRun(...'done'...)`, which stopped being one expression when the
    // tutorial split off the onboarding: the two walks part company on this
    // beat, and which of them is running is `afterCommand` in onboarding.ts.
    // Both halves are asserted here rather than the shape of one of them — an
    // early return on a palette nobody has opened, and the onboarding still
    // stepping to the card.
    const fn = app.slice(app.indexOf('const sawPalette = useRef'), app.indexOf('const prevInboxIds'));
    expect(fn).toMatch(/if \(modal === 'palette'\) \{ sawPalette\.current = true; return; \}/);
    expect(fn).toMatch(/if \(!sawPalette\.current\) return;/);
    expect(fn).toMatch(/setRun\(\(r\) => \(r \? stepTo\(r, 'done'\) : r\)\)/);
  });

  it('IS her agents question, and it is the only thing on it', () => {
    // One card, one button: it writes the names she kept and ends the walk.
    //
    // AND SINCE 2026-08-24 IT IS NOT ALSO A CELEBRATION.The headline is the
    // question now and the ready words are on the landing, over her own inbox.
    expect(card).toContain('{card.head}');
    expect(card).toContain('{card.line}');
    expect(finishCard({ missing: false }, { read: true, some: true })).toMatchObject({
      show: true, go: true, blocked: false, head: COPY.bringHead, line: COPY.agentsOffer,
    });
    // Scoped to `Finished` itself, because both of these are still in this
    // file: they are what `Landed` draws over her own inbox a moment later.
    const finished = card.slice(card.indexOf('function Finished('), card.indexOf('LANDING IN HER OWN PROJECT'));
    expect(finished).not.toContain('COPY.finishHead');
    expect(finished).not.toContain('fr-burst');
    const fin = app.slice(app.indexOf('const finishRun'), app.indexOf('const finishRun') + 900);
    // THIS USED TO READ setProjectSetting, AND THAT IS THE WHOLE OF WHAT WAS
    // WRONG WITH THE BUTTON. Writing the ticked names into a settings file was
    // ALL the press did, and no other part of the app has ever read that key,
    // so his inbox was byte for byte identical before and after. The names are
    // still saved, in main now, and the check moves with them rather than
    // being dropped: importAgents saves the ticks AND files the rows.
    expect(fin).toMatch(/api\.importAgents\(\{ product, agents: chosen \}\)/);
    expect(ipc).toMatch(/key: 'agents', value: names/);
    expect(fin).toMatch(/finishFirstRun\(localStorage\)/);
    // And nothing steps to a screen after it.
    expect(app).not.toMatch(/stepTo\(r, 'agents'\)/);
  });

  it('bursts once and never loops, and a Mac asking for less movement gets none', () => {
    const bit = css.slice(css.indexOf('.fr-bit {'), css.indexOf('}', css.indexOf('.fr-bit {')));
    expect(bit).toMatch(/forwards/);
    expect(bit).not.toMatch(/infinite/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.fr-bit \{ animation: none/);
  });
});

describe('the three on beat eight say they are examples before they are opened', () => {
  it('puts the word in the title, not only in the result', () => {
    for (const e of EXAMPLES) {
      expect(e.title.startsWith('Example: ')).toBe(true);
      expect(e.result.startsWith('Example.')).toBe(true);
    }
  });

  it('names the one row it is about, and one key, on each of the two presses', () => {
    // IT SAID "Close all three" UNTIL 2026-08-24, and one of the three is an
    // agent stopped waiting for an answer, so the card taught the one move the
    // product exists to prevent. The third is beat fourteen's, and it is
    // answered rather than closed.
    //
    // AND IT SAID "Two of these are finished. The other two are not." UNTIL
    // 2026-08-27, which is true and is a puzzle: four rows, a ring round
    // whichever one the list drew first, and nothing anywhere saying which two
    // it meant.So it names ONE row, the way the two beats after it always have.
    const say = coach('clear', 0, { left: 2 });
    expect(say.quiet).toBe('This one is finished. Z brings back anything you close.');
    expect(say.key).toBe('E');
    expect(say.caps).toBe(2);
    expect(`${say.quiet} ${say.lead}`).not.toMatch(/repl/i);
    // AND IT NEVER ASKS HER TO WORK OUT WHICH ROWS IT MEANS.
    expect(`${say.quiet} ${say.lead}${say.tail}`).not.toMatch(/two|both|all/i);
    // THE SECOND CARD IS NOT THE FIRST ONE AGAIN. Two identical cards read as a
    // screen that did not notice the press between them, which is what a
    // repeated message has twice been reported to feel like.
    const second = coach('clear', 0, { left: 1 });
    expect(second.quiet).toBe('This one is finished too.');
    expect(second.quiet).not.toBe(say.quiet);
    expect(second.key).toBe('E');
    // AND IT SAYS UNDO IS THERE.A person who does not know E is reversible has
    // to be careful with it, and careful is the opposite of what this beat is
    // teaching.
    //
    // IT IS IN THE QUIET LINE SINCE 2026-08-28, not on a third one, and it is
    // said ONCE. The card is two lines now, and the first close is the only
    // press where knowing E is reversible changes what somebody dares to do;
    // the second card has the "too" that proves the app noticed her, and
    // repeating the Z sentence there reads as the app failing to notice she
    // answered.
    expect(say.quiet).toMatch(/\bZ\b/);
    expect(say.why).toBeUndefined();
    expect(second.why).toBeUndefined();
  });
});
