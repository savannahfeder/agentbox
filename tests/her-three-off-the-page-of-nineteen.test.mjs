// HER THREE OFF THE PAGE OF NINETEEN SCREENS.
//
// She opened designs//index.html, which is every beat of the walk photographed
// out of the built app, and sent three things back:
//
// The third is held next door in her-three-onboarding-fixes.test.mjs, which is
// where the way out already lived. This file holds the second, and the part
// of the third that is about the harness rather than the app. The first was
// about the walk wearing the picked theme, and went with the themes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BEAT, IN_PRACTICE, N_BEATS, STEPS } from '../renderer/src/onboarding.ts';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

const walk = read('renderer/src/components/Onboarding.tsx');
const onboarding = read('renderer/src/onboarding.ts');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/styles.css');
const harness = read('scripts/shot-the-built-walk.mjs');

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
    // Nineteen since 2026-10-01: who a thread is for, and the board, each became a beat of their own.
    expect(N_BEATS).toBe(19);
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
    // Ten, not eleven, since w-ec62ab6b38 (2026-09-28) took the note beat out,
    // and eleven again since 2026-10-01, when who a thread is for became a beat.
    expect(IN_PRACTICE).toHaveLength(12);
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
