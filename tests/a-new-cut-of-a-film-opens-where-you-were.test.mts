// A NEW CUT OF A FILM OPENS WHERE YOU WERE (w-f702d60afe, round eight, 2026-11-20).
//
// The designer tester compared two cuts of the promo: "The new cut opens at
// 0:00, so I have to find the moment again." The player kept its place by the
// film's address, and a new version is a new address. A file's scroll already
// follows it across versions (scrollKey); a film's time now does too.
import { describe, it, expect } from 'vitest';
import { keepFilmTime, keptFilmTime } from '../renderer/src/kept-scroll.ts';

describe('where a film was left', () => {
  it('carries to its next version', () => {
    keepFilmTime('file:///p/designs/w-1/promo.mp4', 12.5, false);
    expect(keptFilmTime('file:///p/designs/w-1/promo-v2.mp4?t=9')).toBe(12.5);
  });
  it('and back to the one before', () => {
    keepFilmTime('file:///p/designs/w-1/promo-v2.mp4', 20, false);
    expect(keptFilmTime('file:///p/designs/w-1/promo.mp4')).toBe(20);
  });
  it('is not another film\'s, and a film watched to its end starts again', () => {
    expect(keptFilmTime('file:///p/designs/w-1/demo.mp4')).toBe(0);
    keepFilmTime('file:///p/designs/w-1/promo-v3.mp4', 30, true);
    expect(keptFilmTime('file:///p/designs/w-1/promo.mp4')).toBe(0);
  });
});
