// A TUTORIAL CARD WITH NOTHING TO POINT AT STILL DIMS THE APP BEHIND IT
// (w-58c8f466e7, 2026-10-02).
//
// "Make sure the background is dimmed or something whenever you're trying to
// illustrate something that overlaps with something else, because the
// Command-K thing looks a little funky."
//
// MEASURED off the built renderer at the ⌘K beat, straight after B opened the
// board: the card "Everything you just did is one key away" was printed over
// the first cards of the Needs you and In progress columns, at full strength,
// with no veil at all. Every beat that rings something draws the veil
// (`<Veil box={geo.ring} />`); the card that falls back to a fixed place when
// there is nothing to ring (`fr-adrift`, components/Onboarding.tsx) returned
// the card alone. That fallback is the ⌘K beat on the workspace layout, which
// has no ⌘ button to ring.
//
// WHAT THIS FILE HOLDS. The floating card draws the veil with it, the whole
// window dimmed since there is no ring to leave a hole for; the ringed card
// keeps its hole; and nothing is drawn, veil included, when the card itself
// is not, which is the grace before a beat goes adrift and the moment a modal
// is open over the app.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const view = fs.readFileSync(path.join(root, 'renderer/src/components/Onboarding.tsx'), 'utf8');
const ringed = view.slice(view.indexOf('function Ringed('), view.indexOf('function Finished('));
const floating = ringed.slice(ringed.indexOf('  if (!geo) {'), ringed.indexOf('  const pad = 10;'));

describe('the card that floats', () => {
  it('draws the veil with it', () => {
    expect(floating).toContain('fr-adrift');
    expect(floating).toMatch(/<Veil[^>]*box=\{null\}/);
  });

  it('dims the whole window, because there is no ring to leave a hole for', () => {
    expect(floating).not.toContain('geo.ring');
  });

  it('draws no veil while it is not drawn either', () => {
    // THE CASE THAT MUST NOT MATCH. Between two beats, and under a modal, the
    // card is held back on purpose; a veil there would dim the app with no
    // words on it to say why.
    expect(floating).toMatch(/if \(!adrift\) return null;/);
  });
});

describe('the card that points at something', () => {
  it('keeps its veil with the hole over the ring', () => {
    expect(ringed.slice(ringed.indexOf('  const pad = 10;'))).toContain('<Veil key={knock} box={geo.ring}');
  });
});
