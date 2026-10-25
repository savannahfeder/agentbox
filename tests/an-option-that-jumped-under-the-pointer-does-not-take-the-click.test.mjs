// CLICKING OPTION 2 SENT OPTION 1.
//
// Found on the Linux QA box (F-48 on w-51ed2609b0): the card read 1 Simple
// columns, 2 Labeled table, 3 Boxed receipt, row 2 was clicked, and the toast
// said "Option 1 sent → Receipt Cli". Whether the pointer missed or the list
// moved was never established, so this covers the half that is the app's: the
// strip stands at the foot of a turn in the scrolling pane, the run keeps
// writing above it, and a line arriving over it carries every row down the
// window. A pointer put on row 2 is over row 1 by the time the button goes
// down, and that press sends.
//
// A number key cannot land this way, and the one guard that existed covered
// numbers alone (../renderer/src/pick-settles.ts). Two things close it: the
// strip refuses a click for a moment after it jumps under the pointer, and a
// click, like a number, does not answer a thread the app has just moved you to.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AIMED_AT_THE_THREAD_YOU_LEFT, MOVED_PX, PICK_SETTLES_MS, THE_OPTIONS_MOVED,
  clickLandsOnTheRowYouSaw, pickLandsHere,
} from '../renderer/src/pick-settles.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const NOW = 1_700_000_000_000;

describe('a click on a strip that jumped', () => {
  it('goes through when the strip has not moved under the pointer', () => {
    expect(clickLandsOnTheRowYouSaw(null, NOW)).toBe(true);
  });

  it('is refused in the moment after it moved', () => {
    expect(clickLandsOnTheRowYouSaw(NOW, NOW)).toBe(false);
    expect(clickLandsOnTheRowYouSaw(NOW - PICK_SETTLES_MS + 1, NOW)).toBe(false);
  });

  it('goes through once the list has stood still', () => {
    expect(clickLandsOnTheRowYouSaw(NOW - PICK_SETTLES_MS, NOW)).toBe(true);
    expect(clickLandsOnTheRowYouSaw(NOW - 60_000, NOW)).toBe(true);
  });

  it('says so, because a click that does nothing reads as a broken app', () => {
    expect(THE_OPTIONS_MOVED).toContain('moved');
    expect(THE_OPTIONS_MOVED).toContain('again');
  });

  it('calls a jump a jump, not a pixel of layout settling', () => {
    expect(MOVED_PX).toBeGreaterThanOrEqual(2);
    expect(MOVED_PX).toBeLessThan(20);
  });
});

describe('what the strip has to watch for it', () => {
  const focus = read('renderer/src/components/Focus.tsx');

  it('measures where the strip is drawn, after every render', () => {
    expect(focus).toContain('stripRef.current?.getBoundingClientRect().top');
    expect(focus).toContain('Math.abs(top - was) >= MOVED_PX');
  });

  it('only counts a jump the pointer was standing on', () => {
    expect(focus).toContain('overStrip.current');
  });

  it('puts the refusal on the click and not on the keys', () => {
    expect(focus).toContain('const pickByClick = (n: number) => {');
    expect(focus).toContain('onNotice(THE_OPTIONS_MOVED)');
    expect(focus).toContain('onPick={pickByClick}');
  });

  it('lets the next click through, so the words on the toast are true', () => {
    const guard = focus.slice(focus.indexOf('const pickByClick'), focus.indexOf('const pickByClick') + 420);
    expect(guard).toContain('setStripMovedAt(null)');
  });
});

// THE OTHER WAY A POINTER ANSWERS THE WRONG THREAD, and it was already known
// about and already guarded for numbers: answering from Needs you moves you on,
// and the next thread's strip is drawn in the place your hand is already over.
describe('a click after the app moved you on', () => {
  const app = read('renderer/src/App.tsx');

  it('is held off exactly as a number is', () => {
    expect(pickLandsHere({ key: 'alpha/w-1', at: NOW }, 'alpha/w-1', NOW)).toBe(false);
    expect(pickLandsHere({ key: 'alpha/w-1', at: NOW - PICK_SETTLES_MS }, 'alpha/w-1', NOW)).toBe(true);
    expect(pickLandsHere({ key: 'alpha/w-1', at: NOW }, 'alpha/w-2', NOW)).toBe(true);
  });

  it('and the pane\'s own pick goes through that guard', () => {
    expect(app).toContain('const pickAimedHere = useCallback((item: WorkItem, n: number) => {');
    expect(app).toContain('if (!pickLandsHere(arrived.current, keyOf(item), Date.now())) { showToast(AIMED_AT_THE_THREAD_YOU_LEFT); return; }');
    expect(app).toContain('onPick={(n) => pickAimedHere(focused, n)}');
  });

  it('says which thread the press was for', () => {
    expect(AIMED_AT_THE_THREAD_YOU_LEFT).toContain('thread you just left');
  });
});
