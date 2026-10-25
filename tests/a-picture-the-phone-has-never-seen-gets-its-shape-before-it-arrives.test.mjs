// A PICTURE THE PHONE HAS NEVER SEEN GETS ITS SHAPE BEFORE IT ARRIVES
// (2026-10-14).
//
// "It starts with a dot and then loads, which means that if I ever try to
// scroll up or look at anything, it's always moving around." Once the loading
// box was as wide as the column (a-picture-on-its-way-holds-the-columns-width-
// not-a-dot), a picture seen before held still, but one never seen was still a
// 4:3 box until its last byte came: measured in WebKit at 390px, 358 x 269
// while loading and 358 x 776 when a phone screenshot arrived, so the words
// under it moved 514px. WebKit gives a picture no size until it is whole, even
// with its first 4 KB in hand (scripts/scratch/picture-dot.mjs, EARLY=1).
//
// So the phone asks the computer for the picture's width and height, which
// come off the first bytes of the file, at /f/<file key>/shape/<path>: under
// the same file key and the same rule as the picture itself. The answer is a
// few bytes and comes back well before a screenshot's megabyte does.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, newToken, fileKey } from '../main/serve.mjs';
import { pictureShape } from '../main/picture-shape.mjs';
import { askShape, shapeOf } from '../renderer/src/phone-files.ts';

const u16be = (n) => [(n >> 8) & 255, n & 255];
const u16le = (n) => [n & 255, (n >> 8) & 255];
const u32be = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];

