// HER THREE OFF THE PAGE OF NINETEEN SCREENS.
//
// She opened designs//index.html, which is every beat of the walk photographed
// out of the built app, and sent three things back:
//
// The third is held next door in her-three-onboarding-fixes.test.mjs, which is
// where the way out already lived. This file holds the first two, and the part
// of the third that is about the harness rather than the app.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BEAT, IN_PRACTICE, N_BEATS, STEPS, wearsTheWalksLook } from '../renderer/src/onboarding.ts';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

const walk = read('renderer/src/components/Onboarding.tsx');
const onboarding = read('renderer/src/onboarding.ts');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/styles.css');
const harness = read('scripts/shot-the-built-walk.mjs');

describe('1. the tutorial wears the theme that was picked', () => {
  // TWO FAULTS WORE ONE SENTENCE. The page was taken by a harness that pressed
  // Light to prove the window follows and then failed to press back, and the
  // app itself was painting the default over five beats of the practice round.
  // Both are held here, because either one alone puts her back where she was.

  it('takes the inbox-zero pin off for the whole of the walk', () => {
    // Her decision of 2026-08-19 stands OUTSIDE the walk: inbox zero in her own
    // app is always the picture. Inside the walk it is the ground under a
    // lesson, and the lesson wears what was picked.
    // w-9e434e8671: the idle pin is off everywhere now, not only in the walk,
    // because a pin to plain dark would show a theme nobody can pick.
    expect(app).toContain('const idlePinned = false;');
    // THE TWO PINS SPLIT INTO TWO BRANCHES ON 2026-09-01. They shared one for
    // as long as they painted the same picture and they no longer do: the walk
    // opens on Gouache Valley where nothing is picked, the idle page still
    // opens on nothing. `run === null` above is what takes the idle pin off for
    // the whole of the walk, which is what this test is about, and it is
    // untouched.
    expect(app).toMatch(/if \(firstRunPinned\) \{/);
    expect(app).toMatch(/if \(idlePinned\) \{/);
  });

  it('pins nothing from the look step onward, so the pick is never painted over', () => {
    // EVERY screen before the picker and no others. This test named the three
    // setup screens until 2026-08-26, because on 08-24 those three WERE every
    // screen before the picker. The picker moved to beat seven on 08-25, the
    // introduction's three slabs slid in front of it, and neither the pin nor
    // this test noticed: she photographed the first slab drawn white. So the
    // question is asked of the step order now and cannot go stale again.
    expect(app).toContain('const firstRunPinned = run !== null && wearsTheWalksLook(run.step);');
    for (const step of STEPS.filter((s) => BEAT[s] < BEAT.look)) {
      expect(wearsTheWalksLook(step)).toBe(true);
    }
    for (const step of STEPS.filter((s) => BEAT[s] >= BEAT.look)) {
      expect(wearsTheWalksLook(step)).toBe(false);
    }
  });

  it('holds every beat of the driven walk to the theme the look step ended on', () => {
    // The harness reads the window back after the look step and then checks it
    // on every beat after it, so a walk that drifts throws instead of being
    // photographed.
    expect(harness).toContain('const PICKED = { theme: null, skin: null };');
    expect(harness).toMatch(/if \(PICKED\.theme && m\.theme !== PICKED\.theme\) \{/);
    expect(harness).toMatch(/is in \$\{m\.theme\} and the look step picked \$\{PICKED\.theme\}/);
  });

  it('restores the look step by the tile it is, not by the name it had', () => {
    // THIS IS THE LINE THAT DID IT. It looked for a tile starting "Gouache
    // Valley", and Randomize is pressed six lines above, so after that press
    // the picture slot holds one of the other fifteen and no tile has that
    // name. `find` returned undefined, the click was skipped without a word,
    // and the Light press from the beat before rode through the rest of the
    // walk.
    const restore = harness.slice(harness.indexOf('// AND BACK TO A PICTURE'));
    expect(restore).not.toMatch(/startsWith\('Gouache Valley'\)/);
    expect(restore).toMatch(/document\.querySelector\('\.look'\)/);
    // And it throws rather than carrying on into nineteen wrong photographs.
    expect(restore).toMatch(/throw new Error\(`the look step did not go back to a picture/);
  });
});

describe('2. nothing counts the walk on screen any more', () => {
  it('draws no row of dots anywhere in the walk', () => {
    expect(walk).not.toContain('<Dots');
    expect(walk).not.toContain('className="fr-dots"');
    expect(css).not.toMatch(/^\.fr-dots\s*\{/m);
    expect(css).not.toMatch(/^\.fr-dot\s*\{/m);
    expect(css).not.toMatch(/^\.fr-dot\.on\s*\{/m);
  });

  it('took the machinery that placed them with it', () => {
    // `dotsBottom` existed to lift the row off the reply box on the one beat
    // that draws one. There is no row to lift.
    expect(onboarding).not.toMatch(/export function dotsBottom/);
    expect(onboarding).not.toMatch(/export const DOTS_BOTTOM/);
    expect(onboarding).not.toMatch(/export const DOT_H/);
    // The component's own import list, so the comment explaining the removal
    // does not count as a use of it.
    const imports = walk.slice(walk.indexOf("import {\n  ANCHOR"), walk.indexOf("} from '../onboarding';"));
    expect(imports).not.toContain('dotsBottom');
    expect(imports).not.toContain('DOTS_BOTTOM');
  });

  it('keeps the numbering, because the order of the walk is still a real claim', () => {
    // What went is the drawing, not the beats. Renaming it is the whole of how
    // a later session is stopped from reading `DOT` and drawing one again.
    // Eighteen since w-ec62ab6b38 (2026-09-28) took the note beat out.
    expect(N_BEATS).toBe(18);
    expect(new Set(Object.values(BEAT)).size).toBe(N_BEATS);
    expect(onboarding).not.toMatch(/export const DOT\b/);
    expect(onboarding).toMatch(/export const BEAT: Record<Step, number>/);
  });

  it('says on the page why, so nobody puts them back as a kindness', () => {
    expect(walk).toContain('THE DOTS ARE GONE, AND THEY ARE NOT COMING BACK');
    // The reason, which is the half that stops somebody adding a tooltip and
    // calling it fixed: two people did not know what the marks were. Read with
    // the line breaks flattened, because the sentence lives in a comment and a
    // comment is re-wrapped whenever the paragraph around it is edited.
    expect(walk.replace(/\s+/g, ' '))
      .toMatch(/people not understanding a thing is not a labelling problem/);
  });

  it('leaves no step count anywhere on the screen', () => {
    // The card's own "1 of 6" went in round four, hers, and the dots carried it
    // after that. Neither is on the walk now.
    const imports = walk.slice(walk.indexOf("import {\n  ANCHOR"), walk.indexOf("} from '../onboarding';"));
    expect(imports).not.toContain('N_BEATS');
    expect(imports).not.toContain('BEAT');
  });
});

describe('3. the way out is on the tutorial, and the harness looks at it', () => {
  it('is up on exactly the beats the practice band is up on', () => {
    const way = walk.slice(walk.indexOf('export function WayOut'), walk.indexOf('THE DOTS ARE GONE'));
    expect(way).toMatch(/!practising\(run\)/);
    // Ten beats, from making the first task to ⌘K, and nothing before them.
    // Ten, not eleven, since w-ec62ab6b38 (2026-09-28) took the note beat out.
    expect(IN_PRACTICE).toHaveLength(10);
    expect(IN_PRACTICE[0]).toBe('make');
    expect(IN_PRACTICE.at(-1)).toBe('command');
    for (const step of STEPS.filter((s) => BEAT[s] < BEAT.make)) {
      expect(IN_PRACTICE).not.toContain(step);
    }
  });

  it('is measured on every beat, so where it sits is a number and not an impression', () => {
    expect(harness).toMatch(/const o = document\.querySelector\('\.fr-out'\)/);
    expect(harness).toMatch(/way out at \$\{m\.out\.x\},\$\{m\.out\.y\}/);
  });

  it('is nowhere near the reply box, which is what the bottom corner belongs to', () => {
    const rule = css.slice(css.indexOf('.fr-out {'), css.indexOf('.fr-out:hover'));
    expect(rule).not.toMatch(/bottom: \d+px/);
    expect(rule).toMatch(/top: 0/);
  });

  it('cannot crowd the capsule at any window the app will open', () => {
    // Not a number off one screenshot: the capsule reserves 260px of the window
    // and is centred, so it leaves at least 130px of clear strip on each side of
    // it whatever it holds. This sits 16px in from the right edge.
    const pill = css.slice(css.indexOf('.fr-band-pill {'), css.indexOf('.fr-band-dot'));
    const reserve = Number((pill.match(/max-width: min\(\d+px, calc\(100vw - (\d+)px\)\)/) || [])[1]);
    expect(reserve).toBe(260);
    const rule = css.slice(css.indexOf('.fr-out {'), css.indexOf('.fr-out:hover'));
    const inset = Number((rule.match(/right: (\d+)px/) || [])[1]);
    expect(reserve / 2).toBeGreaterThan(inset);
    // And the app never opens narrower than this, so the cap is always in force.
    expect(read('main/main.mjs')).toMatch(/minWidth: 980/);
  });
});
