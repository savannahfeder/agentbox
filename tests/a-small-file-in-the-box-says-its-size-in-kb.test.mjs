// A SMALL FILE IN THE BOX SAYS ITS SIZE IN KB, NOT 0.0 MB.
//
// The reply box's chips started showing each file's size (2b4d937f), always in
// MB to one place, so a 12-byte review.txt read "review.txt 0.0 MB ×" and so
// did any document under 50 KB. Found by the browser test in
// a-thread-reply-survives-leaving-and-coming-back, whose chip lookup broke on it.
import { it, expect } from 'vitest';
import { sizeWords } from '../shared/carried-files.mjs';

const KB = 1024, MB = 1024 * KB;

it('a file under 1 MB is said in KB, and never as 0', () => {
  expect(sizeWords(12)).toBe('1 KB');
  expect(sizeWords(300 * KB)).toBe('300 KB');
  expect(sizeWords(1023 * KB)).toBe('1023 KB');
});

it('from 1 MB it is said in MB as before', () => {
  expect(sizeWords(MB)).toBe('1.0 MB');
  expect(sizeWords(10.6 * MB)).toBe('10.6 MB');
  expect(sizeWords(250 * MB)).toBe('250 MB');
});
