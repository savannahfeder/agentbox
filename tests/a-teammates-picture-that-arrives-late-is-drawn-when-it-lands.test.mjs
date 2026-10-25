// A TEAMMATE'S PICTURE THAT ARRIVES LATE IS DRAWN WHEN IT LANDS.
//
// REPORTED 2026-10-14 by a teammate trying the team version: "attachments do
// not open in threads and DM". A file in a conversation crosses on its own,
// after the line that names it whenever the cloud does not have it yet: the
// reader's Mac keeps asking for it once a minute (main/team/sync.mjs). But the
// picture in the message asked for its file ONCE. Measured by reading
// `ArtifactImg` in renderer/src/components/Focus.tsx on this branch: `find`
// ran when every root missed, `found` became null, and nothing ever set it
// back, so the message said "missing image: attachments/…" until the thread
// was closed and opened again, and that text was a plain span with nothing to
// click. A picture that does not open, in exactly the two places files cross
// between people.
//
// Now a missing picture looks again on its own, sooner at first and less often
// after, and pressing it looks again at once. It stops on its own eventually,
// so an old thread naming a picture that never existed does not ask forever.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { lookAgainAfter } from '../renderer/src/picture-looks-again.ts';
import { ArtifactImg } from '../renderer/src/components/Focus.tsx';

describe('when a missing picture looks for its file again', () => {
  it('looks again within seconds the first time', () => {
    expect(lookAgainAfter(0)).toBeGreaterThan(0);
    expect(lookAgainAfter(0)).toBeLessThanOrEqual(10_000);
  });

  it('waits longer each time, never past five minutes between looks', () => {
    let last = 0;
    for (let tries = 0; lookAgainAfter(tries) !== null; tries += 1) {
      expect(lookAgainAfter(tries)).toBeGreaterThanOrEqual(last);
      expect(lookAgainAfter(tries)).toBeLessThanOrEqual(5 * 60_000);
      last = lookAgainAfter(tries);
    }
  });

  it('keeps looking for at least as long as a file takes to cross, and then stops', () => {
    let total = 0;
    let tries = 0;
    while (lookAgainAfter(tries) !== null) { total += lookAgainAfter(tries); tries += 1; }
    // The reader asks the cloud once a minute; a quarter of an hour covers a
    // sender whose Mac was slow to put the file up.
    expect(total).toBeGreaterThanOrEqual(15 * 60_000);
    expect(total).toBeLessThanOrEqual(60 * 60_000);
    expect(lookAgainAfter(tries + 1)).toBe(null);
  });

  it('is not asked with nonsense', () => {
    expect(lookAgainAfter(-1)).toBe(null);
    expect(lookAgainAfter(Number.NaN)).toBe(null);
  });
});

describe('the picture in the message', () => {
  const source = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  const picture = source.slice(source.indexOf('export function ArtifactImg'), source.indexOf('// A SOUND OR A FILM'));

  it('asks again on its own schedule once it has been found missing', () => {
    expect(picture).toMatch(/lookAgainAfter\(/);
    expect(picture).toMatch(/setTimeout\(/);
    expect(picture).toMatch(/clearTimeout\(/);
  });

  it('can be pressed to look again at once while it is missing', () => {
    expect(picture).toMatch(/<button[^>]*className="missing-artifact"[^>]*onClick=\{lookNow\}/s);
  });

  // THE CASE THAT MUST NOT CHANGE: a picture that is there is drawn exactly as
  // before, and one with no finder to ask stays plain words.
  it('still draws a picture it can find, and plain words when there is no finder', () => {
    const drawn = renderToStaticMarkup(createElement(ArtifactImg, { src: 'attachments/a.png', roots: ['/x'], onOpen: () => {} }));
    expect(drawn).toMatch(/<img/);
    const words = renderToStaticMarkup(createElement(ArtifactImg, { src: 'attachments/a.png', roots: [] }));
    expect(words).toMatch(/<span class="missing-artifact">missing image: attachments\/a.png<\/span>/);
  });
});
