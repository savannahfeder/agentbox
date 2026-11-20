// A THREAD'S PICTURES ARE READY BEFORE IT IS OPENED.
//
// What was slow: opening a thread waited for each picture to be fetched,
// decoded, shrunk and encoded (renderer/src/fit-picture.ts); measured in
// Electron with 16 screenshots, 0.3-0.6 s before the first showed on a first
// open. The row under the cursor now has its answer's pictures shrunk while it
// sits there, at the width the thread draws them, so the open finds them made.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { picturesNamedIn } from '../renderer/src/components/FittedImg.tsx';

describe('the pictures a thread names', () => {
  it('are its full paths, bare or as file urls, in order and once each', () => {
    const text = 'Step 1:\n\n![one](/Users/x/p/a.png)\n\n![two](file:///Users/x/p/b.png)\n\n![again](/Users/x/p/a.png)';
    expect(picturesNamedIn(text)).toEqual(['/Users/x/p/a.png', '/Users/x/p/b.png']);
  });

  it('leave out relative paths, web addresses and links that are not pictures', () => {
    expect(picturesNamedIn('![r](shots/a.png) ![w](https://x.dev/a.png) [doc](/Users/x/p/a.png) ![t](/Users/x/p/notes.txt)')).toEqual([]);
    expect(picturesNamedIn(null)).toEqual([]);
  });
});

describe('the row under the cursor', () => {
  it('has its pictures made at the width the thread last drew them', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/const shots = picturesNamedIn\(underCursor\?\.result\)/);
    expect(app).toMatch(/warmPictures\(shots, leaving\.signal\)/);
    const fitted = fs.readFileSync(new URL('../renderer/src/components/FittedImg.tsx', import.meta.url), 'utf8');
    expect(fitted).toMatch(/inlineWidth = width/);
  });
});
