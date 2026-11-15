// Opening a picture from a folder of eight, the phone app's strip of small
// pictures under it started off the left edge of the screen: the strip sits in
// a centred column and grew to its eight pictures' width, 640px on a 402px
// phone, so its first picture, the one open, was the one cut away. Seen on a
// photograph of the preview build. The strip is now no wider than its column
// and scrolls inside it.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync('mobile/src/app/file.tsx', 'utf8');
const strip = src.split('\n').find((l) => l.includes('<ScrollView horizontal') && l.includes('glass'));

describe("the phone app's picture strip starts on screen", () => {
  it('finds the strip', () => expect(strip).toBeTruthy());
  it('is never wider than its column', () => expect(strip).toMatch(/maxWidth: '100%'/));
  it('still sits on the glass, centred, its own width when the pictures are few', () => {
    expect(strip).toMatch(/\.\.\.glass/);
    expect(strip).toMatch(/flexGrow: 0/);
  });
});
