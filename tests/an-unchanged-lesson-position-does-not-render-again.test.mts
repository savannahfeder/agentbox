// A layout effect allocated a position on every render while its list changed
// identity each time. Check that stationary coordinates preserve state identity.
import { it, expect } from 'vitest';
import { lessonPosition } from '../renderer/src/lesson-position';
it('keeps the same object for the same coordinates', () => {
  const previous = { left: 20, top: 40 };
  expect(lessonPosition(previous, { left: 20, top: 40 })).toBe(previous);
  expect(lessonPosition(previous, { left: 21, top: 40 })).toEqual({ left: 21, top: 40 });
  expect(lessonPosition(previous, null)).toBeNull();
  expect(lessonPosition(null, null)).toBeNull();
  expect(lessonPosition(null, previous)).toBe(previous);
});
