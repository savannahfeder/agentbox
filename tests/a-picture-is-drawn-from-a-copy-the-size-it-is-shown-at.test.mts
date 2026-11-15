// A PICTURE IS DRAWN FROM A COPY THE SIZE IT IS SHOWN AT.
//
// What broke (w-8918e86ce0, 2026-11-07): the Mac throttled "specifically when
// we have pictures to load or when I'm dealing with artifacts". The window
// decoded every picture at full size: a Retina screenshot is 2880 pixels wide
// and a thread shows it at 760 points. Measured in the real window (the browser
// copy, a thread of 30 screenshots, 2x screen): 606 MB for the pictures once
// read through, against a window that otherwise held 557 MB; the owner's minute
// log showed the window swinging from 240 MB to 1.2 GB.
//
// Now each picture is fetched once, shrunk to the pixels its place needs, and
// drawn from that copy; GIFs and animated PNGs are left whole.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fitPicture } from '../renderer/src/fit-picture.ts';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const picture = (head, extra = '') => new Blob([new Uint8Array(head), extra]);
const png = (extra) => picture(PNG, extra);
const jpeg = () => picture([0xff, 0xd8, 0xff, 0xe0]);
const gif = () => new Blob(['GIF89a']);

function tools(blob, size, { ok = true, scale = 2 } = {}) {
  const calls = { decodes: [], closed: 0, linked: [] };
  const bitmap = (w, h) => ({ width: w, height: h, close: () => { calls.closed += 1; } });
  return {
    calls,
    fetch: async () => ({ ok, status: ok ? 200 : 404, blob: async () => blob }),
    decode: async (from, resize) => {
      calls.decodes.push(resize ?? null);
      return resize ? bitmap(resize.resizeWidth, resize.resizeHeight) : bitmap(size.w, size.h);
    },
    encode: async (small) => new Blob([`small ${small.width}x${small.height}`]),
    link: (b) => { calls.linked.push(b); return `blob:${calls.linked.length}`; },
    scale: () => scale,
  };
}

describe('how big the copy is', () => {
  it('a Retina screenshot in a thread is shrunk to the pixels 760 points need on a 2x screen', async () => {
    const t = tools(png(), { w: 2880, h: 1800 });
    const r = await fitPicture('pic', { width: 760 }, t);
    expect(r.shrunk).toBe(true);
    expect(t.calls.decodes[1]).toEqual({ resizeWidth: 1520, resizeHeight: 950, resizeQuality: 'high' });
    expect(await t.calls.linked[0].text()).toBe('small 1520x950');
    expect(t.calls.closed).toBe(2);
  });

  it('a JPEG is shrunk the same way', async () => {
    const t = tools(jpeg(), { w: 4000, h: 3000 });
    expect((await fitPicture('pic', { width: 760 }, t)).shrunk).toBe(true);
  });

  it('a picture already near its size is drawn from the file itself, at the line and not below it', async () => {
    // 1520 * 0.9 = 1368: a copy only when it saves more than a tenth.
    const near = tools(png(), { w: 1520 / 0.9, h: 1000 });
    expect((await fitPicture('pic', { width: 760 }, near)).shrunk).toBe(false);
    expect(near.calls.linked[0].size).toBeGreaterThan(0);
    const over = tools(png(), { w: 1520 / 0.89, h: 1000 });
    expect((await fitPicture('pic', { width: 760 }, over)).shrunk).toBe(true);
  });

  it('a chat preview fits inside 360 by 240, so a tall picture is fitted by its height', async () => {
    const t = tools(png(), { w: 1000, h: 2000 });
    await fitPicture('pic', { width: 360, height: 240 }, t);
    expect(t.calls.decodes[1]).toMatchObject({ resizeWidth: 240, resizeHeight: 480 });
  });

  it('a Files cover fills its box, so the copy covers both sides', async () => {
    const t = tools(png(), { w: 2880, h: 1800 });
    await fitPicture('pic', { width: 300, height: 300, cover: true }, t);
    expect(t.calls.decodes[1]).toMatchObject({ resizeWidth: 960, resizeHeight: 600 });
  });
});

describe('what is left whole', () => {
  it('a GIF keeps its frames', async () => {
    const t = tools(gif(), { w: 4000, h: 3000 });
    expect((await fitPicture('pic', { width: 760 }, t)).shrunk).toBe(false);
    expect(t.calls.decodes).toEqual([]);
  });

  it('an animated PNG keeps its frames', async () => {
    const t = tools(png('....IHDR........acTL....'), { w: 4000, h: 3000 });
    expect((await fitPicture('pic', { width: 760 }, t)).shrunk).toBe(false);
    expect(t.calls.decodes).toEqual([]);
  });

  it('a picture that is not there fails, so the thread can try its next place', async () => {
    await expect(fitPicture('pic', { width: 760 }, tools(png(), { w: 10, h: 10 }, { ok: false }))).rejects.toThrow(/not found/);
  });
});

it('opening a thread of thirty decodes two at a time, not thirty at once', async () => {
  let now = 0;
  let most = 0;
  const t = tools(png(), { w: 2880, h: 1800 });
  const slow = { ...t, decode: async (...a) => { now += 1; most = Math.max(most, now); await new Promise((r) => setTimeout(r, 5)); now -= 1; return t.decode(...a); } };
  await Promise.all(Array.from({ length: 30 }, () => fitPicture('pic', { width: 760 }, slow)));
  expect(most).toBe(2);
});

it('a thread\'s pictures and Files covers are drawn through it, and the viewer opens the whole picture', () => {
  const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
  const focus = read('renderer/src/components/Focus.tsx');
  // Four ways a thread finds a picture, and the folder previews.
  expect(focus.match(/<FittedImg /g)?.length).toBe(5);
  expect(focus).not.toMatch(/<img src=\{(?:pictureUrl|again|candidates)/);
  expect(focus).not.toMatch(/\}src=/);
  expect(read('renderer/src/components/FileCover.tsx')).toMatch(/<FittedImg cover className="file-cover-picture"/);
  expect(read('renderer/src/components/PictureView.tsx')).toMatch(/img\.dataset\.full \|\|/);
});
