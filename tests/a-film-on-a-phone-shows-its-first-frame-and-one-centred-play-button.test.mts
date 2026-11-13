// A FILM ON A PHONE SHOWS ITS FIRST FRAME AND ONE CENTRED PLAY BUTTON.
//
// Reported 2026-10-28: "videos when loading look super weird, it uses these
// weird off centered icons for the thumbnail". Both phone apps handed the bare
// link to the system's player. The web app's <video> loaded metadata only, so
// iPhone Safari drew its own grey placeholder, never a frame; the iPhone app
// showed the system player's own controls and spinner before the film had
// loaded. The web app now asks for the first frame (a #t media fragment) and
// keeps the film in the page; the iPhone app keeps the system controls hidden
// until the first tap, over one centred mark of its own.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { firstFrameSrc } from '../renderer/src/player-shelf';
import { filmFace } from '../mobile/src/lib/files';

describe('the web app\'s film', () => {
  it('asks for its first frame, so Safari draws a picture rather than a placeholder', () => {
    expect(firstFrameSrc('https://x.test/f.mp4?token=abc')).toBe('https://x.test/f.mp4?token=abc#t=0.001');
    expect(firstFrameSrc('agentbox-img:///a/b.mov')).toBe('agentbox-img:///a/b.mov#t=0.001');
  });

  it('leaves a link that already names a moment as it is', () => {
    expect(firstFrameSrc('https://x.test/f.mp4#t=12')).toBe('https://x.test/f.mp4#t=12');
  });

  it('plays in the page, and only the film gets the fragment', () => {
    const src = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/playsInline = true/);
    expect(src).toMatch(/film \? firstFrameSrc\(url\) : url/);
  });
});

describe('the iPhone app\'s film', () => {
  it('shows a spinner while it loads, a play button once it can play, and the system controls only once tapped', () => {
    expect(filmFace({ status: 'loading', tapped: false })).toBe('loading');
    expect(filmFace({ status: 'idle', tapped: false })).toBe('loading');
    expect(filmFace({ status: 'readyToPlay', tapped: false })).toBe('play');
    expect(filmFace({ status: 'readyToPlay', tapped: true })).toBe('controls');
    expect(filmFace({ status: 'loading', tapped: true })).toBe('controls');
  });

  it('says so when the film cannot be played, rather than spinning for ever', () => {
    expect(filmFace({ status: 'error', tapped: false })).toBe('error');
    expect(filmFace({ status: 'error', tapped: true })).toBe('error');
  });
});
