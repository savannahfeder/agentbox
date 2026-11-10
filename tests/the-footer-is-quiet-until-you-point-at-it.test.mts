// The new task card's footer showed every setting it had, all the time.
//
// the founder picked the way out of that, on, 2026-08-20, from fifteen drawn
// mechanisms:
//
//   "I think the hover is definitely the winner. Once you've added something
//   beyond the project, everything that was shown on hover should still remain
//   but it should only have that different color background when you hover.
//
//   Note that I got things mistaken. It shouldn't always show the priority. It
//   should always show the project, so that's a default thing to show, and
//   whenever you hover over that area it should then show the other options."
//
// SHE THEN TESTED IT AND BOTH HALVES OF THAT WERE WRONG, same item, same day,
// with a screenshot of a brand new card sitting there with every clause showing:
//
// So this file now holds two rules, and each of them killed one of hers:
//
//   THERE IS NO WASH. Hover adds the words and changes nothing else. The
//   `footerIsWashed` export is gone rather than pinned to false, and the tests
//   below assert the CLASS is gone from the stylesheet too, because a rule left
//   switched off is a rule someone turns back on.
//
//   A REMEMBERED VALUE IS NOT A CHOICE. The card opens on her last level and
//   her last model on purpose, both her own asks (../renderer/src/priority.ts,
//   ../renderer/src/models.ts). The old facts were `priorityPicked: !!prio`,
//   which is true the instant a card opens, so the sentence was open before she
//   had touched anything and the hover had nothing left to reveal. That is
//   exactly the screenshot. Only a change made ON THIS CARD holds it open.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  beyondTheProject,
  footerIsOpen,
  restingClause,
} from '../renderer/src/compose-footer.ts';

// A card as it opens: her default project, nothing else touched, pointer away.
// A remembered level and a remembered model are part of "as it opens", which is
// the whole point: they change none of these facts.
const resting = {
  hovered: false,
  menuOpen: false,
  priorityChanged: false,
  whenSet: false,
  modelChanged: false,
  effortChanged: false,
  hasProjectClause: true,
};

describe('the footer at rest', () => {
  it('shows the project and hides the rest', () => {
    expect(footerIsOpen(resting)).toBe(false);
    expect(restingClause(resting)).toBe('project');
  });

  // Her correction, in one line. The card used to open reading "Medium
  // priority." and she does not want the level out front.
  it('does not put the priority out front', () => {
    expect(restingClause(resting)).not.toBe('priority');
  });
});

describe('the pointer arrives', () => {
  const pointed = { ...resting, hovered: true };

  it('shows every clause', () => {
    expect(footerIsOpen(pointed)).toBe(true);
  });
});

// Her second correction, and the one that sent this file back: the card in her
// screenshot had never been touched. It opened carrying the level she used last
// (her ask on) and the old rule read that as a level she had set.
describe('a card she has not touched', () => {
  it('is quiet even though it opened on a remembered level and model', () => {
    // Nothing here says "no level": the sentence reads "Urgent priority. On
    // Sonnet." the moment it opens. It says she has not MOVED either of them.
    expect(beyondTheProject(resting)).toBe(false);
    expect(footerIsOpen(resting)).toBe(false);
  });

  it('opens the moment she moves the level off what it opened with', () => {
    expect(footerIsOpen({ ...resting, priorityChanged: true })).toBe(true);
  });
});

describe('something set beyond the project', () => {
  // the line stays open with the pointer nowhere near it.
  for (const [what, fact] of [
    ['a level', 'priorityChanged'],
    ['a start time or a rule', 'whenSet'],
    ['a model', 'modelChanged'],
    // Inside the model drawer, remembered like the model.
    ['an effort level', 'effortChanged'],
  ]) {
    it(`keeps the line open after she picks ${what}`, () => {
      const set = { ...resting, [fact]: true };
      expect(beyondTheProject(set)).toBe(true);
      expect(footerIsOpen(set)).toBe(true);
    });
  }

  // The project is NOT "beyond the project". Switching project is the one
  // choice that leaves the footer as quiet as it found it.
  it('does not count the project itself', () => {
    expect(beyondTheProject(resting)).toBe(false);
  });
});

