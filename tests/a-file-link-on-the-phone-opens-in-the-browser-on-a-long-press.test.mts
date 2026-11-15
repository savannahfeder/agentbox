// A FILE LINK ON THE PHONE OPENS IN THE BROWSER ON A LONG PRESS.
//
// What broke (2026-10-29, from the phone app): "I can't select links (text
// components that are tagged like 'Design File') and open them in a browser.
// Quite often I want to open them elsewhere." A press on a file opened it in
// the app's own viewer and nothing else was offered. Now a long press on a
// file link or a file's tile offers Open in browser and Share, from the
// address `linkToShare` gives: a site as written, a file by its own link, and
// nothing for a folder or a file the phone does not have.
import { describe, it, expect } from 'vitest';
import { cloudPlaces } from '../renderer/src/cloud-files.ts';
import { phoneSlug } from '../renderer/src/phone-rows.ts';
import { openingOf, linkToShare } from '../mobile/src/lib/files';

const D = '0a1b2c3d4e5f';
const P = phoneSlug(D, 'agentbox');
const n = (c, ext) => `${c.repeat(64 / c.length)}.${ext}`;
const ROUND = 'designs/w-8b9c0d1e2f';
const files = {
  [`${ROUND}/compare.html`]: { n: n('d2', 'html'), s: 900 },
  [`${ROUND}/notes.md`]: { n: n('d1', 'md'), s: 300 },
  [`${ROUND}/walkthrough.mp4`]: { n: n('e1', 'mp4'), s: 4393 },
  [`${ROUND}/brief.pdf`]: { n: n('e2', 'pdf'), s: 9000 },
  [`${ROUND}/quiet.png`]: { n: n('c1', 'png'), s: 100 },
  'recordings/session.mov': { s: 812_000_000, big: true },
};
const places = cloudPlaces([{ device: D, project: 'agentbox', snapshot: { item: { updatedAt: 1 }, attached: { dir: '~/docs/agentbox', files, folders: { [`${ROUND}/`]: [`${ROUND}/quiet.png`] } } } }], phoneSlug);
const url = (name) => `https://cloud/${name}?token=t`;
const links = new Map(Object.values(files).filter((e) => e.n).map((e) => [e.n, { url: url(e.n), until: Date.now() + 3600_000 }]));
const share = (src) => linkToShare(openingOf(places, links, P, src));

describe('what a long press offers to open elsewhere', () => {
  it('a design page, a document, a film, a picture and any other file, by its own link', () => {
    expect(share(`${ROUND}/compare.html`)).toBe(url(n('d2', 'html')));
    expect(share(`${ROUND}/notes.md`)).toBe(url(n('d1', 'md')));
    expect(share(`${ROUND}/walkthrough.mp4`)).toBe(url(n('e1', 'mp4')));
    expect(share(`${ROUND}/quiet.png`)).toBe(url(n('c1', 'png')));
    expect(share(`${ROUND}/brief.pdf`)).toBe(url(n('e2', 'pdf')));
  });

  it('a site as it was written', () => {
    expect(share('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
  });

  it('nothing for a folder, a file too big for the phone, or one it never had', () => {
    expect(share(`${ROUND}/`)).toBeNull();
    expect(share('recordings/session.mov')).toBeNull();
    expect(share('designs/elsewhere/missing.html')).toBeNull();
  });
});
