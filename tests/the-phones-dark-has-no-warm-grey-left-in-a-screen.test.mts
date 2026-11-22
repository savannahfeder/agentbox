// THE PHONE'S DARK HAS NO WARM GREY LEFT IN A SCREEN (2026-11-22). Dark became
// a neutral grey palette in theme.ts, but the file screen still drew a page's
// card in #282625 and a sound's card in #2f2d2c: the old brown-grey, written
// out by hand, so the theme change never reached them. The preview thread's
// page and pictures (lib/preview-files.mjs) were drawn in the same browns.
// Found by searching mobile/src for hex colours outside the theme, and on the
// iPhone simulator's Dark thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(tsx?|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : []));
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// A grey (channels within 8 of each other; a tag's tint, like rose #fcf0f3, is wider) whose red stands above its blue.
const warmGrey = (hex: string) => { const [r, g, b] = rgb(hex); return Math.max(r, g, b) - Math.min(r, g, b) <= 8 && r - b >= 3; };

describe('a grey written into a phone screen', () => {
  it('tells warm greys from neutral and cool ones', () => {
    expect(warmGrey('#282625')).toBe(true);
    expect(warmGrey('#2f2d2c')).toBe(true);
    expect(warmGrey('#262626')).toBe(false);
    expect(warmGrey('#0f1013')).toBe(false);
    expect(warmGrey('#ee6018')).toBe(false);
    expect(warmGrey('#fcf0f3')).toBe(false);
  });
  it('is never a warm one, outside the theme', () => {
    const found = files('mobile/src').filter((f) => !f.endsWith('theme.ts'))
      .flatMap((f) => (fs.readFileSync(f, 'utf8').match(/#[0-9a-fA-F]{6}\b/g) ?? []).filter(warmGrey).map((h) => `${f} ${h}`));
    expect(found).toEqual([]);
  });
});
