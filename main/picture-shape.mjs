// A PICTURE'S WIDTH AND HEIGHT, OFF THE FIRST BYTES OF ITS FILE.
//
// The phone draws a picture it has never seen as a 4:3 box until the last byte
// arrives, because WebKit gives a picture no size before it is whole, and then
// the words under it jump by the difference: 514px for a phone screenshot at
// 390px wide (tests/a-picture-the-phone-has-never-seen-gets-its-shape-before-it-arrives).
// The phone asks for this first (main/serve.mjs, /f/<key>/shape/) and draws
// the box at the picture's own shape.
//
// PNG, GIF, JPEG and WebP, which is what agents and phones make. Anything else,
// or a file cut short, is null: the box stays 4:3, which is no worse than it
// was, rather than a guessed shape that is wrong.
import fs from 'node:fs';

/** How much of a file is read. A JPEG's frame sits after its Exif and colour profile. */
const HEAD_BYTES = 256 * 1024;

const shape = (w, h) => (w > 0 && h > 0 ? { w, h } : null);

function png(b) {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return shape(b.readUInt32BE(16), b.readUInt32BE(20));
}

function gif(b) {
  if (b.length < 10 || b.toString('latin1', 0, 4) !== 'GIF8') return null;
  return shape(b.readUInt16LE(6), b.readUInt16LE(8));
}

function webp(b) {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('latin1', 12, 16);
  if (chunk === 'VP8X') return shape(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
  if (chunk === 'VP8 ') return shape(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return shape(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
  }
  return null;
}

/** The Exif orientation in an APP1 block, or 0. 5 to 8 mean it is drawn turned a quarter. */
function orientation(b, start, end) {
  if (b.toString('latin1', start, start + 6) !== 'Exif\0\0') return 0;
  const tiff = start + 6;
  if (tiff + 8 > end) return 0;
  const little = b.toString('latin1', tiff, tiff + 2) === 'II';
  const u16 = (at) => (little ? b.readUInt16LE(at) : b.readUInt16BE(at));
  const u32 = (at) => (little ? b.readUInt32LE(at) : b.readUInt32BE(at));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 0;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 0;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return 0;
}

function jpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let turned = 0;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // Fill bytes before a marker.
    if (marker === 0xff) { i += 1; continue; }
    const length = b.readUInt16BE(i + 2);
    // Every start-of-frame but the three that are not frames (DHT, JPG, DAC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > b.length) return null;
      const h = b.readUInt16BE(i + 5);
      const w = b.readUInt16BE(i + 7);
      return turned >= 5 && turned <= 8 ? shape(h, w) : shape(w, h);
    }
    if (marker === 0xe1 && !turned) turned = orientation(b, i + 4, Math.min(b.length, i + 2 + length));
    i += 2 + length;
  }
  return null;
}

/** `{ w, h }` as the browser will draw it, or null. */
export function pictureShape(bytes) {
  if (!bytes?.length) return null;
  try {
    return png(bytes) ?? gif(bytes) ?? webp(bytes) ?? jpeg(bytes);
  } catch {
    return null;
  }
}

/** The same, read off a file on disk without waiting, for a pass that lists many. */
export function readPictureShapeSync(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    return pictureShape(buffer.subarray(0, fs.readSync(fd, buffer, 0, HEAD_BYTES, 0)));
  } finally {
    fs.closeSync(fd);
  }
}

/** The same, read off a file on disk. */
export async function readPictureShape(file) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const { buffer, bytesRead } = await handle.read({ buffer: Buffer.alloc(HEAD_BYTES), position: 0 });
    return pictureShape(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}
