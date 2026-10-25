// A PICTURE OR PAGE A CLOUD RUN NAMES IS DRAWN ONCE IT LANDS.
//
// What broke (2026-10-15): a cloud run's answer named its pictures by their
// full paths, and the answer reached the app before the pictures did, which
// came with the rest of the run's work. Measured by reading `ArtifactImg` and
// `ArtifactEmbed` in renderer/src/components/Focus.tsx: a full path that was
// not there yet set `broken` once and drew "missing image" for good, a
// file:// one drew the browser's broken mark for good, and a page named in the
// message asked for its file once and then drew nothing until the thread was
// opened again.
//
// Now both look again on the schedule a teammate's late picture already uses
// (../renderer/src/picture-looks-again.ts), the picture asking for its file
// with a mark the app's picture scheme ignores, so it is really fetched again.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactImg } from '../renderer/src/components/Focus.tsx';
import { pictureUrl } from '../renderer/src/picture.ts';
import { imgPath } from '../main/img-scheme.mjs';

const source = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const picture = source.slice(source.indexOf('export function ArtifactImg'), source.indexOf('// A SOUND OR A FILM'));
const page = source.slice(source.indexOf('function ArtifactEmbed'), source.indexOf('function ArtifactEmbed') + 3000);

describe('a picture named by its full path', () => {
  it('is drawn from the app\'s picture scheme, bare or as a file url', () => {
    for (const src of ['/Users/x/p/designs/w-1/a.png', 'file:///Users/x/p/designs/w-1/a.png']) {
      const drawn = renderToStaticMarkup(createElement(ArtifactImg, { src, roots: [], onOpen: () => {} }));
      expect(drawn).toContain(`src="${pictureUrl('/Users/x/p/designs/w-1/a.png')}"`);
    }
  });

  it('looks again when it was not there, on the late-picture schedule, and can be pressed to look now', () => {
    const full = picture.slice(picture.indexOf("if (/^file:\\/\\//.test(src) || src.startsWith('/'))"));
    expect(full).toMatch(/onError=\{\(\) => setBroken\(true\)\}/);
    expect(full).toMatch(/again\(pictureUrl\(file\)\)/);
    expect(picture).toMatch(/const wait = lookAgainAfter\(tries\);/);
    expect(full).toMatch(/<button[^>]*className="missing-artifact"[^>]*onClick=/s);
  });

  it('is asked for again with a mark the picture scheme reads past, so the same file is fetched', () => {
    const url = `${pictureUrl('/Users/x/p/designs/w-1/a.png')}?look=3`;
    expect(imgPath(url)).toBe('/Users/x/p/designs/w-1/a.png');
  });
});

describe('a page named in the message', () => {
  it('is looked for again while it is not there, and stops once found', () => {
    expect(page).toMatch(/lookAgainAfter\(looks\)/);
    expect(page).toMatch(/const wait = found \? null : lookAgainAfter\(looks\)/);
    expect(page).toMatch(/clearTimeout\(timer\)/);
  });
});