const png = (w, h) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32be(w), ...u32be(h), 8, 6, 0, 0, 0, 0, 0, 0, 0]);
const gif = (w, h) => Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...u16le(w), ...u16le(h), 0, 0, 0]);
/** A JPEG: an optional Exif block saying how it is turned, a filler block, then the frame. */
function jpeg(w, h, orientation = 0) {
  const parts = [0xff, 0xd8];
  if (orientation) {
    // Exif, big-endian TIFF, IFD0 with one entry: 0x0112 SHORT 1 = orientation.
    const tiff = [0x4d, 0x4d, 0, 42, ...u32be(8), ...u16be(1), ...u16be(0x0112), ...u16be(3), ...u32be(1), ...u16be(orientation), 0, 0, ...u32be(0)];
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    parts.push(0xff, 0xe1, ...u16be(body.length + 2), ...body);
  }
  parts.push(0xff, 0xdb, ...u16be(4), 0, 0);
  parts.push(0xff, 0xc0, ...u16be(17), 8, ...u16be(h), ...u16be(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  return Buffer.from(parts);
}
const webpX = (w, h) => Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0,
  (w - 1) & 255, ((w - 1) >> 8) & 255, ((w - 1) >> 16) & 255, (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255]);

describe('the shape of a picture, off its first bytes', () => {
  it('reads a PNG, a GIF, a JPEG and a WebP', () => {
    expect(pictureShape(png(1206, 2622))).toEqual({ w: 1206, h: 2622 });
    expect(pictureShape(gif(320, 200))).toEqual({ w: 320, h: 200 });
    expect(pictureShape(jpeg(4032, 3024))).toEqual({ w: 4032, h: 3024 });
    expect(pictureShape(webpX(1920, 1080))).toEqual({ w: 1920, h: 1080 });
  });

  it('turns a phone photo the way the browser will draw it', () => {
    // A portrait photo is stored landscape with "turn me" in its Exif.
    expect(pictureShape(jpeg(4032, 3024, 6))).toEqual({ w: 3024, h: 4032 });
    expect(pictureShape(jpeg(4032, 3024, 8))).toEqual({ w: 3024, h: 4032 });
    expect(pictureShape(jpeg(4032, 3024, 3))).toEqual({ w: 4032, h: 3024 });
  });

  it('says nothing about what it cannot read, rather than guess', () => {
    expect(pictureShape(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(null);
    expect(pictureShape(png(10, 10).subarray(0, 20))).toBe(null);
    expect(pictureShape(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0]))).toBe(null);
    expect(pictureShape(png(0, 10))).toBe(null);
    expect(pictureShape(Buffer.alloc(0))).toBe(null);
  });
});

describe('the phone\'s server, asked for a shape', () => {
  let server, base, token, root, outside, dist;
  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'shape-files-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'shape-outside-'));
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'shape-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<p>app</p>');
    fs.writeFileSync(path.join(root, 'shot one.png'), png(1206, 2622));
    fs.writeFileSync(path.join(root, 'notes.txt'), 'words');
    fs.writeFileSync(path.join(outside, 'secret.png'), png(5, 5));
    token = newToken();
    const inside = (f) => f.startsWith(root + path.sep);
    server = createServer({ channels: new Map(), token: () => token, dist, files: { allows: (kind, f) => kind === 'img' && inside(f) } });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => { server.close(); for (const d of [root, outside, dist]) fs.rmSync(d, { recursive: true, force: true }); });
  const at = (key, file) => `${base}/f/${key}/shape/${file.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;

  it('answers the width and height of a picture the phone may see', async () => {
    const res = await fetch(at(fileKey(token), path.join(root, 'shot one.png')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ w: 1206, h: 2622 });
  });

  it('answers nothing outside what the phone may see, or to the wrong key', async () => {
    expect((await fetch(at(fileKey(token), path.join(outside, 'secret.png')))).status).toBe(403);
    expect((await fetch(at('wrong-key-wrong-key-wrong-key-xx', path.join(root, 'shot one.png')))).status).toBe(403);
    expect((await fetch(at(fileKey(token), path.join(root, '..', path.basename(outside), 'secret.png')))).status).toBe(403);
  });

  it('answers not found for a file that is not a picture or is not there', async () => {
    expect((await fetch(at(fileKey(token), path.join(root, 'notes.txt')))).status).toBe(404);
    expect((await fetch(at(fileKey(token), path.join(root, 'gone.png')))).status).toBe(404);
  });
});

/** An <img> as askShape sees it. */
function picture(src, { complete = false } = {}) {
  return { complete, style: {}, getAttribute: (k) => (k === 'src' ? src : null) };
}
const answering = (said, calls = []) => (url) => { calls.push(url); return Promise.resolve({ ok: !!said, json: () => Promise.resolve(said) }); };
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the phone, drawing a picture it has never seen', () => {
  it('asks for its shape and gives the loading box that shape', async () => {
    const calls = [];
    const img = picture('/f/key/img/Users/x/new-1.png');
    askShape(img, answering({ w: 1206, h: 2622 }, calls));
    await settle();
    expect(calls).toEqual(['/f/key/shape/Users/x/new-1.png']);
    expect(img.style.aspectRatio).toBe('1206 / 2622');
    expect(shapeOf('/f/key/img/Users/x/new-1.png')).toBe('1206 / 2622');
  });

  it('leaves alone a picture that arrived before the answer did', async () => {
    const img = picture('/f/key/img/Users/x/new-2.png');
    askShape(img, answering({ w: 10, h: 20 }));
    img.complete = true;
    await settle();
    expect(img.style.aspectRatio).toBeUndefined();
  });

  it('asks once per picture, and not at all for one it knows', async () => {
    const calls = [];
    askShape(picture('/f/key/img/Users/x/new-3.png'), answering({ w: 4, h: 3 }, calls));
    askShape(picture('/f/key/img/Users/x/new-3.png'), answering({ w: 4, h: 3 }, calls));
    await settle();
    askShape(picture('/f/key/img/Users/x/new-3.png'), answering({ w: 4, h: 3 }, calls));
    expect(calls.length).toBe(1);
  });

  it('asks nothing for an address that is not one of the computer\'s pictures', async () => {
    const calls = [];
    askShape(picture('https://example.com/a.png'), answering({ w: 1, h: 1 }, calls));
    askShape(picture('/f/key/doc/Users/x/page.html'), answering({ w: 1, h: 1 }, calls));
    expect(calls).toEqual([]);
  });

  it('keeps the 4:3 box when the computer cannot say', async () => {
    const img = picture('/f/key/img/Users/x/new-4.svg');
    askShape(img, answering(null));
    await settle();
    expect(img.style.aspectRatio).toBeUndefined();
  });
});
