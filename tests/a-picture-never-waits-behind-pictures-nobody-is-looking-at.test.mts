// A PICTURE NEVER WAITS BEHIND PICTURES NOBODY IS LOOKING AT.
//
// What broke (w-09a712d5bd, 2026-11-15): "any sort of image is taking forever
// to load. They just stay in the loading state for ages." Since 2026-11-08
// every picture in a thread and every Files cover is fetched, decoded, shrunk
// and encoded again before it shows, two at a time across the whole window
// (renderer/src/fit-picture.ts). Three things made the wait long:
//
// - A thread or Files view you left kept its pictures in that queue, so the
//   one you opened next waited behind all of them.
// - The fetch ran inside the turn, and a picture kept in the cloud waits up to
//   a minute for its file to come back (main/main.mts), holding one of the two
//   turns all that time.
// - Nothing was kept, so every visit shrank every picture again.
//
// Measured in Chromium on a 2-core machine with 2880-wide screenshots: 190 ms
// a picture (58 decode, 57 shrink, 58 encode), 2.8 s before the 30th of a
// thread showed, against 0.18 s for all 30 drawn whole.
import { describe, it, expect } from 'vitest';
import { fitPicture, keptCopies } from '../renderer/src/fit-picture.ts';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (extra = '') => new Blob([new Uint8Array(PNG), extra]);

function tools({ blob = png(), kept = null, fetchWait = null } = {}) {
  const calls = { fetched: [], decodes: 0 };
  return {
    calls,
    ...(kept ? { kept } : {}),
    fetch: async (url) => {
      calls.fetched.push(url);
      if (fetchWait) await fetchWait(url);
      return { ok: true, status: 200, blob: async () => (typeof blob === 'function' ? blob(url) : blob) };
    },
    decode: async (_from, resize) => {
      calls.decodes += 1;
      await new Promise((r) => setTimeout(r, 2));
      return resize ? { width: resize.resizeWidth, height: resize.resizeHeight, close() {} } : { width: 2880, height: 1800, close() {} };
    },
    encode: async (small) => new Blob([`small ${small.width}x${small.height}`]),
    link: () => 'blob:x',
    scale: () => 2,
  };
}

describe('a picture that left the screen', () => {
  it('gives up its turn before it is decoded, and the picture on screen goes next', async () => {
    const t = tools();
    const signals = [];
    const fetch = t.fetch;
    t.fetch = (url, signal) => { signals.push(signal); return fetch(url); };
    const left = Array.from({ length: 10 }, () => new AbortController());
    const old = left.map((c, i) => fitPicture(`old-${i}`, { width: 760 }, t, c.signal).catch((e) => e.name));
    // Two have their turn by the time she moves on; eight are still waiting.
    await new Promise((r) => setTimeout(r, 0));
    for (const c of left.slice(2)) c.abort();
    const shown = await fitPicture('new', { width: 760 }, t);
    expect(shown.shrunk).toBe(true);
    const ended = await Promise.all(old);
    expect(ended.filter((e) => e === 'AbortError')).toHaveLength(8);
    // Two decodes a picture: the two under way and the one on screen.
    expect(t.calls.decodes).toBe(6);
    // The fetch is told too, so one still coming is cut off.
    expect(signals[9]).toBe(left[9].signal);
  });

  it('a picture still on screen is drawn as before', async () => {
    const c = new AbortController();
    const r = await fitPicture('pic', { width: 760 }, tools(), c.signal);
    expect(r.shrunk).toBe(true);
  });
});

describe('a picture slow to arrive', () => {
  it('does not hold a turn while it waits, so the others are drawn meanwhile', async () => {
    const release = [];
    const t = tools({ fetchWait: (url) => (url.startsWith('slow') ? new Promise((r) => release.push(r)) : undefined) });
    const slow = [fitPicture('slow-1', { width: 760 }, t), fitPicture('slow-2', { width: 760 }, t)];
    const quick = await Promise.race([
      fitPicture('quick', { width: 760 }, t).then(() => 'drawn'),
      new Promise((r) => setTimeout(() => r('stuck'), 500)),
    ]);
    expect(quick).toBe('drawn');
    for (const r of release) r();
    await Promise.all(slow);
  });
});

describe('a picture seen before', () => {
  it('comes up from the copy already made, without shrinking it again', async () => {
    const t = tools({ kept: keptCopies(1e6) });
    await fitPicture('pic', { width: 760 }, t);
    const decodes = t.calls.decodes;
    const again = await fitPicture('pic', { width: 760 }, t);
    expect(again.shrunk).toBe(true);
    expect(t.calls.decodes).toBe(decodes);
  });

  it('is shrunk again when its file was redrawn under the same name', async () => {
    let round = 1;
    const t = tools({ kept: keptCopies(1e6), blob: () => png(`round ${round}`) });
    await fitPicture('pic', { width: 760 }, t);
    const decodes = t.calls.decodes;
    round = 2;
    await fitPicture('pic', { width: 760 }, t);
    expect(t.calls.decodes).toBe(decodes + 2);
  });

  it('is shrunk again for a box of another size', async () => {
    const t = tools({ kept: keptCopies(1e6) });
    await fitPicture('pic', { width: 760 }, t);
    const decodes = t.calls.decodes;
    await fitPicture('pic', { width: 300, height: 300, cover: true }, t);
    expect(t.calls.decodes).toBe(decodes + 2);
  });

  it('keeps no more copies than its budget, letting the oldest go first', async () => {
    const kept = keptCopies(40);
    const t = tools({ kept, blob: (url) => png(url) });
    // Each copy is the 15-byte "small 1520x950".
    for (const url of ['a', 'b', 'c']) await fitPicture(url, { width: 760 }, t);
    expect(kept.bytes()).toBeLessThanOrEqual(40);
    const decodes = t.calls.decodes;
    await fitPicture('c', { width: 760 }, t);
    expect(t.calls.decodes).toBe(decodes);
    await fitPicture('a', { width: 760 }, t);
    expect(t.calls.decodes).toBe(decodes + 2);
  });
});
