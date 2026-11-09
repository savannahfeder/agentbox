// THE PHONE WAITS ON THE LOGO, RUNNING ROUND ITS RING.
//
// Why (w-eb1e55360c): phone loads are often long, and the wait showed nothing
// worth watching. The ask was to animate the logo, which was drawn from the
// thinking animation in the first place. Of five drawn ideas, Orbit was picked:
// the logo's one orange dot leaves its corner and runs round the ring of eight
// at the thinking mark's own 186ms step, the centre staying grey.
//
// What it replaced, measured on main at 27baf0c. The phone app drew an empty
// wall while it opened its saved state, then an empty list while the first
// rows loaded, then an empty line on a thread it had not read yet. The phone
// website drew the app's name in the faintest grey there is, and after six
// seconds swapped even that for "Agentbox is not answering." Four waits, none
// of them moving.
//
// The order and the timing are one rule in renderer/src/logo-orbit.ts, read by
// the website and the phone app both, so the two cannot drift apart.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORBIT_CELLS, ORBIT_CENTRE, ORBIT_CORNER, ORBIT_CYCLE_MS, ORBIT_STEP_MS, ORBIT_KEYS, orangeAt, orbitDelay, orbitLap,
} from '../renderer/src/logo-orbit.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');

describe('the ring', () => {
  it('starts at the orange corner, where the logo keeps it', () => {
    expect(ORBIT_CORNER).toBe(2);
    expect(ORBIT_CELLS[0]).toBe(ORBIT_CORNER);
  });

  it('runs clockwise through all eight outer dots, once each', () => {
    // Reading order is 0 1 2 / 3 4 5 / 6 7 8, so clockwise from the top right
    // is down the right side, back along the bottom, up the left, along the top.
    expect(ORBIT_CELLS).toEqual([2, 5, 8, 7, 6, 3, 0, 1]);
    expect(new Set(ORBIT_CELLS).size).toBe(8);
  });

  it('never lights the centre', () => {
    expect(ORBIT_CENTRE).toBe(4);
    expect(ORBIT_CELLS).not.toContain(ORBIT_CENTRE);
    for (let t = 0; t < ORBIT_CYCLE_MS; t += 31) expect(orangeAt(ORBIT_CENTRE, t)).toBe(0);
  });

  it('moves at the desktop thinking mark’s step', () => {
    const thinking = read('renderer', 'src', 'components', 'LiveMark.tsx');
    expect(thinking).toMatch(/phase \* 186 - 1488/);
    expect(ORBIT_STEP_MS).toBe(186);
    expect(ORBIT_CYCLE_MS).toBe(ORBIT_STEP_MS * 8);
  });
});

describe('one orange dot at a time', () => {
  it('has the corner fully orange at the start of the cycle', () => {
    expect(orangeAt(ORBIT_CORNER, 0)).toBe(1);
    expect(orbitDelay(ORBIT_CORNER)).toBe(-ORBIT_CYCLE_MS);
  });

  it('hands the orange on one step later, to the next dot down', () => {
    expect(orangeAt(5, ORBIT_STEP_MS)).toBe(1);
    expect(orangeAt(ORBIT_CORNER, ORBIT_STEP_MS)).toBeLessThan(1);
    expect(orangeAt(ORBIT_CORNER, ORBIT_STEP_MS)).toBeGreaterThan(0);
  });

  it('is never two full oranges at once, which is what the first draft did', () => {
    // The first drawing held each dot orange for 11% of the cycle, longer than
    // the 12.5% a step lasts once the fade is added, and three dots read as
    // orange at once. Her accent rule: orange stays on one small thing.
    expect(ORBIT_KEYS[1][0]).toBeLessThan(1 / 8);
    for (let t = 0; t < ORBIT_CYCLE_MS; t += 7) {
      const full = ORBIT_CELLS.filter((c) => orangeAt(c, t) >= 0.99);
      expect(full.length).toBeLessThanOrEqual(1);
    }
  });

  it('leaves a short tail and nothing more', () => {
    // Two steps behind the head is grey again.
    expect(orangeAt(ORBIT_CORNER, ORBIT_STEP_MS * 3)).toBe(0);
  });
});

