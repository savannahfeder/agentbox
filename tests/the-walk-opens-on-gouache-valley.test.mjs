// Default updated to Valley Haze on 2026-09-14; explicit pictures stay
// unchanged. WHAT THE TUTORIAL IS WEARING WHEN IT OPENS.
//
// Two lines did that together. `firstRunPinned` pins the six screens before the
// picker, and what it painted was `idleSkin(skin)`, which is her stored picture
// and NOTHING when she has none; alongside it `applyTheme('dark')` threw away
// the light her Mac was asking for. So somebody on Match my system, or on plain
// Light, walked into six charcoal slabs and no picture at all. That is what she
// photographed.
//
// THE RULE NOW: the walk opens on a PICTURE. Her own if she has picked one,
// which is her 2026-08-26 answer and is not being taken back here, and Gouache
// Valley when she has not. Nobody walks the introduction on a bare slab any
// more.
//
// AND NOTHING IS STORED, WHICH IS THE HALF THAT MATTERS. This is a PIN: it
// paints and writes nothing, so her look is exactly as she left it the moment
// the picker opens and for good after the walk. The function that WROTE a
// picture into her store, `startTheWalkOnAPicture`, is still gone and this does
// not bring it back.
//
// THE SEED IS THE OTHER HALF OF "FOR EVERYONE". A brand new Mac is written
// Gouache Valley rather than plain dark, so somebody meeting the app for the
// first time walks the whole introduction, opens the picker with Gouache Valley
// already ticked, and sees the window flip at no point at all. That is the
// flicker she reported on 08-26 and it is the only way to close it for a new
// install. It only ever writes into an EMPTY store, so nobody who has chosen
// anything is moved.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEPS, wearsTheWalksLook } from '../renderer/src/onboarding.ts';
import { DEFAULT_SKIN, SKINS, SKIN_KEY, idleSkin, seedFirstRunLook, walkSkin } from '../renderer/src/skins.ts';
import { THEME_KEY } from '../renderer/src/theme.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

const store = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
  };
};

describe('the picture the walk opens on', () => {
  // HER CASE, EXACTLY. Match my system stored, no picture, so the walk had
  // nothing to paint and painted nothing.
  it('is Gouache Valley for somebody who has picked no picture', () => {
    // Gouache Valley again, not the default (w-ec62ab6b38, 2026-09-28). Hers:
    // "I really liked how there was maybe a theme that showed a landscape
    // behind it, especially in the setup before you chose your theme."
    expect(walkSkin('none')).toBe('gouache-valley');
    // The seeded default counts as not picked: a new Mac is seeded Ember.
    expect(walkSkin(DEFAULT_SKIN)).toBe('gouache-valley');
  });

  // THE CASE THAT MUST NOT CHANGE, and it is the one that gets skipped: a
  // person who HAS picked keeps their own picture through the walk.
  it('is her own picture when she has picked one, not Gouache Valley', () => {
    expect(walkSkin('cel-dusk')).toBe('cel-dusk');
    expect(walkSkin('lake')).toBe('lake');
    // Every picture but the seeded default, which a new Mac never chose.
    for (const s of SKINS) if (s.id !== DEFAULT_SKIN) expect(walkSkin(s.id)).toBe(s.id);
  });

  // The boundary the other way: Gouache Valley picked deliberately is answered
  // the same as Gouache Valley by default, so the two are indistinguishable on
  // screen and only the store can tell them apart.
  it('leaves Gouache Valley alone when it is the picked one', () => {
    expect(walkSkin('gouache-valley')).toBe('gouache-valley');
  });

  // IT PAINTS AND IT DOES NOT WRITE. The pin is applied in an effect off state;
  // nothing in the pinned branch may touch localStorage, or the walk is once
  // again choosing a look for her.
  it('is a pin: App.tsx paints it and stores nothing', () => {
    const branch = app.slice(app.indexOf('if (firstRunPinned)'), app.indexOf('applyTheme(resolveTheme(theme))'));
    expect(branch).toContain('walkSkin(skin)');
    expect(branch).not.toContain('localStorage.setItem');
    expect(branch).not.toContain(`setItem(SKIN_KEY`);
  });

  // AND THE INBOX ZERO PAGE IS NOT THIS RULE. It kept her 08-30 answer: a
  // picture appears there only where somebody picked one. Two pins, two rules,
  // and conflating them is what this test exists to stop.
  it('is not the same rule as the idle page, which still paints nothing', () => {
    expect(idleSkin('none')).toBe('none');
    expect(walkSkin('none')).not.toBe(idleSkin('none'));
  });
});

describe('which screens open on it', () => {
  // Unchanged and restated here because this rule now decides which picture
  // rather than only whether: the six screens before the picker, and the picker
  // itself repaints under her hand.
  it('is every screen before the picker and none after it', () => {
    expect(STEPS.filter(wearsTheWalksLook)).toEqual(STEPS.slice(0, STEPS.indexOf('look')));
    expect(wearsTheWalksLook('look')).toBe(false);
    expect(wearsTheWalksLook('hand')).toBe(false);
  });
});

describe('a brand new Mac', () => {
  it('is seeded Gouache Valley, so the walk never flips at the picker', () => {
    const s = store();
    expect(seedFirstRunLook(s, THEME_KEY)).toEqual({ theme: 'dark', skin: 'ember-grid' });
    expect(s.getItem(SKIN_KEY)).toBe('ember-grid');
    // A picture implies dark, and the theme key is written with it so the two
    // cannot disagree one layer down.
    expect(s.getItem(THEME_KEY)).toBe('dark');
  });

  // THE CASE THAT MUST NOT MATCH. The seed is a fresh-install default, never a
  // migration: anybody who has chosen anything at all, including plain dark and
  // including Match my system, is left exactly where they are.
  it('does not touch a Mac that has already chosen, including Match my system', () => {
    for (const seed of [
      { [THEME_KEY]: 'match' },
      { [THEME_KEY]: 'light', [SKIN_KEY]: 'none' },
      { [THEME_KEY]: 'dark', [SKIN_KEY]: 'none' },
      { [SKIN_KEY]: 'cel-dusk' },
    ]) {
      const s = store(seed);
      expect(seedFirstRunLook(s, THEME_KEY)).toBe(null);
      for (const [k, v] of Object.entries(seed)) expect(s.getItem(k)).toBe(v);
    }
  });
});
