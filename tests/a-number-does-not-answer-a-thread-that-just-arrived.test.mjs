// PRESSING 1 CANNOT SHIP A THREAD YOU HAVE NOT READ.
//
// Found by a tester on the Linux box, 2026-10-23 (F-31): in Needs you, 1 sends
// option 1 at once and the selection jumps to the next thread, "so it is easy
// to ship the wrong thread". The send and the advance are both the design; the
// seam between them is not. The thread on screen is replaced while your hand is
// still over the keys, and the next press goes to whatever arrived.
//
// So the one key that sends is inert for a moment after the app moved you, and
// says so rather than going quiet. Everything else about the key is unchanged,
// including the three second window Z takes it back in.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIMED_AT_THE_THREAD_YOU_LEFT, PICK_SETTLES_MS, pickLandsHere } from '../renderer/src/pick-settles.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
const now = 1_000_000;
const here = 'kestrel/w-d4';
const arrival = (at) => ({ key: here, at });

describe('a number pressed on the thread the app just moved you to', () => {
  it('does not answer it', () => {
    expect(pickLandsHere(arrival(now), here, now)).toBe(false);
    expect(pickLandsHere(arrival(now - 300), here, now)).toBe(false);
  });

  it('answers it again a moment later, so the key is held and not taken away', () => {
    expect(pickLandsHere(arrival(now - PICK_SETTLES_MS), here, now)).toBe(true);
    expect(pickLandsHere(arrival(now - 5_000), here, now)).toBe(true);
  });

  /* ------------------------- the cases that must not match ----------------- */

  it('leaves a thread you opened yourself alone', () => {
    expect(pickLandsHere(null, here, now)).toBe(true);
  });

  it('leaves the thread you were already on alone when the app moved to another', () => {
    expect(pickLandsHere({ key: 'onboard/w-e5', at: now }, here, now)).toBe(true);
  });

  it('does not mistake the same id in another project for the thread that arrived', () => {
    expect(pickLandsHere({ key: 'onboard/w-d4', at: now }, here, now)).toBe(true);
  });
});

describe('the window wires it to the one key that sends', () => {
  it('guards the number keys inside an open thread, and says why when it refuses', () => {
    expect(app).toMatch(/pickLandsHere\(arrived\.current, keyOf\(focused\), Date\.now\(\)\)/);
    expect(app).toMatch(/showToast\(AIMED_AT_THE_THREAD_YOU_LEFT\)/);
  });

  it('stamps the arrival where the app moves you on, and nowhere else', () => {
    expect(app.match(/arrived\.current = \{/g)).toHaveLength(1);
  });

  it('says it in words of its own rather than a sentence typed twice', () => {
    expect(AIMED_AT_THE_THREAD_YOU_LEFT).toMatch(/thread you just left/);
    expect(app).not.toMatch(/That number was for the thread/);
  });
});
