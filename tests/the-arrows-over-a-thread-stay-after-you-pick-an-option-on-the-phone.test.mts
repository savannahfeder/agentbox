// THE ARROWS OVER A THREAD STAY AFTER YOU PICK AN OPTION ON THE PHONE.
//
// The 2026-11-07 phone workday (issue 31): a thread opened from Needs you said
// "2 OF 5" with up and down arrows; picking an option took it out of Needs you,
// and the header lost its place and both arrows, so every pick meant Back, find
// the next row, open it. Measured in the phone preview on "Plan the phone app"
// and "Draw three versions of the inbox". The walk now keeps the open thread
// where it was until you leave it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { walkKeeping } from '../mobile/src/lib/one-page';
import { spotIn, stepIn } from '../renderer/src/one-thing-at-a-time';

const row = (id) => ({ product: 'p', id });
const ids = (rows) => rows.map((r) => r.id);

describe('the walk over an open thread', () => {
  const before = [row('a'), row('b'), row('c'), row('d')];

  it('is Needs you as it is while the thread is still in it', () => {
    const now = [row('a'), row('b'), row('c'), row('d'), row('e')];
    expect(walkKeeping(now, row('b'), before)).toBe(now);
  });
  it('keeps the thread in its place once a pick takes it out', () => {
    const walk = walkKeeping([row('a'), row('c'), row('d')], row('b'), before);
    expect(ids(walk)).toEqual(['a', 'b', 'c', 'd']);
    expect(spotIn(walk, row('b'))).toMatchObject({ pos: 2, total: 4 });
    expect(stepIn(walk, row('b'), 1)?.id).toBe('c');
    expect(stepIn(walk, row('b'), -1)?.id).toBe('a');
  });
  it('keeps the first thread first', () => {
    expect(ids(walkKeeping([row('b'), row('c')], row('a'), before))).toEqual(['a', 'b', 'c']);
  });
  it('keeps the last thread last', () => {
    expect(ids(walkKeeping([row('a'), row('b'), row('c')], row('d'), before))).toEqual(['a', 'b', 'c', 'd']);
  });
  it('a thread never in the walk is not added', () => {
    const now = [row('a'), row('c')];
    expect(walkKeeping(now, row('z'), before)).toBe(now);
  });
  it('is what the thread page walks', () => {
    const page = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
    expect(page).toMatch(/walkKeeping\(needsYouOrder\(asks, .*, inbox\), here, walked\.current\)/);
    expect(page).toMatch(/needsYouSpot\(walk, here\)/);
    expect(page).toMatch(/stepOver\(walk, here, dir\)/);
  });
});
