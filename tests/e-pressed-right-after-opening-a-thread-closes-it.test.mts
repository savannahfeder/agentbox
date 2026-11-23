// "Sometimes, when I hit E to mark something as done, the chat opens up and
// types the letter E." For 800 ms after the screen changed, E and L on an open
// thread went into the reply box as the start of a sentence, and opening a
// thread yourself (a click, Enter, the header arrows) counted as a change. So E
// pressed soon after opening a short "nothing needs you" answer opened the box
// with "e" in it. Measured on reply-keys.ts: keyOnAnOpenThread({ key: 'e',
// justChanged: true }) answered 'to the box'.
//
// Now a lone E or L in that moment waits briefly: a letter after it means
// someone is typing and both go in the box; nothing after it, and it closes.
// When the app moved you (after a reply or a pick), E still never closes the
// thread it put in front of you.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { keyOnAnOpenThread, aWordFollows, WORD_FOLLOWS_MS } from '../renderer/src/reply-keys';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('E or L just after you opened the thread yourself', () => {
  it('waits to see if a word follows instead of typing itself', () => {
    for (const key of ['e', 'E', 'l', 'L']) expect(keyOnAnOpenThread({ key, justChanged: true })).toBe('wait');
  });
  it('is still a plain shortcut once the screen has settled', () => {
    for (const key of ['e', 'E', 'l', 'L']) expect(keyOnAnOpenThread({ key, justChanged: false })).toBe('shortcut');
  });
  it('still types when the app moved you there, so it never closes a thread you have not read', () => {
    for (const key of ['e', 'l']) expect(keyOnAnOpenThread({ key, justChanged: true, appMovedYou: true })).toBe('to the box');
  });
  it('still types in the middle of a sentence', () => {
    expect(keyOnAnOpenThread({ key: 'e', justChanged: true, stillTyping: true })).toBe('to the box');
  });
  it('other letters right after a change are unchanged', () => {
    expect(keyOnAnOpenThread({ key: 'h', justChanged: true })).toBe('to the box');
    expect(keyOnAnOpenThread({ key: 'j', justChanged: true })).toBe('shortcut');
  });
});

describe('what follows a waiting E', () => {
  it('a letter, digit or space makes it a word', () => {
    for (const key of ['v', 'x', 'e', '1', '.', ' ']) expect(aWordFollows({ key, repeat: false })).toBe(true);
  });
  it('the key held down, or a named key, does not', () => {
    for (const key of ['Escape', 'Enter', 'Shift', 'ArrowDown']) expect(aWordFollows({ key, repeat: false })).toBe(false);
    expect(aWordFollows({ key: 'e', repeat: true })).toBe(false);
  });
  it('waits less than a slow typist takes between letters and not long enough to feel slow', () => {
    expect(WORD_FOLLOWS_MS).toBeGreaterThanOrEqual(250);
    expect(WORD_FOLLOWS_MS).toBeLessThanOrEqual(400);
  });
});

describe('the app', () => {
  it('tells the rule whether it moved you', () => {
    expect(app).toMatch(/keyOnAnOpenThread\(\{[^}]*appMovedYou: !pickLandsHere\(arrived\.current, keyOf\(focused\), Date\.now\(\)\)/);
  });
  it('runs the waiting key only on the thread it was pressed on', () => {
    const at = app.indexOf('const actAfterTheWait');
    expect(at).toBeGreaterThan(-1);
    expect(app.slice(at, at + 700)).toContain('keyOf(item) !== w.thread');
  });
});
