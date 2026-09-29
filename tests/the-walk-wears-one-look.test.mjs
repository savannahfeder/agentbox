// THE WALK DOES NOT CHANGE ITS MIND ABOUT WHAT IT IS WEARING.
//
//   "Same issues as before, it changes theme constantly in the middle of it.
//    E.g., it starts at the something valley theme then on this page goes light
//    mode. Fix it then test the flow at least once to make sure the theme that
//    is showing is correct and consistent."
//
// TWO THINGS PUT THAT SCREEN ON HER MAC AND EITHER ONE ALONE DOES IT.
//
// The first is a list that went stale. App.tsx pinned the picture on `welcome
// || folder || name`, written on 08-24 when the picker was beat four, so those
// three WERE every screen before it. The introduction's three slabs slid in
// front of it and nothing extended the pin. On a Mac that has never chosen
// anything the first-run seed makes the store Gouache Valley anyway and the
// fault is invisible; on hers, which HAS chosen, the slabs fell through to
// plain light. That is the screen she photographed. The pin is read off the
// step order now, so moving the picker again moves the pin with it.
//
// The second is that the walk was painting rather than wearing. Even with the
// pin extended, beat seven has to lift it: a picker that paints the default
// back over a pressed tile does not work, and that was measured on 08-24. So
// the picker read her store, opened white with Light ticked, and the flip moved
// from beat four to beat seven rather than going away.
//
// THE FIX FOR THAT SECOND HALF WAS `startTheWalkOnAPicture` AND IT IS DELETED.
// It cured the flicker by WRITING Gouache Valley into any store that had no
// picture, every time the walk ran, and ⌘K's "Run the onboarding again" is a
// row she uses.A look nobody picked was on her window.
//
// So the pictures are back and the writing is gone. THE WALK NEVER WRITES, and
// that is the half of this file that has not moved and must not.
//
// WHAT IT PAINTS DID MOVE, ON 2026-09-01. The flicker she photographed on 08-26
// stays fixed and nothing is written into a store that has already answered.
//
// WHAT THIS FILE HOLDS: that the pin covers every screen before the picker and
// not the picker, and that starting the walk moves nobody's look.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEPS, wearsTheWalksLook } from '../renderer/src/onboarding.ts';
import {
  SKINS, SKIN_KEY, idleSkin, seedFirstRunLook, walkSkin,
} from '../renderer/src/skins.ts';
import { THEME_KEY } from '../renderer/src/theme.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
const skins = fs.readFileSync(path.join(root, 'renderer/src/skins.ts'), 'utf8');

const store = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    all: () => Object.fromEntries(m),
  };
};

/* ========================================================================== */
/* 1. THE PIN COVERS EVERY SCREEN BEFORE THE PICKER                           */
/* ========================================================================== */

describe('the pin runs from the first screen to the one before the picker', () => {
  it('covers the three setup screens', () => {
    expect(wearsTheWalksLook('welcome')).toBe(true);
    expect(wearsTheWalksLook('folder')).toBe(true);
    expect(wearsTheWalksLook('name')).toBe(true);
  });

  // THE THREE SHE PHOTOGRAPHED. `inbox` is the "1 OF 3" slab in her shot.
  it('covers the three introduction slabs, which is the screen she sent', () => {
    expect(wearsTheWalksLook('inbox')).toBe(true);
    expect(wearsTheWalksLook('away')).toBe(true);
    expect(wearsTheWalksLook('goal')).toBe(true);
  });

  // NOT THE PICKER. Measured on 08-24: the pin painted the default back over
  // every tile press, so the picker moved storage and the tick and left the
  // window alone. A picture of a picker rather than a picker.
  it('is off on the picker itself', () => {
    expect(wearsTheWalksLook('look')).toBe(false);
  });

  // AND NOT ONE BEAT AFTER IT. Everything from the hand-off on is the real app
  // wearing what she just chose, and that is hers, not ours.
  it('is off on every beat after the picker', () => {
    const after = STEPS.slice(STEPS.indexOf('look') + 1);
    expect(after.length).toBeGreaterThan(10);
    for (const step of after) expect(wearsTheWalksLook(step)).toBe(false);
  });

  // THE REGRESSION ITSELF, stated as the thing that must stay true however the
  // order is edited: the pinned steps are exactly the prefix before the picker,
  // with no hole in the middle.
  it('is exactly the prefix of STEPS before the picker, with no gap', () => {
    const pinned = STEPS.filter(wearsTheWalksLook);
    expect(pinned).toEqual(STEPS.slice(0, STEPS.indexOf('look')));
    expect(pinned.length).toBe(6);
  });

  // AND APP.TSX ASKS THE ORDER RATHER THAN CARRYING ITS OWN COPY OF IT. The
  // stale literal is the whole defect, so its shape is refused here.
  it('App.tsx reads the rule and does not name the steps itself', () => {
    expect(app).toContain('wearsTheWalksLook(run.step)');
    expect(app).not.toMatch(/run\.step === 'welcome' \|\| run\.step === 'folder'/);
  });
});

