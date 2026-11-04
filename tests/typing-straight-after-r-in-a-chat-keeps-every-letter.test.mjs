// Typing into a chat's reply box straight after pressing R kept only the first
// letter, twice in one day: Dev typed 190 to 360
// characters to Maya and to Sofia and the box held "V" and "T", with "Not sent
// yet". Measured by pressing keys through the window's key guard on a fake page
// shaped like the chat's box: a chat's box is an editor, so the key's target is
// the editable page inside `.dock-input`, not `.dock-input` itself. Once a
// re-render swapped that editor or took the caret, the guard could not name the
// box it had been typing in, and dropped every letter after the first. And the
// editor's focus() waited a frame, so a letter sent back to it landed nowhere.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { strayLetters, installStrayLetters } from '../renderer/src/stray-letters.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

function fakePage() {
  const listeners = { keydown: [], pointerdown: [] };
  const page = {
    active: null, boxes: [], typed: [],
    document: { querySelector: (sel) => page.boxes.find((b) => sel === `.${b.cls}` && b.isConnected) ?? null },
    addEventListener: (t, fn) => listeners[t].push(fn),
    removeEventListener: (t, fn) => { listeners[t] = listeners[t].filter((f) => f !== fn); },
    /** The chat's box: a wrapper `.dock-input` round the editable page that takes the keys. */
    chatBox() {
      const wrap = {
        cls: 'dock-input', tagName: 'DIV', isContentEditable: false, isConnected: true, value: '',
        getClientRects: () => [1], matches: (sel) => sel === '.dock-input', closest: (sel) => (sel === '.dock-input' ? wrap : null),
        focus() { page.active = doc; }, setSelectionRange() { wrap.caretAtEnd = true; },
      };
      const doc = {
        tagName: 'DIV', isContentEditable: true, cls: 'rich-reply-doc', wrap,
        get isConnected() { return wrap.isConnected; }, getClientRects: () => [1],
        matches: () => false, closest: (sel) => (sel === '.dock-input' ? wrap : null), focus() { page.active = doc; },
      };
      page.boxes.push(wrap);
      return wrap;
    },
    /** A key, as the browser would give it: to the focused element, landing there unless stopped and prevented. */
    press(key) {
      const target = page.active ?? { tagName: 'BODY', matches: () => false, closest: () => null };
      let prevented = false;
      const e = { key, target, metaKey: false, ctrlKey: false, altKey: false, preventDefault() { prevented = true; }, stopImmediatePropagation() {} };
      for (const fn of listeners.keydown) fn(e);
      if (!prevented && page.active?.isContentEditable) page.active.wrap.value += key;
    },
  };
  return page;
}

describe('a chat box, straight after R', () => {
  let page; let off; let now;
  beforeEach(() => {
    off?.();
    strayLetters.reset();
    now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    page = fakePage();
    off = installStrayLetters(page);
  });
  const type = (words) => { for (const k of words) { now += 40; page.press(k); } };

  it('keeps every letter when a re-render swaps the editor after the first one', () => {
    // R was pressed a while ago, so only "still typing" can save the letters.
    strayLetters.opening('reply', now - 2000);
    const first = page.chatBox();
    first.focus(); // the box took the caret as it opened
    type('V');
    expect(first.value).toBe('V');
    // The box drawn again: a new editor holding what was typed, and no caret.
    first.isConnected = false;
    const again = page.chatBox();
    again.value = first.value;
    page.active = null;
    type('ery good');
    expect(again.value).toBe('Very good');
    expect(again.caretAtEnd).toBe(true);
  });

  it('keeps every letter when the caret leaves an editor that stays', () => {
    const box = page.chatBox();
    page.active = null;
    strayLetters.opening('reply', now);
    type('T');
    page.active = null;
    type('hanks');
    expect(box.value).toBe('Thanks');
  });

  it('still lets a shortcut through once typing has stopped', () => {
    const box = page.chatBox();
    page.active = null;
    strayLetters.opening('reply', now);
    type('T');
    page.active = null;
    now += 5000;
    page.press('j');
    expect(box.value).toBe('T');
  });
});

it('the chat editor takes the caret at once when asked, not a frame later', () => {
  const box = read('renderer/src/team/RichReply.tsx');
  expect(box).toMatch(/focus: \{ configurable: true, value: \(\) => \{[^}]*view\.focus\(\)/);
});
