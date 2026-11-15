// A REPEATING TASK IS IN THE BOARD'S LATER COLUMN ON THE PHONE.
//
// The 2026-11-07 phone workday (issue 2): a tester set "every Monday morning"
// from Send later, got the toast "Repeating: Mondays at 8:00am", and then
// found it nowhere. Everything else draws a board by default, and the board's
// Later column held only put-off threads; repeating tasks were drawn only above
// the Later list, which the board never shows. Measured in the phone preview:
// the two made-up repeats and the new one were missing from the column, and
// its count was 3. The same issue: the confirm chip "Repeats Mondays at
// 8:00am" ran off the right edge, because it could not shrink.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('the board on the phone', () => {
  const src = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
  const board = src.slice(src.indexOf('function Board('), src.indexOf('export default function Threads'));

  it("leads Later's column with the repeating tasks", () => {
    expect(board).toMatch(/const repeatsIn = \(state: string\) => \(state === 'scheduled' \? c0\.repeats : \[\]\)/);
    expect(board).toMatch(/repeatsIn\(c\.state\)\.map\(/);
  });
  it('counts them in the column', () => {
    expect(board).toMatch(/\{c\.rows\.length \+ repeatsIn\(c\.state\)\.length\}/);
  });
  it('opens a repeat on its own page, as the list does', () => {
    expect(board).toMatch(/pathname: '\/repeat\/\[product\]\/\[id\]'/);
  });
});

describe('the typed time box', () => {
  const src = fs.readFileSync('mobile/src/ui/Later.tsx', 'utf8');
  const box = src.slice(src.indexOf('export function TimeBox'), src.indexOf('export function LaterSheet'));
  it('lets its confirm line shrink and wrap rather than run off the screen', () => {
    expect(box).toMatch(/style=\{\[\{ flexShrink: 1 \}, ok && \{ minHeight: 32/);
    expect(box).not.toMatch(/height: 32, paddingHorizontal: 10/);
  });
});