/* ========================================================================== */
/* 2. STARTING THE WALK MOVES NOBODY'S LOOK                                   */
/* ========================================================================== */

describe('starting the walk leaves the look alone', () => {
  // HER MAC. Set up months ago, plain light, no picture, reaching the walk from
  // ⌘K's "Run the onboarding again". This is the store that used to come out of
  // the walk wearing Gouache Valley, and it is exactly the complaint she filed.
  it('leaves a Mac that is set up and has no picture on', () => {
    const s = store({ [THEME_KEY]: 'light', [SKIN_KEY]: 'none' });
    expect(seedFirstRunLook(s, THEME_KEY)).toBe(null);
    expect(s.getItem(SKIN_KEY)).toBe('none');
    expect(s.getItem(THEME_KEY)).toBe('light');
  });

  // AND THE FUNCTION THAT DID IT IS GONE RATHER THAN GUARDED. A guard is one
  // careless edit from being loosened again; there is nothing here to loosen.
  it('has no function anywhere that writes a picture nobody picked', () => {
    expect(skins).not.toContain('export function startTheWalkOnAPicture');
    expect(app).not.toContain('startTheWalkOnAPicture(');
  });

  // A BRAND NEW MAC GETS GOUACHE VALLEY.That is a DEFAULT, which is written
  // down and is then theirs to change, and it is a different thing from the
  // walk putting a look on a store that has already chosen. The test above is
  // the one that holds the second, and it is untouched.
  it('seeds a fresh store with the default picture', () => {
    const s = store();
    expect(seedFirstRunLook(s, THEME_KEY)).toEqual({ theme: 'dark', skin: 'ember-grid' });
    expect(s.getItem(THEME_KEY)).toBe('dark');
    expect(s.getItem(SKIN_KEY)).toBe('ember-grid');
  });

  // AND ANYBODY WHO HAS PICKED ONE KEEPS IT.
  it('leaves a Mac that is already wearing one of the pictures', () => {
    const other = SKINS[0].id;
    const s = store({ [THEME_KEY]: 'dark', [SKIN_KEY]: other });
    expect(seedFirstRunLook(s, THEME_KEY)).toBe(null);
    expect(s.getItem(SKIN_KEY)).toBe(other);
  });
});

/* ========================================================================== */
/* 3. THE PIN PAINTS WHAT IS ON, AND NOTHING WHEN NOTHING IS                  */
/* ========================================================================== */

describe('the pin paints the picture that is on', () => {
  it('paints no picture at all at inbox zero when none was picked', () => {
    // THE RULE MOVED INTO skins.ts ON 2026-08-27.
    expect(app).toContain('const pinned: SkinChoice = idleSkin(skin);');
    expect(idleSkin('none')).toBe('none');
    expect(idleSkin('lake')).toBe('lake');
    expect(app).toContain('applySkin(pinned)');
  });

  // AND THE WALK IS THE OTHER RULE, SPLIT OFF ON 2026-09-01. One function each,
  // because they answer differently now: the introduction is the first screen
  // anybody sees and it opens on a picture, the idle page is a page she reaches
  // by clearing her inbox and it opens on hers or on nothing.
  it('paints Gouache Valley on the walk when none was picked', () => {
    expect(app).toContain('const pinned: SkinChoice = walkSkin(skin);');
    // Gouache Valley since w-ec62ab6b38 (2026-09-28), whatever the default is.
    expect(walkSkin('none')).toBe('gouache-valley');
    expect(walkSkin('lake')).toBe('lake');
  });
});
