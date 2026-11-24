// A LONG SEARCH FADES WHERE ITS WORDS RUN OUT OF THE BAR.
//
// The owner, 2026-11-24, of a description typed into ⌘K for Ask AI: "Let's
// say you write something several times as long as this. Does that still look
// clean?" Drawn with a 200-character description at 1440x900, the bar scrolled
// its text and sliced letters in half at both edges, one of them hard against
// the Ask AI button. Now the side whose words are out of view fades out.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { clippedEnds } from '../renderer/src/components/Palette.tsx';

describe('the search bar with more words than fit', () => {
  it('fades the end when the words run past it, and nothing when they fit', () => {
    expect(clippedEnds(0, 500, 500)).toBe('');
    expect(clippedEnds(0, 500, 480)).toBe('');
    expect(clippedEnds(0, 500, 900)).toBe(' clip-end');
  });

  it('fades the start once scrolled to the end, and both sides in the middle', () => {
    expect(clippedEnds(400, 500, 900)).toBe(' clip-start');
    expect(clippedEnds(200, 500, 900)).toBe(' clip-start clip-end');
  });

  it('ignores the pixel a browser rounds off', () => {
    expect(clippedEnds(0.5, 500, 501)).toBe('');
  });

  it('is drawn on the bar, and the fade is a mask so it works on any theme', () => {
    const palette = fs.readFileSync(new URL('../renderer/src/components/Palette.tsx', import.meta.url), 'utf8');
    expect(palette).toMatch(/className=\{`palette-input\$\{clipped\}`\}/);
    const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.palette-k \.palette-input\.clip-start\.clip-end \{[^}]*mask-image/);
    expect(css).toMatch(/\.palette-k \.palette-input\.clip-start \{[^}]*mask-image/);
    expect(css).toMatch(/\.palette-k \.palette-input\.clip-end \{[^}]*mask-image/);
  });
});
