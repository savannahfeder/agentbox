// A FILM THAT CANNOT PLAY SAYS SO, NAMES ITSELF AND OFFERS OPEN OUTSIDE.
//
// A film that never loaded sat in the viewer as a black box with
// Approve and a comment box beside it, and Sofia pinned a comment at 0:00 on a
// film nobody could see. Measured in headless Chromium 156: a damaged mp4 and
// an HEVC one report their error 9 to 12 ms after loading starts
// (DEMUXER_ERROR_COULD_NOT_OPEN, NO_SUPPORTED_STREAMS). The viewer took the
// film as open the moment the file was found, before a frame had loaded, so
// Approve and comments were offered either way, and the words that came after
// an error offered no way to watch it elsewhere.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { viewOffers } from '../renderer/src/artifact-pins.ts';
import { FilmCannotPlay } from '../renderer/src/components/FilmPlayer.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('what the view offers on a film', () => {
  it('no Approve and no comment on a film that cannot play', () => {
    expect(viewOffers('unplayable', true)).toEqual({ approve: false, comment: false });
  });
  it('both once it plays', () => {
    expect(viewOffers('open', true)).toEqual({ approve: true, comment: true });
  });
});

describe('the words', () => {
  it('name the film and offer Open outside', () => {
    const html = renderToStaticMarkup(React.createElement(FilmCannotPlay, { name: 'launch-cut-v1.mp4', onOutside: () => {} }));
    expect(html).toContain('launch-cut-v1.mp4 cannot be played here');
    expect(html).toMatch(/<button[^>]*>Open outside<\/button>/);
  });
  it('offer no button where nothing can open it outside', () => {
    const html = renderToStaticMarkup(React.createElement(FilmCannotPlay, { name: 'cut.mp4' }));
    expect(html).toContain('cut.mp4 cannot be played here');
    expect(html).not.toContain('<button');
  });
});

describe('the wiring', () => {
  it('the player says open once it has loaded and unplayable on the error', () => {
    const film = read('renderer/src/components/FilmPlayer.tsx');
    expect(film).toMatch(/onLoadedMetadata=\{[\s\S]*?onFound\?\.\('open'\)/);
    expect(film).toMatch(/onError=\{[^\n]*onFound\?\.\('unplayable'\)/);
  });
  it('the one Open outside sits in the words, and the header offers it only for a film that plays', () => {
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toMatch(/onOutside=\{onOutside \? \(\) => onOutside\(path\) : undefined\}/);
    expect(view).toMatch(/onOutside && version && foundNow === 'open'/);
  });
  it('the stage leaves a film to say for itself whether it opened', () => {
    const stage = read('renderer/src/components/ArtifactStage.tsx');
    expect(stage).toMatch(/kind !== 'image' && kind !== 'film'/);
    expect(stage).toMatch(/<FilmPlayer[\s\S]*?onFound=\{onFound\}/);
  });
});
