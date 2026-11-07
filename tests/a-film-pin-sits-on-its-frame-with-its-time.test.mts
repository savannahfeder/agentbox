// A FILM PIN SITS ON ITS FRAME, WITH ITS TIME.
//
// A film comment carried a time and no place, so Sofia
// wrote "the wordmark" in words. A click on the picture only played or paused;
// cleanMark kept `{ kind: 'time', s }` and threw any other field away. A pin is
// now a time and a spot on one note: pause, click, write.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { carriedNotes, cleanMark, marksOf, notesForTheAgent, placeWords, threadFiles } from '../shared/artifact-marks.mjs';
import { filmClickDoes, filmMarks, filmPinsAt, filmPins, hasSpot, notePlaceWords } from '../renderer/src/artifact-pins.ts';

const note = (id, file, place, ts = 1, by = 'sofia') => ({ do: 'note', id, file, place, text: `said ${id}`, by, ts });
const onFrame = (s, x = 0.42, y = 0.3) => ({ kind: 'time', s, x, y });

describe('what the ledger keeps', () => {
  it('keeps the spot with the time', () => {
    expect(cleanMark(note('n1', 'a.mp4', onFrame(12))).place).toEqual({ kind: 'time', s: 12, x: 0.42, y: 0.3 });
  });
  it('keeps a plain time plain', () => {
    expect(cleanMark(note('n1', 'a.mp4', { kind: 'time', s: 12 })).place).toEqual({ kind: 'time', s: 12 });
  });
  it.each([[1.2, 0.5], [0.5, -0.1], [0.5, undefined], ['a', 0.5]])('believes no spot off the frame: %s, %s', (x, y) => {
    expect(cleanMark(note('n1', 'a.mp4', { kind: 'time', s: 12, x, y })).place).toEqual({ kind: 'time', s: 12 });
  });
  it('numbers film pins as picture pins are numbered, and a plain time takes no number', () => {
    const { notes } = marksOf([note('a', 'f.mp4', { kind: 'time', s: 1 }), note('b', 'f.mp4', onFrame(2)), note('c', 'f.mp4', onFrame(3))]);
    expect(notes.map((n) => n.pin)).toEqual([undefined, 1, 2]);
  });
});

describe('how it reads', () => {
  it('says the pin and the time', () => {
    expect(placeWords({ place: onFrame(72), pin: 2 })).toBe('Pin 2 at 1:12');
    expect(placeWords({ place: { kind: 'time', s: 72 } })).toBe('1:12');
  });
  it('tells the agent the time and the place in words', () => {
    const marks = marksOf([note('b', 'f.mp4', onFrame(72)), note('c', 'f.mp4', { kind: 'time', s: 3 })]);
    const { text } = notesForTheAgent(marks, { id: 'f.mp4', name: 'f.mp4', path: 'f.mp4' }, 1, { nameOf: () => 'Sofia' });
    expect(text).toContain('- Pin 1 at 1:12, 42% across and 30% down: said b (Sofia)');
    expect(text).toContain('- 0:03: said c (Sofia)');
  });
  it('names a carried pin by its version', () => {
    expect(notePlaceWords({ place: onFrame(5), pin: 1, from: 'v1' })).toBe('Pin v1·1 at 0:05');
  });
});

describe('where it is drawn', () => {
  const family = threadFiles([{ path: 'f.mp4' }, { path: 'f-v2.mp4' }])[0];
  const { notes } = marksOf([note('a', 'f.mp4', onFrame(2)), note('b', 'f-v2.mp4', onFrame(5)), note('c', 'f-v2.mp4', { kind: 'time', s: 7 })]);
  const own = notes.filter((n) => n.file === 'f-v2.mp4');
  const carried = carriedNotes(family, 1, notes);

  it('goes across versions, labelled with where it came from', () => {
    expect(filmPins(own, carried, null).map((p) => [p.id, p.label, p.s, p.carried])).toEqual([['b', '1', 5, false], ['a', 'v1·1', 2, true]]);
  });
  it('sits on its own frame and not on the frames either side', () => {
    const pins = filmPins(own, carried, null);
    expect(filmPinsAt(pins, 5).map((p) => p.id)).toEqual(['b']);
    expect(filmPinsAt(pins, 5.2).map((p) => p.id)).toEqual(['b']);
    expect(filmPinsAt(pins, 5.5)).toEqual([]);
    expect(filmPinsAt(pins, 4.5)).toEqual([]);
    expect(filmPinsAt(pins, 2).map((p) => p.id)).toEqual(['a']);
  });
  it('marks the bar for a pin and for a plain time, and says which', () => {
    expect(filmMarks(own, carried, 'a')).toEqual([
      { id: 'b', s: 5, on: false, pin: true },
      { id: 'c', s: 7, on: false, pin: false },
      { id: 'a', s: 2, on: true, pin: true },
    ]);
  });
  it('hides a resolved pin unless it was picked or resolved ones are shown', () => {
    const closed = [{ ...own[0], resolved: true }];
    expect(filmPins(closed, [], null)).toEqual([]);
    expect(filmPins(closed, [], 'b')).toHaveLength(1);
    expect(filmPins(closed, [], null, { resolved: true })).toHaveLength(1);
    expect(filmMarks(closed, [], null)).toEqual([]);
  });
  it('tells a spot from a time', () => {
    expect(hasSpot(onFrame(1))).toBe(true);
    expect(hasSpot({ kind: 'time', s: 1 })).toBe(false);
    expect(hasSpot({ kind: 'pin', x: 0, y: 0 })).toBe(false);
  });
});

describe('the line it leaves in the thread', () => {
  it('counts a film pin, so it never reads as Pin 0', () => {
    const src = fs.readFileSync(new URL('../renderer/src/thread-history.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/mark\.place\?\.kind === 'pin' \|\| hasSpot\(mark\.place\) \? 1 : 0/);
  });
});

describe('what a click on the picture does', () => {
  const at = (o) => filmClickDoes({ paused: true, started: true, ended: false, canPin: true, ...o });
  it('pins on a film paused by a person', () => expect(at({})).toBe('pin'));
  it('pauses a film that is playing', () => expect(at({ paused: false })).toBe('pause'));
  it('plays a film nobody has started, the first thing a click on a film means', () => expect(at({ started: false })).toBe('play'));
  it('plays a film that has ended', () => expect(at({ ended: true })).toBe('play'));
  it('plays where nothing can be pinned, as on the older side of a comparison', () => expect(at({ canPin: false })).toBe('play'));
});
