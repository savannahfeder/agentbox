// THE APP DREW ⌘↵ AND ⇥ ON A LINUX KEYBOARD THAT HAS NEITHER KEY.
//
// Measured on the Linux box on 2026-10-23: the Send button said ⌘↵, the
// tutorial's card said "Press ⌘↵ or click Send", and the tab hint drew ⇥,
// while the keys that actually worked were Ctrl+Enter and Tab. Every handler
// already took Ctrl; only the labels lied.
//
// The caps are a table now, read everywhere a key is drawn. What is pinned
// here is each cap, the chord a single cap spells out, the de-duplicating the
// shortcuts page needs ('⌘K or Ctrl+K' is one key on Linux), and that a Mac
// keeps every glyph it had.
import { describe, expect, it } from 'vitest';
import {
  capNameOf,
  capsOf,
  chordOf,
  everyChord,
  sayTheKeys,
} from '../shared/key-caps.mjs';
import { MAC } from '../renderer/src/this-keyboard.ts';

describe('a cap says the key this keyboard has', () => {
  it('splits a chord into one cap per key, in the glyphs a Mac has', () => {
    expect(capsOf('⌘↵', true)).toEqual(['⌘', '↵']);
    expect(capsOf('⇥', true)).toEqual(['⇥']);
    expect(capsOf('esc', true)).toEqual(['esc']);
    expect(capsOf('N', true)).toEqual(['N']);
  });

  it('names every key on a keyboard with no command key', () => {
    expect(capsOf('⌘↵', false)).toEqual(['Ctrl', 'Enter']);
    expect(capsOf('⌘K', false)).toEqual(['Ctrl', 'K']);
    expect(capsOf('⇧⇥', false)).toEqual(['Shift', 'Tab']);
    expect(capsOf('⇥', false)).toEqual(['Tab']);
  });

  it('leaves the keys both keyboards spell the same way alone', () => {
    for (const key of ['N', 'esc', '↑', '↓', '←', '→', '\\', '/', '1']) {
      expect(capsOf(key, false)).toEqual(capsOf(key, true));
    }
  });

  it('writes a chord as one label where only one cap is drawn', () => {
    expect(chordOf('⌘↵', true)).toBe('⌘↵');
    expect(chordOf('⌘↵', false)).toBe('Ctrl+Enter');
    expect(chordOf('⌘K', false)).toBe('Ctrl+K');
    expect(chordOf('⇥', false)).toBe('Tab');
    expect(chordOf('N', false)).toBe('N');
  });

  it('keeps the word inside a cap only where the cap does not say it', () => {
    expect(capNameOf('⇥', true)).toBe('Tab');
    expect(capNameOf('↵', true)).toBe(null);
    // On Linux the cap IS the word, so a word beside it would say Tab twice.
    expect(capNameOf('Tab', false)).toBe(null);
    expect(capNameOf('⇥', false)).toBe(null);
  });

  it('says one key once when the two keyboards share a row', () => {
    // The shortcuts page lists ⌘K and Ctrl+K together, because both work on a
    // Mac. On Linux they are the same key and must not be drawn twice.
    expect(everyChord(['⌘K', 'Ctrl+K'], false)).toEqual(['Ctrl+K']);
    expect(everyChord(['⌘K', 'Ctrl+K'], true)).toEqual(['⌘K', 'Ctrl+K']);
    expect(everyChord(['J', '↓'], false)).toEqual(['J', '↓']);
    expect(everyChord(['⌘Y', '⌘N'], false)).toEqual(['Ctrl+Y', 'Ctrl+N']);
  });

  // AND A TEST IS NOT A KEYBOARD. Node 22 answers `navigator.platform` with
  // "Linux arm64" on this box and "macOS" on hers, so reading it here made
  // every render test in the suite draw a different key on each machine: three
  // of them went red on Linux and green on the Mac an hour apart.
  it('answers Mac where there is no window at all, whatever node says it is on', () => {
    expect(typeof document).toBe('undefined');
    expect(MAC).toBe(true);
  });

  it('rewrites the keys inside a sentence', () => {
    expect(sayTheKeys('Anything without a key is in ⌘K by name.', false))
      .toBe('Anything without a key is in Ctrl+K by name.');
    expect(sayTheKeys('Press ⌘↵ to send.', false)).toBe('Press Ctrl+Enter to send.');
    expect(sayTheKeys('Press ⌘↵ to send.', true)).toBe('Press ⌘↵ to send.');
  });
});
