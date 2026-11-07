// THREE ONBOARDING CHANGES, PINNED.
//
// After the four-tile theme step merged, a second walk through the onboarding
// turned up three more changes. Each is pinned here because each is the sort
// of thing a later session undoes by accident.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COACHED, COPY, BEAT, IN_PRACTICE, N_BEATS, STEPS,
  advance, nextStep, swallowPress, wrongPress,
} from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
// The code without its comments, because half of what is asserted below is a
// wiring change and the comments beside it are long.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const onboarding = read('renderer/src/components/Onboarding.tsx');
const onboardingCode = code(onboarding);
const app = code(read('renderer/src/App.tsx'));
const css = read('renderer/src/styles.css');

describe('1. the introduction hands straight to the practice round', () => {
  it('goes from the last slab to the hand-off and from there into the practice round', () => {
    // `hand` is the hand-off card whose one button makes the practice project,
    // and `make` is the first beat inside it.
    // No slab is in front of it since 2026-10-05 (w-9f6975906c): `name` is.
    expect(nextStep('name')).toBe('hand');
    // And the first beat inside it is the look around since 2026-10-06, two
    // stops in front of the plus.
    expect(nextStep('hand')).toBe('tour');
    expect(nextStep('tour')).toBe('tabs');
    expect(nextStep('tabs')).toBe('make');
    expect(IN_PRACTICE[0]).toBe('tour');
  });

  it('leaves naming the project handing straight to the introduction', () => {
    const after = advance(
      { step: 'name', folder: null, name: 'X', product: null, practice: null, examples: [], item: null, sentAt: null },
      { t: 'made', product: 'x' },
    );
    // The introduction is only the hand-off since 2026-10-05 (w-9f6975906c).
    expect(after.step).toBe('hand');
  });

  it('counts the walk it runs', () => {
    // A screen that quietly changes the count is a walk that lies about how
    // long it is. Seventeen since the theme step went with the themes
    // (w-9e434e8671).
    // Sixteen since 2026-10-05 (w-9f6975906c): the three slabs at four to six went.
    // Seventeen since 2026-10-06: the look around at five and six, To gone.
    expect(N_BEATS).toBe(17);
    expect(BEAT.name).toBe(3);
    expect(BEAT.hand).toBe(4);
    expect(BEAT.tour).toBe(5);
    expect(BEAT.tabs).toBe(6);
    expect(BEAT.make).toBe(7);
  });

  it('gives every step a dot, in the order the walk runs, with none repeated out of place', () => {
    let last = 0;
    for (const step of STEPS) {
      const d = BEAT[step];
      expect(d, `${step} has no dot`).toBeTypeOf('number');
      expect(d, `${step} goes backwards`).toBeGreaterThanOrEqual(last);
      expect(d).toBeLessThanOrEqual(N_BEATS);
      last = d;
    }
    expect(last).toBe(N_BEATS);
  });

  it('reads every Next off the one list, so moving a screen cannot skip it', () => {
    // The introduction's Next used to name the screen after it. That second
    // copy broke twice on 08-24.
    expect(onboardingCode).not.toMatch(/INTRO\[\s*slab\s*\+\s*1\s*\]/);
    expect(onboardingCode).toMatch(/onNext=\{\(\)\s*=>\s*go\(run\.step\)\}/);
  });
});

