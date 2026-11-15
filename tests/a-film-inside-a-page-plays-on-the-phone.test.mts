// A FILM INSIDE A PAGE PLAYS ON THE PHONE.
//
// What broke (2026-10-29, from the phone app): "Videos often get sent in HTML
// files and don't load." The phone draws a page with none of its code running,
// in a frame that never let a film play in place. Measured that day over the
// person's own store: 220 pages hold a <video>; 112 of them are a film's
// working page (HyperFrames clips moved by the page's own code, which a phone
// never runs), the rest are plain films, and only 7 of 122 plain pages carry
// more film than the phone takes. So a plain film gets its controls and plays
// in place (PageFrame.tsx), and agents are told to send the finished video
// rather than its working page (briefs/message-rules.md).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { filmsPlayHere, isFilmWorkingPage } from '../mobile/src/lib/page-films';

describe('a plain film in a page', () => {
  it('gets controls and plays in place when it had none', () => {
    expect(filmsPlayHere('<video src="a.mp4" autoplay muted loop></video>')).toBe('<video controls playsinline src="a.mp4" autoplay muted loop></video>');
  });

  it('keeps what it already had, and says playsinline once', () => {
    expect(filmsPlayHere('<video src="a.mp4" controls preload="metadata">')).toBe('<video playsinline src="a.mp4" controls preload="metadata">');
    expect(filmsPlayHere('<video controls playsinline src="a.mp4">')).toBe('<video controls playsinline src="a.mp4">');
  });

  it('every film on the page, and nothing that only looks like one', () => {
    expect(filmsPlayHere('<VIDEO src="a.mp4"><p>videos</p><video\nsrc="b.mov">')).toBe('<VIDEO controls playsinline src="a.mp4"><p>videos</p><video controls playsinline\nsrc="b.mov">');
    expect(filmsPlayHere('<p>&lt;video src="x"&gt;</p><videography>')).toBe('<p>&lt;video src="x"&gt;</p><videography>');
  });
});

describe('a film\'s working page', () => {
  const clip = '<video data-hf-id="hf-fnza" id="i5-v" class="clip" src="a.mp4" data-start="0" data-duration="5.96" muted playsinline>';
  it('is known by its clips, and its clips are left as the page set them', () => {
    expect(isFilmWorkingPage(clip)).toBe(true);
    expect(filmsPlayHere(clip)).toBe(clip);
  });

  it('a page with a plain film is not one', () => {
    expect(isFilmWorkingPage('<video src="a.mp4" controls class="hero">')).toBe(false);
  });
});

describe('agents are told', () => {
  it('to send a film as its finished video, not the page it was built from', () => {
    const rules = fs.readFileSync(new URL('../briefs/message-rules.md', import.meta.url), 'utf8');
    expect(rules).toMatch(/name a film.s mp4, not the page/);
  });
});
