// A NOTE ON A SHARED PAGE CAN BE TYPED (2026-11-11).
//
// A tester on a team, round two: "Cannot type note on shared HTML file: type
// reports 203 characters into body; Comment remains empty and the send button
// has no label." Measured from the code: the button that sends a plain
// comment draws only a return glyph and has no name, and the review view
// swallows every letter typed while no box holds the keyboard, so once the
// caret was off the note box after the click (the page's own frame takes
// clicks and focus), a whole sentence went nowhere.
//
// A letter typed with nothing holding the keyboard now goes into the note
// box. What must NOT go there: a letter typed into another box or pressed on a
// button or a player, a chord, a zoom key, or a key with no box to take it.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { letterGoesToTheNote } from '../renderer/src/artifact-pins.ts';

const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');

describe('a letter typed in the review view', () => {
  it('goes to the note box when nothing holds the keyboard', () => {
    expect(letterGoesToTheNote({ key: 'A', chord: false, on: 'nothing', boxThere: true })).toBe(true);
    expect(letterGoesToTheNote({ key: 'é', chord: false, on: 'nothing', boxThere: true })).toBe(true);
  });

  it('stays where it is in another box, or on a button or a player', () => {
    expect(letterGoesToTheNote({ key: 'a', chord: false, on: 'box', boxThere: true })).toBe(false);
    expect(letterGoesToTheNote({ key: 'a', chord: false, on: 'control', boxThere: true })).toBe(false);
  });

  it('leaves chords, zoom keys, space and arrows to what they do', () => {
    expect(letterGoesToTheNote({ key: 'a', chord: true, on: 'nothing', boxThere: true })).toBe(false);
    for (const key of ['=', '-', '0', '1', ' ', 'ArrowRight', 'Enter']) expect(letterGoesToTheNote({ key, chord: false, on: 'nothing', boxThere: true }), key).toBe(false);
  });

  it('goes nowhere when there is no note box', () => {
    expect(letterGoesToTheNote({ key: 'a', chord: false, on: 'nothing', boxThere: false })).toBe(false);
  });
});

describe('the review view', () => {
  it('puts a loose letter into the note box before it is typed', () => {
    expect(view).toMatch(/if \(letterGoesToTheNote\(\{ key: e\.key, chord: e\.altKey, on: keyIsOn\(e\.target\), boxThere: !!box\.current \}\)\) \{ box\.current!\.focus\(\); return; \}/);
  });

  it('names the button that sends a note, glyph or not', () => {
    expect(view).toMatch(/<button type="submit" className="av-btn av-write-send" aria-label=\{buttonWords === 'Comment' \? 'Send comment' : buttonWords\}/);
  });
});
