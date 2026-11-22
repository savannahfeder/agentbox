// A THREAD ROW ON THE PHONE SWIPES TO CLOSE OR TO LATER.
//
// What broke (phone review, 2026-11-21): putting one thread away took a long
// press, a tick, then a button at the foot, or opening the thread and its
// menu. Every phone mail app closes or defers a row with one swipe. Read from
// `rowSwipe` and `rowSwipeClaims` (lib/row-swipe.ts) and the inbox's ThreadRow.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { rowSwipe, rowSwipeClaims, SWIPE_COMMIT } from '../mobile/src/lib/row-swipe';

const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const row = inbox.slice(inbox.indexOf('function ThreadRow('), inbox.indexOf('\n}\n', inbox.indexOf('function ThreadRow(')));
const swiped = fs.readFileSync('mobile/src/ui/Swiped.tsx', 'utf8');

describe('letting go of a swiped row', () => {
  it('closes it past the mark to the left', () => {
    expect(rowSwipe(-(SWIPE_COMMIT + 1), 0)).toBe('close');
  });
  it('sends it to Later past the mark to the right', () => {
    expect(rowSwipe(SWIPE_COMMIT + 1, 0)).toBe('later');
  });
  it('does nothing short of the mark', () => {
    expect(rowSwipe(-(SWIPE_COMMIT - 1), 0)).toBe(null);
    expect(rowSwipe(SWIPE_COMMIT - 1, 0)).toBe(null);
  });
  it('takes a quick flick past 40pt as meant', () => {
    expect(rowSwipe(-48, -1.1)).toBe('close');
    expect(rowSwipe(48, 1.1)).toBe('later');
  });
  it('ignores a flick that barely moved, or one back the other way', () => {
    expect(rowSwipe(-30, -1.5)).toBe(null);
    expect(rowSwipe(-60, 1.2)).toBe(null);
  });
});

describe('which drags a row takes', () => {
  it('takes a sideways drag', () => {
    expect(rowSwipeClaims(20, 4)).toBe(true);
  });
  it('leaves a scroll of the list to the list', () => {
    expect(rowSwipeClaims(10, 30)).toBe(false);
    expect(rowSwipeClaims(8, 0)).toBe(false);
  });
});

describe('the inbox row', () => {
  it('is wrapped in a swipe that closes or opens Later for that one thread', () => {
    expect(row).toMatch(/<Swiped /);
    expect(row).toMatch(/onClose=\{\(\) => acts\.close\(row\.item\)\}/);
    expect(row).toMatch(/onLater=\{\(\) => acts\.later\(row\.item\)\}/);
  });
  it('does not swipe while ticking rows', () => {
    expect(row).toMatch(/off=\{picking\}/);
  });
  it('still swipes on a finished thread, which is most of Needs you', () => {
    expect(row).not.toMatch(/off=\{[^}]*status === 'done'/);
  });
  it('is felt as the mark is crossed, and springs back on a short swipe', () => {
    expect(swiped).toMatch(/feel\.tap\(\)/);
    expect(swiped).toMatch(/Animated\.spring\(/);
  });
});
