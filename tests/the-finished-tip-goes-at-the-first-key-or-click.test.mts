// THE FINISHED TIP GOES AT THE FIRST KEY OR CLICK (w-1e52420829, 2026-11-15).
//
// Someone finished the walkthrough in a real window and liked where it ended.
// Then the gold tip and the ring round Home's box stayed: "it sticks the
// moment I start doing some action, like moving my key or clicking elsewhere",
// "Even after reloading the page, it still has this gold highlight so I can't
// get rid of it unless I follow its instructions". It went only on Close, on
// leaving Home, or on sending a thread, and it was saved, so a reload drew it
// again. "The first thing I probably want to do is not submit something."
//
// The next day they asked for the tip to name one simple key, "the equivalent
// of hitting the close button": ↵ closes it and does nothing else. Any other
// key or click still ends it and still does what it was for.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { closeFinish, finishLesson, keyClosesFinish, keyEndsFinish, noteSent, readTour, saveTour, startTour, tourFinishing, tourOver, type Lesson, type Tour } from '../renderer/src/tour.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const lessons = (t: Tour, ...ls: Lesson[]) => ls.reduce(finishLesson, t);
const over = lessons(noteSent(startTour()), 'working', 'open', 'choose', 'close', 'palette');
const memory = () => { const kept = new Map<string, string>(); return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); } }; };
const plain = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };

describe('a key pressed while the finished tip is up', () => {
  it('ends it, whatever the key does', () => {
    for (const key of ['a', ' ', 'Enter', 'Escape', 'Tab', 'ArrowDown', 'Backspace', 'k', 'F5']) expect(keyEndsFinish(key), key).toBe(true);
  });
  // ⌘K starts with ⌘ alone, and so does a screenshot of the tip.
  it('does not end it when it is a modifier on its own', () => {
    for (const key of ['Meta', 'Control', 'Alt', 'Shift', 'CapsLock']) expect(keyEndsFinish(key), key).toBe(false);
  });
});

describe('↵, the key the tip names', () => {
  it('is the tip’s own: it closes and reaches nothing else', () => {
    expect(keyClosesFinish({ key: 'Enter', ...plain })).toBe(true);
  });
  // ⌘↵ sends what is in Home's box, and ⇧↵ is a new line in it.
  it('is not ↵ with a modifier held, which is still the box’s', () => {
    for (const held of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey']) expect(keyClosesFinish({ key: 'Enter', ...plain, [held]: true }), held).toBe(false);
  });
  it('is no other key', () => {
    for (const key of ['Escape', ' ', 'e', 'Tab']) expect(keyClosesFinish({ key, ...plain }), key).toBe(false);
  });
});

describe('the finished tip in the window', () => {
  const tour = read('renderer/src/components/Tour.tsx');
  const app = read('renderer/src/App.tsx');
  const finished = tour.slice(tour.indexOf('export function TourFinished'), tour.indexOf('export function Tour('));
  it('listens for the first key and the first click anywhere, wherever they land', () => {
    expect(finished).toContain("document.addEventListener('keydown', anyKey, true);");
    expect(finished).toContain("document.addEventListener('pointerdown', end, true);");
    expect(finished).toContain('if (keyEndsFinish(e.key)) end();');
  });
  it('keeps ↵ from Home’s box, and lets every other key and click through', () => {
    expect(finished).toContain('if (keyClosesFinish(e)) { e.preventDefault(); e.stopImmediatePropagation(); }');
    expect(finished.match(/preventDefault|stopPropagation|stopImmediatePropagation/g)).toHaveLength(2);
  });
  // Saved in the middle of a press, the app redrew before its own key handler
  // ran and the press reached nothing (tests/the-tutorial-walks-you-through-your-first-real-thread).
  it('closes after the press, not in the middle of it', () => {
    expect(finished).toContain('const end = () => setTimeout(() => done.current(), 0);');
  });
  it('is closed by the window when that happens, and only while it is up', () => {
    expect(app).toContain('onDone={() => { if (tourFinishing(tourRef.current)) setTour(closeFinish(tourRef.current!)); }} />}');
  });
});

describe('a reload while the finished tip is up', () => {
  it('does not draw the tip again', () => {
    const store = memory();
    saveTour(store, over);
    expect(tourFinishing(over)).toBe(true);
    expect(tourFinishing(readTour(store))).toBe(false);
  });
  it('leaves the walkthrough finished', () => {
    const store = memory();
    saveTour(store, over);
    expect(tourOver(readTour(store))).toBe(true);
  });
  it('changes nothing for a tip that was already closed', () => {
    const store = memory();
    saveTour(store, closeFinish(over));
    expect(tourFinishing(readTour(store))).toBe(false);
    expect(tourOver(readTour(store))).toBe(true);
  });
});
