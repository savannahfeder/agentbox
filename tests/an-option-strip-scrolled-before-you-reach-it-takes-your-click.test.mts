// An option strip that moved before your pointer reached it takes your click.
//
// What broke: in the overnight Cloud test (2026-11-16, round three, 5 times)
// clicking "Use it as is" or "It works as is" said "The options moved under
// your pointer. Click the one you want again", and the click after it was
// refused the same way. It happened with a document open beside the thread
// and stopped once the document was closed. The strip's place was compared
// with where it stood at Focus's last render, which can be long before the
// pointer arrived: a scroll of the thread moves the strip without rendering
// Focus, so the render that hovering the strip caused read that old scroll as
// a jump under the pointer.
//
// The rule: the strip's place is taken when the pointer arrives on it, and
// only a move after that, while the pointer is still on it, is a jump.
import { describe, it, expect } from 'vitest';
import { stripUnderThePointer } from '../renderer/src/pick-settles.ts';

describe('the option strip under the pointer', () => {
  it('does not count a move made before the pointer arrived', () => {
    const strip = stripUnderThePointer();
    expect(strip.jumped(700)).toBe(false);
    // The thread scrolls by 240px with the pointer elsewhere: no render.
    strip.enter(460);
    expect(strip.jumped(460)).toBe(false);
  });

  it('counts a move made while the pointer rests on it', () => {
    const strip = stripUnderThePointer();
    strip.enter(460);
    expect(strip.jumped(460)).toBe(false);
    expect(strip.jumped(520)).toBe(true);
  });

  it('ignores a move of less than a few pixels', () => {
    const strip = stripUnderThePointer();
    strip.enter(460);
    expect(strip.jumped(462.5)).toBe(false);
  });

  it('does not count a move once the pointer has left', () => {
    const strip = stripUnderThePointer();
    strip.enter(460);
    strip.leave();
    expect(strip.jumped(700)).toBe(false);
  });

  it('starts over from where it is when the pointer comes back', () => {
    const strip = stripUnderThePointer();
    strip.enter(460);
    strip.leave();
    strip.jumped(700);
    strip.enter(300);
    expect(strip.jumped(300)).toBe(false);
  });
});