describe('2. a wrong key does not reach the app', () => {
  it('stops the exact press she lost the snooze lesson to', () => {
    // The clear beat asks for C. Her E went through and closed a row.
    const E = { key: 'e' };
    expect(wrongPress('C', E)).toBe(true);
    expect(swallowPress('C', E, null)).toBe(true);
  });

  it('lets the right key through untouched', () => {
    expect(swallowPress('E', { key: 'e' }, null)).toBe(false);
    expect(swallowPress('⌘K', { key: 'k', metaKey: true }, null)).toBe(false);
  });

  it('never eats a key that is not one of the walk’s own caps', () => {
    // An arrow, Escape, a reload and a quit are ordinary things to do in the
    // middle of a walk. Eating these would trap the window.
    for (const e of [
      { key: 'ArrowDown' }, { key: 'Escape' }, { key: 'r', metaKey: true },
      { key: 'q', metaKey: true }, { key: 'Shift' }, { key: 'F5' },
    ]) {
      expect(swallowPress('E', e, null), JSON.stringify(e)).toBe(false);
    }
  });

  it('never eats Tab, because moving the focus ring is not processing a command', () => {
    expect(wrongPress('E', { key: 'Tab' })).toBe(true);
    expect(swallowPress('E', { key: 'Tab' }, null)).toBe(false);
  });

  it('never eats anything typed into a field', () => {
    const field = { closest: (sel) => (sel.includes('input') ? {} : null) };
    expect(swallowPress('C', { key: 'e' }, field)).toBe(false);
  });

  it('eats nothing at all on a screen that is not asking for a key', () => {
    expect(swallowPress(null, { key: 'e' }, null)).toBe(false);
  });

  it('is hooked up on the way down and really stops the press', () => {
    // Capture phase, or the app's own window handler may have run first.
    expect(onboardingCode).toMatch(/addEventListener\('keydown', on, true\)/);
    expect(onboardingCode).toMatch(/removeEventListener\('keydown', on, true\)/);
    expect(onboardingCode).toMatch(/stopImmediatePropagation\(\)/);
    // And the old promise that nothing was ever swallowed is gone.
    expect(onboarding).not.toMatch(/Nothing is prevented and nothing is swallowed/);
  });

  it('still answers the wrong press on the cap, which is what she liked about Superhuman', () => {
    expect(onboardingCode).toMatch(/setWrong\(\(n\) => n \+ 1\)/);
  });

  it('covers every coached beat, which is where the app is live behind the card', () => {
    expect(COACHED).toContain('clear');
    expect(COACHED).toContain('snooze');
  });
});

