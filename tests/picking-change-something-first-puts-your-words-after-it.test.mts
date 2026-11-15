// PICKING "CHANGE SOMETHING FIRST" PUTS YOUR WORDS AFTER IT (w-3d0fa23ffb, 2026-10-21).
//
// The power tester pressed 2 on a thread offering "2. Change something first",
// typed "use css vars not a second tailwind theme" and sent it. The ledger got
// "use css vars not a second tailwind themeChange something first". Pressing 2
// opens the reply box already holding the option's words, and the box only
// called focus(), which in Chrome leaves the caret where pre-filled words
// begin. Reproduced in a copy of the app: press 2, type "use css vars", and the
// box held "use css varsChange something first\n\n" with the caret at 12.
// The box now opens with the caret after whatever it holds.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { focusAtEnd } from '../renderer/src/focus-at-end.ts';

// A text box the way Chrome has one: made holding words, its caret sits where
// they begin, focus() leaves it there, and typing goes in at the caret.
function chromeBox(value) {
  return {
    value, selectionStart: 0, selectionEnd: 0, focused: false,
    focus() { this.focused = true; },
    setSelectionRange(from, to) { this.selectionStart = from; this.selectionEnd = to; },
    type(text) {
      this.value = this.value.slice(0, this.selectionStart) + text + this.value.slice(this.selectionEnd);
      this.selectionStart = this.selectionEnd = this.selectionStart + text.length;
    },
  };
}

it('what you type after pressing 2 goes after the option, not before it', () => {
  const box = chromeBox('Change something first\n\n');
  focusAtEnd(box);
  box.type('use css vars');
  expect(box.focused).toBe(true);
  expect(box.value).toBe('Change something first\n\nuse css vars');
});

it('a kept draft of several lines opens with the caret after its last word', () => {
  const box = chromeBox('first line\nsecond line');
  focusAtEnd(box);
  expect(box.selectionStart).toBe('first line\nsecond line'.length);
  expect(box.selectionEnd).toBe(box.selectionStart);
});

it('an empty box opens with the caret at the start, and nothing is selected', () => {
  const box = chromeBox('');
  focusAtEnd(box);
  box.type('hi');
  expect(box.value).toBe('hi');
});

it('a box that is not there yet is left alone', () => {
  expect(() => focusAtEnd(null)).not.toThrow();
});

it("the thread's reply box opens through it", () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  // A layout effect since w-abed8ae491; what this pins is the caret landing
  // after the words, not which kind of effect puts it there.
  expect(focus).toMatch(/use(Layout)?Effect\(\(\) => \{ focusAtEnd\(ref\.current\); \}, \[\]\);/);
  expect(focus).not.toMatch(/useEffect\(\(\) => \{ ref\.current\?\.focus\(\); \}, \[\]\);/);
});
