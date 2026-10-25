// TYPING WITH THE EMOJI ROW OPEN SEARCHES FOR ONE (w-7f80ab49bf).
//
// Reported 2026-10-16: React was pressed on a message in a thread, the short row
// of eight came up, and "e" was typed to find 👀 by name, the way Slack's
// picker works. The row had no text box, so focus was still on the React
// button and the letter went to the app's own keys: E closed the conversation.
// Every letter of "eyes" was a shortcut there (E closes, S opens the summary).
//
// Now a letter typed while the row is open opens the whole list with that
// letter in its search box, and the key goes no further.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { searchKey } from '../renderer/src/team/picker-keys.ts';
import { findEmoji } from '../renderer/src/team/emoji-list.ts';

const press = (key, mods = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, ...mods });
const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

describe('a key pressed while the picker is open', () => {
  it('goes into the search when it is the letter that was reported', () => {
    expect(searchKey(press('e'))).toBe('e');
  });

  it('goes into the search for every other letter that is a shortcut in the app', () => {
    for (const k of ['z', 's', 'j', 'k', 'r', 'n', 'l', 'b', 'E', 'Z']) expect(searchKey(press(k))).toBe(k);
  });

  it('goes into the search for digits, which would otherwise pick an option', () => {
    expect(searchKey(press('1'))).toBe('1');
  });

  it('goes into the search for a colon, the way Slack names start', () => {
    expect(searchKey(press(':'))).toBe(':');
  });

  // THE KEYS THAT MUST BE LEFT ALONE.
  it('leaves Escape, Enter, Tab, the arrows, Backspace and Space to whatever has focus', () => {
    for (const k of ['Escape', 'Enter', 'Tab', 'ArrowDown', 'ArrowUp', 'Backspace', ' ', 'Shift']) {
      expect(searchKey(press(k))).toBe(null);
    }
  });

  it('leaves chords alone, so ⌘K, ⌘J and Ctrl+K still work', () => {
    expect(searchKey(press('k', { metaKey: true }))).toBe(null);
    expect(searchKey(press('j', { ctrlKey: true }))).toBe(null);
    expect(searchKey(press('e', { altKey: true }))).toBe(null);
  });

  it('leaves a key mid-composition to the input method', () => {
    expect(searchKey(press('e', { isComposing: true }))).toBe(null);
  });
});

describe('the picker takes the key before the app does', () => {
  const actions = read('team/ChatActions.tsx');

  it('listens at the window in the capture phase and stops the key there', () => {
    expect(actions).toMatch(/searchKey\(e\)/);
    expect(actions).toMatch(/stopImmediatePropagation\(\)/);
    expect(actions).toMatch(/addEventListener\('keydown', \w+, true\)/);
  });

  it('is not beaten to S by the summary, which also listens at the window first', () => {
    // Two capture listeners on the window run in the order they were added,
    // and the summary's is re-added whenever its callback changes.
    expect(read('threads/Summary.tsx')).toMatch(/querySelector\('\.chat-emoji, \.chat-emoji-all'\)/);
  });
});

describe('finding one by its Slack name', () => {
  it('finds 👀 from what was being typed', () => {
    expect(findEmoji('e').map(([e]) => e)).toContain('👀');
    expect(findEmoji('eyes')[0][0]).toBe('👀');
  });

  it('reads past the colons around a Slack name', () => {
    expect(findEmoji(':eyes')[0][0]).toBe('👀');
    expect(findEmoji(':eyes:')[0][0]).toBe('👀');
  });

  it('finds nothing for a colon alone', () => {
    expect(findEmoji(':')).toEqual([]);
    expect(findEmoji('::')).toEqual([]);
  });
});