describe('3. there is a quiet way out, and it asks them to stay', () => {
  it('offers one dim word rather than a button competing with the card', () => {
    expect(COPY.leave).toBe('Skip');
    expect(COPY.leave.split(' ')).toHaveLength(1);
  });

  it('asks friendly rather than telling anybody off', () => {
    expect(COPY.leaveHead).toMatch(/\?$/);
    for (const line of [COPY.leaveHead, COPY.leaveLine]) {
      expect(line).not.toMatch(/\b(don't|won't|can't|fail|lost|mistake|wrong|warning)\b/i);
    }
  });

  it('says the walk can be had again, and names where from', () => {
    expect(COPY.leaveLine).toMatch(/⌘K/);
  });

  it('claims no number nobody has measured', () => {
    expect(COPY.leaveLine).not.toMatch(/\b(minute|minutes|second|seconds|\d+)\b/i);
  });

  it('draws one of the two and lets the other go quietly', () => {
    // THE TWO SHAPES ARE HERS AND THEY STAY. WHICH BUTTON WEARS WHICH SWAPPED
    // ON 2026-08-28: a tester pressed Skip and was met by a focused, drawn
    // "Keep going", so the card was arguing with somebody who had already
    // answered it. The words are unchanged, the shapes are unchanged, and
    // which one is recommended is pinned next door in
    // tests/her-way-out-of-the-walk-really-works.test.mjs.
    expect(COPY.leaveStay).toBe('Keep going');
    expect(COPY.leaveGo).toBe('Skip it');
    expect(css).toMatch(/\.fr-stay-keep\s*\{/);
    expect(css).toMatch(/\.fr-stay-go\s*\{/);
    expect(css).toMatch(/\.fr-out\s*\{/);
  });

  it('sits out of the way, dim, and in the practice strip rather than over the app', () => {
    // It was 22px off the bottom right corner of the window, which during the
    // tutorial is where the reading pane's reply box is fixed. The strip is the
    // walk's own 38px and the app is pushed down by exactly that height.
    const rule = css.slice(css.indexOf('.fr-out {'), css.indexOf('.fr-out:hover'));
    expect(rule).toMatch(/position: fixed/);
    // Bottom left since 2026-10-05 (w-9f6975906c): top: 0 is the title bar
    // band, where her clicks on it never landed.
    expect(rule).toMatch(/left: \d+px/);
    expect(rule).toMatch(/bottom: \d+px/);
    // 22 tall in the strip under the sidebar since 2026-10-06: at 38 it sat on
    // Settings once the sidebar's foot ended at Settings.
    expect(rule).toMatch(/height: 22px/);
    // DIM, AND NOT SO DIM THAT SHE HAD TO BE TOLD IT WAS THERE. It was 0.45,
    // which over the dark photograph the walk wears measured 3.01:1 against the
    // strip behind it (the harness, off the painted
    // pixels). Raised on 2026-08-28 with a tester's call, and the ceiling is
    // still the built walk's own: shot-the-built-walk.mjs fails above 0.6.
    expect(Number(rule.match(/opacity: ([\d.]+)/)[1])).toBeLessThanOrEqual(0.6);
    // No border and no fill: it is furniture, not a call to action.
    expect(rule).toMatch(/border: 0/);
    expect(rule).toMatch(/background: none/);
    // The strip drags the window, so anything clickable inside it has to say so
    // — and on 2026-08-28 that turned out not to be enough on its own, which is
    // the whole of. The strip's drag lane now stops short of this button as
    // well; both halves are pinned in
    // tests/her-way-out-of-the-walk-really-works.test.mjs.
    expect(rule).toMatch(/-webkit-app-region: no-drag/);
    // And over the band it sits in, and under the card it opens.
    const band = css.slice(css.indexOf('.fr-band {'), css.indexOf('.fr-band-pill'));
    const zOf = (r) => Number((r.match(/z-index: (\d+)/) || [])[1]);
    expect(zOf(rule)).toBeGreaterThan(zOf(band));
    const stay = css.slice(css.indexOf('.fr-stay-scrim {'), css.indexOf('.fr-stay {'));
    expect(zOf(stay)).toBeGreaterThan(zOf(rule));
  });

  it('is on the tutorial and on none of the pages before it', () => {
    // It was on every screen of the walk for one build.
    const way = onboardingCode.slice(
      onboardingCode.indexOf('export function WayOut'),
      onboardingCode.indexOf('THE DOTS ARE GONE'),
    );
    expect(way).toMatch(/!practising\(run\)/);
    expect(app).toMatch(/\{run && \(\s*<WayOut/);
    // Which is exactly the ten beats the practice band is up for, and not
    // one of the screens before them, nor the finish card. The three slabs
    // left this list on 2026-10-05 (w-9f6975906c), with the walk.
    for (const step of ['welcome', 'folder', 'name', 'hand']) {
      expect(IN_PRACTICE).not.toContain(step);
    }
    expect(IN_PRACTICE).not.toContain('done');
    expect(IN_PRACTICE).not.toContain('landed');
    // The look around is the first of them since 2026-10-06.
    expect(IN_PRACTICE[0]).toBe('tour');
    expect(IN_PRACTICE.at(-1)).toBe('command');
  });

  it('is hidden when leaving would land on the same held screen', () => {
    // Without Claude Code the app holds the inbox shut, so skipping the walk
    // gets nobody anywhere.
    expect(app).toMatch(/blocked=\{!mayOpenInbox\(claude\)\}/);
  });

  it('lands them in their own project without throwing them a party for leaving', () => {
    expect(app).toMatch(/onLeave=\{\(\) => finishRun\(\[\], \{ celebrate: false \}\)\}/);
    expect(app).toMatch(/if \(celebrate\) setLanding/);
  });

  it('has no key on it, so it never competes with the key the card is asking for', () => {
    // NO KEY INTO IT. THERE IS ONE BACK OUT OF THE CARD IT OPENS, AND THE TWO
    // ARE NOT THE SAME THING. This used to forbid any keydown listener at all
    // in here, on the argument that a shortcut to Skip would compete with the
    // cap the beat is asking for. That argument is still right and is still
    // checked, one line down: nothing opens this card but a press of the
    // button.
    //
    // Escape dismissing a dialog is not a shortcut to anything; it is how
    // every dialog on this machine is put down.
    const way = onboarding.slice(
      onboarding.indexOf('export function WayOut'),
      onboarding.indexOf('THE DOTS ARE GONE'),
    );
    expect(way.match(/setAsking\(true\)/g)).toHaveLength(1);
    expect(way).toMatch(/className="fr-out" onClick=\{\(\) => setAsking\(true\)\}/);
    expect(way).not.toMatch(/<kbd/);
  });
});