describe('a menu she is reading', () => {
  // The line must not collapse under an open drawer just because the pointer
  // travelled into it, or the menu closes and the click lands on nothing.
  it('holds the line open with the pointer gone', () => {
    expect(footerIsOpen({ ...resting, hovered: false, menuOpen: true })).toBe(true);
  });
});

describe('a machine with one project', () => {
  // The card draws no project clause when there is nothing to choose, and a
  // footer showing NOTHING is a control nobody finds. The level takes the
  // resting slot in that one case, and only that one.
  const single = { ...resting, hasProjectClause: false };

  it('rests on the level instead', () => {
    expect(restingClause(single)).toBe('priority');
  });

  it('still hides everything else until she points at it', () => {
    expect(footerIsOpen(single)).toBe(false);
    expect(footerIsOpen({ ...single, hovered: true })).toBe(true);
  });
});

// The cause was one missing word. The hidden clause transitioned `opacity`
// alone, so `visibility` flipped to hidden on the first frame of the pointer
// leaving and the fade then ran on something already gone: in was a fade, out
// was a cut. The fix is `visibility 0s linear <the fade duration>`, which holds
// the clause visible for exactly as long as the fade lasts and then takes it
// out of the tab order. It is easy to lose again by "tidying" the transition
// list back to one property, so it is asserted here rather than left to the eye.
describe('the reveal fades both ways', () => {
  const css = readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
  const rule = (sel) => {
    const at = css.indexOf(sel + ' {');
    expect(at, `${sel} is gone from styles.css`).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };

  it('holds the hidden clause visible until its fade has finished', () => {
    const hidden = rule('.compose-sentence .clause');
    const fade = hidden.match(/opacity ([\d.]+)s/)?.[1];
    expect(fade, 'the clause no longer fades on the way out').toBeTruthy();
    expect(hidden).toContain(`visibility 0s linear ${fade}s`);
  });

  it('takes longer arriving than leaving, after a lead-in', () => {
    const open = rule('.compose-sentence.open .clause');
    // The lead-in is read off the visibility hop rather than the opacity list:
    // the easing curve carries commas of its own and a lazy match trips on them.
    const inFade = open.match(/opacity ([\d.]+)s/)?.[1];
    const inDelay = open.match(/visibility 0s linear ([\d.]+)s/)?.[1];
    const outFade = rule('.compose-sentence .clause').match(/opacity ([\d.]+)s/)?.[1];
    expect(Number(inFade)).toBeGreaterThan(Number(outFade));
    expect(Number(inDelay)).toBeGreaterThan(0);
    // This ceiling used to be 0.34s, on the reasoning that a reveal slower than
    // a third of a second is one she is waiting on. That was our guess. She
    // hovered six of these side by side and picked the slowest of them: "slower
    // and calmer wins. merge it". So the number here is now hers, and it is a
    // ceiling on drift rather than on taste. Do not lower it back without her.
    const last = Number(css.match(/\.clause-model \{ transition-delay: ([\d.]+)s/)?.[1]);
    expect(Math.round((last + Number(inFade)) * 1000)).toBeLessThanOrEqual(430);
  });

  // Left to right was options one and four on her page and she kept neither.
  // Her pick fades the whole sentence in together, so a stagger reappearing
  // here is a regression rather than a refinement.
  it('arrives as one line, with nothing staggered', () => {
    const when = Number(css.match(/\.clause-when \{ transition-delay: ([\d.]+)s/)?.[1]);
    const model = Number(css.match(/\.clause-model \{ transition-delay: ([\d.]+)s/)?.[1]);
    expect(when).toBeGreaterThan(0);
    expect(model).toBe(when);
  });

  it('does not animate for anyone who has asked it not to', () => {
    const at = css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('.compose-sentence .clause {'));
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 400)).toContain('.compose-sentence.open .clause');
  });
});

// Asserted against the stylesheet rather than against a boolean, because the
// boolean is what got deleted. What could bring the wash back is a CSS rule,
// so a CSS rule is what this watches.
describe('hover paints nothing', () => {
  const css = readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');

  it('has no washed footer left in the stylesheet', () => {
    expect(css).not.toContain('.compose-sentence.washed');
  });

  it('and the footer no longer transitions its background at all', () => {
    const at = css.indexOf('.compose-sentence {');
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf('}', at))).not.toContain('background');
  });
});
