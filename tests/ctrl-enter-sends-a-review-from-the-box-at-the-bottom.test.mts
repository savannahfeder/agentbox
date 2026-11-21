// CTRL OR ⌘ ENTER SENDS A REVIEW FROM THE BOX AT THE BOTTOM (w-f702d60afe, bug 12).
//
// Asked to review Sam's thread, Theo wrote his review in the box at the bottom
// of the page and pressed Ctrl+Enter, the key the ask's own box sends with.
// Nothing happened: the box's key handler returned early whenever a review was
// open. Measured on two copies by pressing it with words in the box. It now
// presses the button that sends the box's words, Send changes, and plain Enter
// stays a new line, since a review is often more than one line.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { keyInTheBox } from '../renderer/src/threads/teammate-thread';

const key = (k: string, mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; isComposing?: boolean } = {}) => ({ key: k, ...mods });

describe('in the box while a review is open on you', () => {
  const review = { reviewing: true, words: 'Keep the old index one more release.' };
  it('Ctrl+Enter and ⌘+Enter send the changes', () => {
    expect(keyInTheBox(key('Enter', { ctrlKey: true }), review)).toBe('changes');
    expect(keyInTheBox(key('Enter', { metaKey: true }), review)).toBe('changes');
  });
  it('plain Enter and Shift+Enter are a new line', () => {
    expect(keyInTheBox(key('Enter'), review)).toBe(null);
    expect(keyInTheBox(key('Enter', { shiftKey: true }), review)).toBe(null);
  });
  it('sends nothing from an empty box, as the button would not', () => {
    expect(keyInTheBox(key('Enter', { ctrlKey: true }), { reviewing: true, words: '   ' })).toBe(null);
  });
  it('sends nothing while a word is still being composed', () => {
    expect(keyInTheBox(key('Enter', { ctrlKey: true, isComposing: true }), review)).toBe(null);
  });
  it('other keys with Ctrl do nothing', () => {
    expect(keyInTheBox(key('a', { ctrlKey: true }), review)).toBe(null);
  });
});

describe('in the box otherwise', () => {
  const other = { reviewing: false, words: 'Try the staging key.' };
  it('Enter sends, with or without Ctrl or ⌘', () => {
    expect(keyInTheBox(key('Enter'), other)).toBe('send');
    expect(keyInTheBox(key('Enter', { ctrlKey: true }), other)).toBe('send');
    expect(keyInTheBox(key('Enter', { metaKey: true }), other)).toBe('send');
  });
  it('Shift+Enter is a new line', () => {
    expect(keyInTheBox(key('Enter', { shiftKey: true }), other)).toBe(null);
  });
});

describe('the page', () => {
  const src = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
  it('runs the same hand-back the Send changes button does', () => {
    expect(src).toMatch(/keyInTheBox\(\{ key: e\.key, metaKey: e\.metaKey, ctrlKey: e\.ctrlKey, shiftKey: e\.shiftKey, isComposing: e\.nativeEvent\.isComposing \}, \{ reviewing, words: draft \}\)/);
    expect(src).toMatch(/goes === 'changes'\) \{ e\.preventDefault\(\); void handBack\('changes'\); \}/);
  });
});
