// THE SETUP SCREENS HAVE A WAY BACK, AND IT IS FINDABLE.
//
// A tester, on a call of 2026-09-02: they chose their project folder and could not
// get back off that screen. Measured on the built walk the same day, before the
// fix: the folder screen drew no Back and nothing anywhere listened for Escape
// on it. The ONLY backwards move in the whole of setup was Escape inside the
// name field on the screen after it, which is a rule you can only find by
// already knowing it.
//
// So there are three claims here and they fail separately:
//
//   1. The rule itself. Which screens have a way back, and where each one goes.
//   2. The KEY is one window listener rather than a handler on a field, because
//      the folder screen has no field for a handler to live on.
//   3. The WORD is drawn, on both screens, so nobody has to guess at the key.
//
// The harness is the end-to-end half: it
// drives the built walk forward and back out of both screens, with the key and
// with the word, and photographs each one.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPY, STEPS, stepBack } from '../renderer/src/onboarding.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const walk = src('components', 'Onboarding.tsx');
const css = src('styles.css');

describe('the rule', () => {
  it('takes the folder screen back to the welcome, which is what Sam wanted', () => {
    expect(stepBack('folder')).toBe('welcome');
  });

  it('takes the name screen back to the folder', () => {
    expect(stepBack('name')).toBe('folder');
  });

  it('has no way back off the welcome, because there is nothing behind it', () => {
    expect(stepBack('welcome')).toBe(null);
  });

  // Everything from the introduction on is downstream of a project that has
  // really been made in the store. A Back there would offer to rename or remake
  // something that already exists, which is worse than no Back at all.
  it('has no way back off any screen after the project is made', () => {
    const after = STEPS.slice(STEPS.indexOf('inbox'));
    for (const step of after) expect(stepBack(step)).toBe(null);
  });
});

// There WAS a listener for one afternoon, and a private one on the name field
// before that. This is what stops either coming back: somebody halfway through
// setup presses Escape to shake off a chooser or a focus ring, and walking them
// back a screen is the app deciding they meant something they did not.
describe('no key does this', () => {
  // Only Escape. The setup screens keep their Enter listeners, which are what
  // carry the whole walk without a mouse.
  it('has no Escape listener on the setup screens', () => {
    const setup = walk.slice(walk.indexOf('const backTo = stepBack(run.step)'));
    expect(setup).not.toMatch(/'Escape'/);
    expect(setup).toMatch(/e\.key === 'Enter'/);
  });

  // The shape that shipped before this row: the walk's only backwards move
  // lived inside the name field's own onKeyDown.
  it('is not the name field private rule either', () => {
    expect(walk).not.toMatch(/Escape'\s*\)\s*\{\s*e\.preventDefault\(\);\s*onStep\('folder'\)/);
  });

  // The walk's OTHER Escape is a different screen and a different question: it
  // closes the leave card in `WayOut`, which only exists during the practice
  // round. Removing that one was never asked for.
  it('leaves the leave card its own Escape', () => {
    const wayOut = walk.slice(walk.indexOf('export function WayOut'), walk.indexOf('export function Cap'));
    expect(wayOut).toMatch(/e\.key !== 'Escape'/);
  });

  it('never names a key on the arrow, because none does this', () => {
    expect(walk).not.toMatch(/\$\{COPY\.back\} \(esc\)/);
  });
});

// The arrow she was expecting is the one the app already has. `.back-esc` was
// drawn five ways on and answered "option 1, merge it", and reduced to the mark
// alone the same evening: "just having a little icon with no esc text". So the
// thing this guards is that the walk REUSES it. A future round that quietly
// invents a ninth shape for this screen fails here.
describe('the arrow', () => {
  it('is the app\'s own back control and not a new one', () => {
    expect(walk).toMatch(/className="back-esc fr-back"/);
    // The same path the Settings screen and the opened task draw.
    expect(walk).toContain('M10 3.5L5.5 8l4.5 4.5');
  });

  it('is one control in the window\'s corner, not one per card', () => {
    expect(walk.match(/\{backWord\}/g)?.length).toBe(1);
    const rule = css.slice(css.indexOf('.fr-back {'), css.indexOf('.fr-back svg'));
    expect(rule).toMatch(/position: fixed/);
  });

  /* * THE CORNER IS ONE COLUMN, and these three numbers are the whole of it.

     The arrow's 24 box is centred on 20, the centre of the first window button,
     so the chevron hangs under it. The mark starts 8 after that box closes,
     which is the gap the window buttons use between themselves. If either
     number moves, the other has to move with it or the column bends.
  */
  const ARROW_LEFT = 8;
  const BOX = 24;
  const GAP = 8;

  it('hangs the arrow under the first window button', () => {
    const rule = css.slice(css.indexOf('.fr-back {'), css.indexOf('.fr-back svg'));
    expect(rule).toMatch(new RegExp(`left: ${ARROW_LEFT}px`));
    expect(rule).toMatch(new RegExp(`width: ${BOX}px`));
    // The box's centre, which is where the first window button's centre is.
    expect(ARROW_LEFT + BOX / 2).toBe(20);
  });

  it('starts the wordmark one gap after the arrow closes', () => {
    expect(walk).toMatch(/backWord \? 'fr-screen has-back' : 'fr-screen'/);
    expect(css).toMatch(
      new RegExp(`\\.fr-screen\\.has-back \\.fr-brand \\{ left: ${ARROW_LEFT + BOX + GAP}px; \\}`),
    );
  });

  it('still says the word Back to anyone who cannot see it', () => {
    expect(COPY.back).toBe('Back');
    expect(walk).toMatch(/aria-label=\{COPY\.back\}/);
  });

  it('is quiet: no border, no fill, no label beside it', () => {
    expect(walk).not.toMatch(/fr-back[^]{0,400}<span>esc<\/span>/);
    const rule = css.slice(css.indexOf('.fr-back {'), css.indexOf('.fr-screen.has-back'));
    expect(rule).not.toMatch(/border:/);
    expect(rule).not.toMatch(/background:/);
  });
});
