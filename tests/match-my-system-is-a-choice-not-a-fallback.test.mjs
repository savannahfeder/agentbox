// MATCH MY SYSTEM: A LOOK SOMEBODY PICKS, NEVER SOMETHING THAT HAPPENS TO THEM.
//
// Both halves of that sentence are load-bearing and they pull in opposite
// directions, which is why this file exists. The FIRST half is the bug that was
// fixed then: with nothing stored the app fell through to `prefers-color-scheme`,
// A tester's Mac was light, and the walk went white the moment it left the third
// screen. The SECOND half is the feature built on 2026-08-24, on this row, and
// building it means letting the Mac back into the renderer in exactly one place.
//
// So the invariant is not "never read the Mac" any more. It is:
//
//   READING THE MAC IS REACHABLE ONLY FROM A STORED `match`, and an empty store,
//   a junk value and every other look still answer dark without asking.
//
// tests/theme-choice.test.mjs holds the other half of it: theme.ts is the only
// file in the renderer allowed to contain the words at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePick, resolveTheme } from '../renderer/src/theme.ts';
import { LOOKS, lookMeans, lookOf } from '../renderer/src/skins.ts';
import { lookRows } from '../renderer/src/palette-rows.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// The test runner has no `matchMedia`, which is itself worth pinning: the
// guarded reader in theme.ts must answer dark rather than throw, because a
// picker that crashes on a machine with no media engine is worse than one that
// shows the wrong colour.
describe('a machine that cannot be asked', () => {
  it('answers dark instead of throwing', () => {
    expect(resolveTheme('match')).toBe('dark');
  });
});

describe('the store still decides, and dark is still the answer to silence', () => {
  it('answers dark for an empty store, exactly as before', () => {
    expect(resolveTheme(null)).toBe('dark');
    expect(resolveTheme(undefined)).toBe('dark');
    expect(resolveTheme('')).toBe('dark');
  });

  it('answers dark for junk, and never treats junk as a request to match', () => {
    // The whole failure mode: a typo in a settings file must not be able to hand
    // the window over to the Mac.
    for (const junk of ['auto', 'system', 'MATCH', 'Match', 'sepia', 'DARK']) {
      expect(resolveTheme(junk), junk).toBe('dark');
      expect(resolvePick(junk), junk).toBe('dark');
    }
  });

  it('keeps light and dark exactly what they were', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolvePick('light')).toBe('light');
    expect(resolvePick('dark')).toBe('dark');
  });

  it('reads `match` back as the PICK, not as the colour it happens to be', () => {
    // Somebody on Match my system on a light Mac must see the Match tile ticked
    // and not the Light one, so the two functions answer different questions.
    expect(resolvePick('match')).toBe('match');
    expect(lookOf('match', 'none')).toBe('match');
  });
});

describe('it is stored as itself, not frozen into a colour', () => {
  it('goes into the store as `match`', () => {
    // Turning it into light or dark at the moment of the press is the one thing
    // this look exists not to do: the Mac flips at sunset on its own.
    expect(lookMeans('match')).toEqual({ theme: 'match', skin: 'none' });
  });

  it('is a theme and not a picture, so it never lands on the skin axis', () => {
    expect(lookMeans('match').skin).toBe('none');
  });

  it('loses to a picture, because a picture is dark', () => {
    // A picture on top of Match my system would be a window following the Mac
    // into light with a photograph that only exists in dark.
    expect(lookOf('match', 'lake')).toBe('lake');
  });
});

// 2026-09-14: legacy storage remains readable, but the option is retired.
describe('system matching is no longer offered', () => {
  it('is absent from the catalog and command menu', () => {
    expect(LOOKS.map((l) => l.id)).not.toContain('match');
    for (const look of ['dark', 'light', 'match', 'lake']) {
      expect(lookRows(look).some((r) => r.to === 'match')).toBe(false);
    }
  });

  it('does not put a second row under the word she types most', () => {
    // Her fix on: typing "dark" finds exactly one row. A second row under it is
    // the choice she should not have to make correctly at speed. The toggle row
    // owns those two words and is meant to. What must not exist is a SECOND row
    // carrying them, which is what the Match my system row did when its
    // keywords were first written.
    for (const look of ['dark', 'light', 'match', 'lake']) {
      for (const word of ['dark', 'light']) {
        const rows = lookRows(look).filter((r) => r.keywords.includes(word));
        expect(rows.map((r) => r.id), `${look} / ${word}`).toEqual(['theme']);
      }
    }
  });
});

describe('the window is told a colour, never the pick', () => {
  it('resolves before it applies, in App.tsx', () => {
    // `applyTheme('match')` would write data-theme="match" on the root, which no
    // token block answers: a window with no colours defined at all.
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/applyTheme\(resolveTheme\(theme\)\)/);
    expect(app, 'App.tsx applies the pick straight to the root').not.toMatch(/applyTheme\(theme\)[;)]/);
  });

  it('follows the Mac while the app is open, not only at launch', () => {
    // Following it once at boot and never again is a promise half kept.
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/onMachineTheme\(setMachine\)/);
    expect(app).toMatch(/\[idlePinned, firstRunPinned, theme, skin, machine\]/);
  });

  it('tells the stylesheet which way the Mac points, for the tile', () => {
    // A CSS rule cannot ask the Mac and the renderer already knows, so this is
    // the one place the answer crosses over.
    expect(read('renderer/src/App.tsx')).toMatch(/setAttribute\('data-machine', machine\)/);
    const css = read('renderer/src/styles.css');
    expect(css).toMatch(/:root\[data-machine="light"\] \.look-swatch\.match \{/);
    expect(css).toMatch(/:root\[data-machine="dark"\] \.look-swatch\.match,/);
  });

  it('draws the half circle, which is the only thing that says it is the following one', () => {
    // On a dark Mac the tile is a picture of the dark inbox and so is the Dark
    // tile beside it.
    const mark = read('renderer/src/components/MatchMark.tsx');
    expect(mark).toMatch(/class(Name)?="match-mark"/);
    for (const src of [
      'renderer/src/components/Settings.tsx',
      'renderer/src/components/ThemePicker.tsx',
      'renderer/src/components/Onboarding.tsx',
    ]) {
      expect(read(src), `${src} draws no mark on the match tile`).toMatch(/l\.id === 'match' && <MatchMark \/>/);
    }
  });
});