describe('the phone app’s clock draws the same lap', () => {
  // The phone app runs one clock from 0 to 1 a lap and maps it to each dot's
  // orange through straight lines between points. The first version of those
  // points left out the moment a dot snaps on, so every dot faded back up
  // across most of its lap: measured in the preview, seven of the nine were
  // part orange at once, 0.37, 0.20, 0.03, 0.45, 0.39, 0.56 and 0.75 beside
  // the 1.00 that was meant to be alone.
  const at = ({ inputRange, outputRange }, x) => {
    for (let k = 1; k < inputRange.length; k += 1) {
      if (x <= inputRange[k]) {
        const span = inputRange[k] - inputRange[k - 1];
        return span === 0 ? outputRange[k] : outputRange[k - 1] + ((x - inputRange[k - 1]) / span) * (outputRange[k] - outputRange[k - 1]);
      }
    }
    return outputRange[outputRange.length - 1];
  };

  it('starts at 0 and ends at 1, never going backwards', () => {
    for (const cell of ORBIT_CELLS) {
      const { inputRange } = orbitLap(cell);
      expect(inputRange[0]).toBe(0);
      expect(inputRange[inputRange.length - 1]).toBe(1);
      for (let k = 1; k < inputRange.length; k += 1) expect(inputRange[k]).toBeGreaterThan(inputRange[k - 1]);
    }
  });

  it('matches the shared lap at every moment, away from the instant a dot snaps on', () => {
    for (const cell of ORBIT_CELLS) {
      const lap = orbitLap(cell);
      for (let ms = 0; ms < ORBIT_CYCLE_MS; ms += 5) {
        const snap = ((orbitDelay(cell) + ORBIT_CYCLE_MS) % ORBIT_CYCLE_MS);
        if (Math.abs(ms - snap) < 2) continue;
        expect(at(lap, ms / ORBIT_CYCLE_MS)).toBeCloseTo(orangeAt(cell, ms), 2);
      }
    }
  });

  it('is one full orange and at most two part ones, at any moment', () => {
    for (let ms = 3; ms < ORBIT_CYCLE_MS; ms += 11) {
      const lit = ORBIT_CELLS.map((c) => at(orbitLap(c), ms / ORBIT_CYCLE_MS)).filter((v) => v > 0.01);
      expect(lit.length).toBeLessThanOrEqual(3);
    }
  });

  it('has nothing for the centre', () => {
    expect(orbitLap(ORBIT_CENTRE)).toBeNull();
  });
});

describe('the website draws it', () => {
  const app = read('renderer', 'src', 'App.tsx');
  const css = read('renderer', 'src', 'styles.css');
  const mark = read('renderer', 'src', 'components', 'LogoOrbit.tsx');

  it('on the boot screen, instead of the grey wordmark', () => {
    const booting = app.slice(app.indexOf('function Booting()'), app.indexOf('/** What Tab reaches'));
    expect(booting).toMatch(/<LogoOrbit \/>/);
    expect(booting).not.toMatch(/<span>\{NAME\}<\/span>/);
  });

  it('keeps it moving when the slow-load sentence arrives', () => {
    // A long load on a phone is the ordinary case, so the sentence goes under
    // the mark rather than replacing it.
    const booting = app.slice(app.indexOf('function Booting()'), app.indexOf('/** What Tab reaches'));
    expect(booting).toMatch(/<div className="boot boot-stuck"><LogoOrbit \/><p>\{said\}<\/p><\/div>/);
  });

  it('times each dot off the shared rule', () => {
    expect(mark).toMatch(/from '\.\.\/logo-orbit'/);
    expect(mark).toMatch(/orbitDelay\(/);
    expect(css).toMatch(/animation: logo-orbit 1488ms linear infinite/);
  });

  it('holds the CSS fade to the shared keys', () => {
    const frames = css.slice(css.indexOf('@keyframes logo-orbit'), css.indexOf('@keyframes logo-orbit') + 300);
    for (const [at, orange] of ORBIT_KEYS) {
      if (at === 1) continue;
      expect(frames).toContain(`${Math.round(at * 100)}%`);
      expect(frames).toContain(`opacity: ${orange}`);
    }
  });

  it('stops on the plain logo when the phone asks for less motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.logo-orbit-dot::after \{ animation: none; opacity: 0; \}\s*\.logo-orbit-dot\[data-corner\]::after \{ opacity: 1; \}/);
  });
});

describe('the phone app draws it', () => {
  const inbox = read('mobile', 'src', 'app', 'index.tsx');
  const thread = read('mobile', 'src', 'app', 'thread', '[product]', '[id].tsx');
  const mark = read('mobile', 'src', 'ui', 'LogoOrbit.tsx');

  it('while it opens', () => {
    expect(inbox).toMatch(/if \(!c\.opened\) return <Wall><Waiting \/><\/Wall>;/);
  });

  it('while the first rows load, and not once they have', () => {
    expect(inbox).toMatch(/ListEmptyComponent=\{c\.loading \? <Waiting list \/> :/);
  });

  it('while a thread it has not read yet loads', () => {
    expect(thread).toMatch(/if \(gate === 'wait'\) return <Wall><Waiting \/><\/Wall>;/);
    expect(thread).toMatch(/c\.loading \? <Waiting list \/> :/);
  });

  it('off the same rule, and still for anyone who asked for less motion', () => {
    expect(mark).toMatch(/from '\.\.\/\.\.\/\.\.\/renderer\/src\/logo-orbit'/);
    expect(mark).toMatch(/isReduceMotionEnabled/);
    // Native on a phone; in the browser preview a native loop never moved.
    expect(mark).toMatch(/useNativeDriver: Platform\.OS !== 'web'/);
  });
});
