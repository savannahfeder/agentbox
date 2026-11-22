// A FILM THAT CANNOT PLAY SHOWS ONLY ITS WORDS.
//
// What broke (iOS Simulator, redesign, 2026-11-22): a film iOS refused drew its
// own crossed-out play mark under "This film cannot be played here.", the two
// on top of each other, because the native player stayed up under the words.
// Read from `Player` in ui/Player.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync('mobile/src/ui/Player.tsx', 'utf8');
const film = src.slice(src.indexOf("const face = filmFace("));

describe('a film in a thread', () => {
  it("takes the native player away once it cannot play", () => {
    expect(film).toMatch(/\{face !== 'error' && <VideoView/);
  });
  it('keeps the player up while it loads, waits for a tap or plays', () => {
    expect(film).not.toMatch(/face === 'play' && <VideoView|face === 'controls' && <VideoView/);
  });
  it('still says it cannot be played', () => {
    expect(film).toMatch(/This film cannot be played here\./);
  });
});
