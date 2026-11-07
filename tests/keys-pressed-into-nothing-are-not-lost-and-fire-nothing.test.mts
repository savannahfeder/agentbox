// People lost long replies typed while no box had the keyboard: Escape off a
// picture left the thread and 1079 characters went nowhere; a click on a thread
// then typing fired E, J and R underneath ("the list reshuffled and a priority
// changed"). Another pressed R in the inbox and replied to the top row without
// being told whose it was. What is typed now lands in the reply box of the thread
// on screen, a key that closes or moves things waits out a screen change, and R
// says who.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { keyOnAnOpenThread, keyOnTheList, replyingTo, screenJustChanged, heldKeyThatOpenedTheBox, SCREEN_SETTLES_MS } from '../renderer/src/reply-keys';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('a key on an open thread with no box', () => {
  it('a letter with no shortcut goes to the reply box', () => {
    for (const key of ['h', 'H', 'a', 'w', '.', '?', '1']) expect(keyOnAnOpenThread({ key, justChanged: false, hasOptions: false })).toBe('to the box');
  });
  it('E and L fire when the screen has settled', () => {
    expect(keyOnAnOpenThread({ key: 'e', justChanged: false })).toBe('shortcut');
    expect(keyOnAnOpenThread({ key: 'L', justChanged: false })).toBe('shortcut');
  });
  it('E and L right after a screen change are the start of a sentence, not a close', () => {
    expect(keyOnAnOpenThread({ key: 'e', justChanged: true })).toBe('to the box');
    expect(keyOnAnOpenThread({ key: 'l', justChanged: true })).toBe('to the box');
  });
  it('walking and opening stay live, so J J J keeps walking', () => {
    for (const key of ['j', 'k', 'r', 'n', 'z', '/', 'o', 'g', 's']) expect(keyOnAnOpenThread({ key, justChanged: true })).toBe('shortcut');
  });
  it('a number with options on screen is the options, a number with none is typing', () => {
    expect(keyOnAnOpenThread({ key: '2', justChanged: false, hasOptions: true })).toBe('shortcut');
    expect(keyOnAnOpenThread({ key: '2', justChanged: false, hasOptions: false })).toBe('to the box');
  });
  it('named keys and space are left alone', () => {
    for (const key of ['Enter', 'Escape', 'ArrowDown', 'Shift', ' ', 'Tab']) expect(keyOnAnOpenThread({ key, justChanged: true })).toBe('shortcut');
  });
});

describe('a key on the list', () => {
  it('E and L wait out a screen change and say so', () => {
    expect(keyOnTheList({ key: 'e', justChanged: true })).toBe('held');
    expect(keyOnTheList({ key: 'l', justChanged: true })).toBe('held');
    expect(keyOnTheList({ key: 'e', justChanged: false })).toBe('shortcut');
  });
  it('a letter nothing answers says there is nowhere to type', () => {
    expect(keyOnTheList({ key: 'h', justChanged: false })).toBe('nowhere');
    expect(keyOnTheList({ key: 'q', justChanged: true })).toBe('nowhere');
  });
  it('the keys the list has keep working', () => {
    for (const key of ['j', 'k', 'r', 'n', 'z', 'b', '/', 'g', 'Enter', 'Escape', '1', '2', 'i', 'o']) expect(keyOnTheList({ key, justChanged: true })).toBe('shortcut');
  });
});

describe('when the screen has just changed', () => {
  it('for a moment, then not', () => {
    expect(screenJustChanged(1000, 1000 + SCREEN_SETTLES_MS - 1)).toBe(true);
    expect(screenJustChanged(1000, 1000 + SCREEN_SETTLES_MS)).toBe(false);
    expect(screenJustChanged(null, 5)).toBe(false);
  });
});

describe('R says who', () => {
  it('a person or a group by name', () => {
    expect(replyingTo({ people: ['Sofia'] })).toBe('Replying to Sofia');
    expect(replyingTo({ people: ['Sofia', 'Maya'] })).toBe('Replying to Sofia and Maya');
  });
  it('nothing for an agent, whose thread is already on the screen', () => {
    expect(replyingTo({ people: null })).toBeNull();
    expect(replyingTo({ people: [] })).toBeNull();
  });
  it('the box and R on the list both use it', () => {
    expect(read('renderer/src/components/Focus.tsx')).toContain('replyTarget(');
    expect(read('renderer/src/App.tsx')).toContain('replyingTo(');
  });
});

describe('search does not keep the keyboard behind a closed thing', () => {
  it('a document closing does not hand the keyboard back to the field', () => {
    const app = read('renderer/src/App.tsx');
    const at = app.indexOf('WHO HOLDS THE KEYBOARD WHILE SEARCHING');
    expect(app.slice(at, at + 900)).toContain('openDoc');
  });
  it('the chord does nothing in the search field', () => {
    expect(read('renderer/src/App.tsx')).toContain("e.key === 'Enter' && current && !e.metaKey && !e.ctrlKey");
  });
});

describe('a group chat with no box focused', () => {
  it('gives the key to its box, and R does not type itself', () => {
    const app = read('renderer/src/App.tsx');
    const at = app.indexOf("querySelector<HTMLElement>('.rm-compose-input .ProseMirror')");
    expect(at).toBeGreaterThan(-1);
    expect(app.slice(at - 200, at)).toContain("e.key === 'r'");
  });
});

describe('a side thread that opened itself', () => {
  it('does not take the keyboard, one you pressed open does', () => {
    expect(read('renderer/src/team/ThreadPanel.tsx')).toContain('if (takeKeyboard) box.current?.focus()');
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toContain('threadOpenedByPress.current = true; setOpenThread(uid)');
    expect(focus).toContain('threadOpenedByPress.current = false; setOpenThread(openDoc ? null : threadToOpen(waits))');
  });
});

describe('holding the key that opened a box', () => {
  it('a repeat of that key on an empty box is dropped', () => {
    expect(heldKeyThatOpenedTheBox({ key: 'n', repeat: true, empty: true, opener: 'n' })).toBe(true);
    expect(heldKeyThatOpenedTheBox({ key: 'N', repeat: true, empty: true, opener: 'n' })).toBe(true);
  });
  it('a fresh press types, words already there are not touched, another key repeats', () => {
    expect(heldKeyThatOpenedTheBox({ key: 'n', repeat: false, empty: true, opener: 'n' })).toBe(false);
    expect(heldKeyThatOpenedTheBox({ key: 'n', repeat: true, empty: false, opener: 'n' })).toBe(false);
    expect(heldKeyThatOpenedTheBox({ key: 'a', repeat: true, empty: true, opener: 'n' })).toBe(false);
  });
  it('both boxes ask', () => {
    expect(read('renderer/src/threads/ThreadComposer.tsx')).toContain('heldKeyThatOpenedTheBox');
    expect(read('renderer/src/components/Focus.tsx')).toContain('heldKeyThatOpenedTheBox');
  });
});
