// A FILM LOOKS LIKE OURS EVERYWHERE.
//
// In a thread the film was the browser's own control (grey bar, three
// dots) while the big view had our bar, and frame 0 of launch-teaser-v5.mp4 is
// plain cream, so the viewer, the compare view and every tile opened on an empty
// rectangle. On a tile the Play disc sat at left 50% top 50%, right on the
// wordmark. The poster is now the first frame with something on it, measured by
// how much its pixels differ, and the disc sits in a corner.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { frameContrast, isBlankFrame, momentsToTry, bestMoment } from '../renderer/src/film-poster.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

const frame = (paint, n = 64) => {
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i += 1) {
    const [r, g, b] = paint(i);
    out.set([r, g, b, 255], i * 4);
  }
  return out;
};
const cream = () => [247, 241, 230];
const black = () => [0, 0, 0];
const wordmark = (i) => (i % 8 < 2 ? [59, 46, 36] : [247, 241, 230]);
const faint = (i) => (i % 16 === 0 ? [240, 234, 223] : [247, 241, 230]);

describe('a blank frame', () => {
  it('is one colour, whichever colour', () => {
    expect(isBlankFrame(frame(cream))).toBe(true);
    expect(isBlankFrame(frame(black))).toBe(true);
  });
  it('is a wash with a mark too faint to read', () => {
    expect(isBlankFrame(frame(faint))).toBe(true);
  });
  it('is not a cream card with a wordmark on it', () => {
    expect(isBlankFrame(frame(wordmark))).toBe(false);
    expect(frameContrast(frame(wordmark))).toBeGreaterThan(frameContrast(frame(faint)));
  });
});

describe('which moments are tried', () => {
  it('starts just in and stays inside the film', () => {
    expect(momentsToTry(10)[0]).toBeGreaterThan(0);
    expect(momentsToTry(10).every((s) => s < 10)).toBe(true);
    expect(momentsToTry(2).every((s) => s < 2)).toBe(true);
  });
  it('still tries the middle of a film shorter than the first moment', () => {
    expect(momentsToTry(0.4)).toEqual([0.2]);
  });
  it('tries nothing when the length is not known', () => {
    expect(momentsToTry(NaN)).toEqual([]);
    expect(momentsToTry(0)).toEqual([]);
  });
});

describe('the frame it settles on', () => {
  it('is the first that is not blank', () => {
    expect(bestMoment([{ s: 0.6, contrast: 1 }, { s: 1, contrast: 40 }, { s: 2, contrast: 60 }])).toBe(1);
  });
  it('is the most varied when every one is blank', () => {
    expect(bestMoment([{ s: 0.6, contrast: 1 }, { s: 1, contrast: 3 }])).toBe(1);
  });
  it('is none when none could be read', () => {
    expect(bestMoment([])).toBeNull();
  });
});

describe('the browser\'s control is gone', () => {
  it('from the player, which always draws our bar', () => {
    const film = read('renderer/src/components/FilmPlayer.tsx');
    expect(film).not.toMatch(/\bcontrols=/);
    expect(film).toMatch(/<FilmBar/);
  });
  it('from a film in a thread on a computer; a phone keeps its own player and sound keeps its control', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/player\.controls = !film \|\| onPhone\(\)/);
    expect(focus).toMatch(/<FilmBar/);
  });
});

describe('the Play disc on a tile', () => {
  it('sits in a bottom corner, off the words of the picture', () => {
    const css = read('renderer/src/components/message-files.css');
    const rule = /\.file-cover-play \{[^}]*\}/.exec(css)[0];
    expect(rule).not.toMatch(/top:\s*50%/);
    expect(rule).toMatch(/bottom:/);
    expect(read('renderer/src/files/files-place.css')).not.toMatch(/\.fp-face \.file-cover-play \{[^}]*top:\s*50%/);
  });
  it('draws the poster, not a live film per tile', () => {
    expect(read('renderer/src/components/FileCover.tsx')).toMatch(/useFilmPoster/);
  });
});
