// THE PHONE ICON FILLS ITS SQUARE (2026-10-13).
//
// Reported: the app saved to a phone's home screen "shows the logo with like a
// white border around it rather than just showing the logo on its own".
//
// Measured: main/phone-icon.png was the Mac icon, a rounded tile on a
// see-through margin about a tenth of the width on every side. iOS fills
// see-through pixels with white and rounds the corners itself, so the tile sat
// inside a white frame. The phone icon is now the tile's own background edge to
// edge (scripts/make-phone-icon.mjs). Read here pixel by pixel: every edge and
// corner is solid and dark, and the orange bar is still in the middle.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import zlib from 'node:zlib';

/** The pixels of an 8-bit, non-interlaced RGB or RGBA png. */
function readPng(file) {
  const buf = fs.readFileSync(file);
  let at = 8;
  let width = 0; let height = 0; let type = 0; let depth = 0; let interlace = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const kind = buf.toString('latin1', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    if (kind === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  expect(depth).toBe(8);
  expect(interlace).toBe(0);
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  expect(bpp).toBeGreaterThan(0);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const v = row[x] + [0, a, b, (a + b) >> 1, paeth][f];
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, at: (x, y) => { const i = y * stride + x * bpp; return { r: out[i], g: out[i + 1], b: out[i + 2], a: bpp === 4 ? out[i + 3] : 255 }; } };
}

const png = readPng(new URL('../main/phone-icon.png', import.meta.url));

describe('the phone icon', () => {
  it('is square and big enough for a home screen', () => {
    expect(png.width).toBe(png.height);
    expect(png.width).toBeGreaterThanOrEqual(180);
  });

  it('is solid and dark at every corner and along every edge: nothing for the phone to fill with white', () => {
    const n = png.width - 1;
    const spots = [];
    for (let i = 0; i <= n; i += Math.floor(n / 16)) spots.push([i, 0], [i, n], [0, i], [n, i]);
    for (const [x, y] of spots) {
      const p = png.at(x, y);
      expect(p.a, `alpha at ${x},${y}`).toBe(255);
      expect(Math.max(p.r, p.g, p.b), `brightness at ${x},${y}`).toBeLessThan(60);
    }
  });

  it('still carries the orange bar across its middle', () => {
    const p = png.at(Math.round(png.width * 0.6), Math.round(png.height * 0.5));
    expect(p.r).toBeGreaterThan(200);
    expect(p.b).toBeLessThan(100);
  });
});
