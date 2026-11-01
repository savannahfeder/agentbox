// A CLOUD THREAD SHIPS WITH THE LABEL, NOT A HAND-BACK (w-223db891a5, 2026-11-01).
//
// Cloud threads could not ship. The cloud note said a request that "includes
// merging into main" ends on the hand-back line, and a ship is a merge into
// main, so a cloud run asked to ship moved its thread to the computer instead
// of adding `ship`. The ship queue already waits for a cloud run's branch to
// come home before it ships (main/supervisor.mjs `isLive`/`liveSince`), so the
// label is all a cloud run needs. Measured by reading CLOUD_NOTE: before the
// fix it named the hand-back for any merge into main and said nothing of `ship`.
import { describe, it, expect } from 'vitest';
import { CLOUD_NOTE, PLAIN_CLOUD_NOTE } from '../main/cloud/run.mjs';
import { HAND_BACK } from '../shared/cloud-hand-back.mjs';
import { SHIP_LABEL } from '../main/ship-queue.mjs';

const branches = CLOUD_NOTE.split('\n\n').find((p) => p.startsWith('Only this task\'s own branch comes back'));

describe('a cloud run asked to ship', () => {
  it('adds the ship label here, as its brief says, and never hands the thread back for it', () => {
    expect(branches).toContain(`\`${SHIP_LABEL}\``);
    expect(branches).toMatch(/How this task ships/);
    expect(branches).toMatch(/never needs the hand-back line/i);
  });

  it('still hands back a merge into main when the project does not ship through the app', () => {
    expect(branches).toContain(`${HAND_BACK} merging into main`);
    expect(branches).toMatch(/no section on how this task ships/i);
  });

  it('a project with no repository is told nothing about shipping', () => {
    expect(PLAIN_CLOUD_NOTE).not.toMatch(/How this task ships/);
  });
});
