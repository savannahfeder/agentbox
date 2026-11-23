// WORDS TYPED AFTER A SLASH ARE WORDS, NOT SHORTCUTS (w-34443a206b).
//
// Two testers on 2026-11-22 typed "/" and then words, expecting a command
// box, and the letters ran as single keys: an E in a word marked a thread
// done. "/" goes nowhere on the list (and nowhere on a thread with no reply
// box under the keyboard), but nothing remembered it, so once the 250ms
// stray-letter burst ended the next letter was a shortcut again. Measured on
// keyOnTheList and keyOnAnOpenThread, which App.tsx asks for every key.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { keyOnAnOpenThread, keyOnTheList } from '../renderer/src/reply-keys';

const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');

describe('on the list, a letter typed straight after one that went nowhere', () => {
  it('goes nowhere too, E and L and the moving keys included', () => {
    for (const key of ['e', 'E', 'l', 'r', 'j', 'z', 'b', ' ']) {
      expect(keyOnTheList({ key, justChanged: false, stillTyping: true })).toBe('nowhere');
    }
  });

  it('but the arrows, Enter and Escape still work', () => {
    for (const key of ['ArrowDown', 'Enter', 'Escape']) {
      expect(keyOnTheList({ key, justChanged: false, stillTyping: true })).toBe('shortcut');
    }
  });

  it('and after a pause every key is its own again', () => {
    expect(keyOnTheList({ key: 'e', justChanged: false, stillTyping: false })).toBe('shortcut');
    expect(keyOnTheList({ key: '/', justChanged: false })).toBe('nowhere');
  });

  it('is what the list asks, timed from the last letter that went nowhere', () => {
    expect(app).toMatch(/keyOnTheList\(\{ key: e\.key, justChanged: [^}]*stillTyping: Date\.now\(\) - nowhereAt\.current < STILL_TYPING_MS/);
  });
});

describe('on a thread with no reply box under the keyboard', () => {
  it('"/" goes nowhere, and so do the letters straight after it', () => {
    expect(keyOnAnOpenThread({ key: '/', justChanged: false, boxOnScreen: false })).toBe('nowhere');
    expect(keyOnAnOpenThread({ key: 'e', justChanged: false, boxOnScreen: false, strayLately: true })).toBe('nowhere');
  });

  it('a key on its own is still a shortcut', () => {
    expect(keyOnAnOpenThread({ key: 'e', justChanged: false, boxOnScreen: false })).toBe('shortcut');
    expect(keyOnAnOpenThread({ key: 'Escape', justChanged: false, boxOnScreen: false, strayLately: true })).toBe('shortcut');
  });

  it('which an outside agent\'s row is too', () => {
    expect(app).toMatch(/keyOnAnOpenThread\(\{[^}]*boxOnScreen: !fullScreenDoc && !focused\.agent/);
  });
});

describe('on a thread with its box', () => {
  it('"/" goes in the box, as it always did', () => {
    expect(keyOnAnOpenThread({ key: '/', justChanged: false })).toBe('to the box');
  });
});
