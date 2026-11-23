// THE APP STORE IMAGES ARE THE SIZE APPLE TAKES AND CARRY NO ALPHA.
//
// The listing's screenshots were redrawn for the phone's new look on
// 2026-11-23. `eas metadata:push` does not upload screenshots, so they are
// kept here and put into App Store Connect by hand or with fastlane deliver,
// which reads `screenshots/<language>/` and orders the files by name. App
// Store Connect refuses a screenshot that is not one of its sizes (1320x2868
// is the 6.9" iPhone's, measured from the PNG header) or that has an alpha
// channel, and takes at most ten per language.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const dir = new URL('../mobile/store/screenshots/en-US/', import.meta.url);
const names = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];

const header = (name: string) => {
  const b = fs.readFileSync(new URL(name, dir));
  return { png: b.subarray(1, 4).toString('latin1'), width: b.readUInt32BE(16), height: b.readUInt32BE(20), colourType: b[25] };
};

describe('the App Store images', () => {
  it('are between one and ten PNGs, named in the order they are shown', () => {
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names.length).toBeLessThanOrEqual(10);
    names.forEach((name, i) => expect(name).toMatch(new RegExp(`^${i + 1}-[a-z-]+\\.png$`)));
  });
  it('are each 1320 by 2868, the 6.9" iPhone in portrait', () => {
    for (const name of names) expect(header(name), name).toMatchObject({ png: 'PNG', width: 1320, height: 2868 });
  });
  it('have no alpha channel', () => {
    // PNG colour type 2 is RGB; 4 and 6 carry alpha.
    for (const name of names) expect(header(name).colourType, name).toBe(2);
  });
});
