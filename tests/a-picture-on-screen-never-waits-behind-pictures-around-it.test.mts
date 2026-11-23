// A PICTURE ON SCREEN NEVER WAITS BEHIND THE PICTURES AROUND IT.
//
// What broke (2026-11-22): "Threads with a bunch of images just get so slow
// and they don't load, and then scrolling is so incredibly time-consuming."
// Every picture is shrunk before it shows, two at a time
// (renderer/src/fit-picture.ts), and the line was first come, first served. A
// thread opened at its end asked for the pictures a screen above it first,
// because they come first on the page, and a picture scrolled past kept its
// place in line however far behind it was left.
//
// Measured in Chromium with 40 Retina screenshots in one thread
// (scripts/scratch, median of five): after a fast scroll of ten screens
// stopped, the pictures on screen waited 1.3 s, because every picture
// scrolled past was shrunk before them. With the fix, 0.5 to 0.7 s, and none
// to two of those were shrunk.
//
// Now a picture on screen goes before any picture that is not, a picture off
// screen uses one of the two turns at most, and only while no picture on
// screen is still on its way. These tests hold the line itself; the browser
// half is a-thread-draws-the-pictures-on-screen-first.
import { describe, it, expect } from 'vitest';
import { fitPicture } from '../renderer/src/fit-picture.ts';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Each picture's bytes carry its name, so the decoder can say which one it
// has. A picture named in `hold` is not done decoding until it is let go.
function tools({ wait = 10, hold = [] as string[] } = {}) {
  const calls = { order: [] as string[], now: 0, most: 0 };
  const names = new WeakMap<Blob, string>();
  const named = (url: string) => { const blob = new Blob([new Uint8Array(PNG), url]); names.set(blob, url); return blob; };
  const gates = new Map(hold.map((name) => { let open = () => {}; const shut = new Promise<void>((r) => { open = r; }); return [name, { shut, open }]; }));
  return {
    calls,
    letGo: (name: string) => gates.get(name)?.open(),
    fetch: async (url: string) => ({ ok: true, status: 200, blob: async () => named(url) }),
    decode: async (from: Blob | { width: number; height: number; close(): void }, resize?: { resizeWidth: number; resizeHeight: number }) => {
      if (resize) return { width: resize.resizeWidth, height: resize.resizeHeight, close() {} };
      const name = names.get(from as Blob) ?? '?';
      calls.order.push(name);
      calls.now += 1;
      calls.most = Math.max(calls.most, calls.now);
      await (gates.get(name)?.shut ?? new Promise((r) => setTimeout(r, wait)));
      calls.now -= 1;
      return { width: 2880, height: 1800, close() {} };
    },
    encode: async (small: { width: number; height: number }) => new Blob([`small ${small.width}x${small.height}`]),
    link: () => 'blob:x',
    scale: () => 2,
  } as never as Parameters<typeof fitPicture>[2] & { calls: typeof calls; letGo: (name: string) => void };
}

const box = { width: 760 };
const on = () => true;
const off = () => false;
async function until(ok: () => boolean) {
  for (let waited = 0; !ok(); waited += 2) {
    if (waited > 5_000) throw new Error('never happened');
    await new Promise((r) => setTimeout(r, 2));
  }
}

describe('a picture on screen', () => {
  it('goes before the pictures waiting a screen away', async () => {
    const t = tools({ hold: ['busy-1', 'busy-2'] });
    const busy = [fitPicture('busy-1', box, t, undefined, on), fitPicture('busy-2', box, t, undefined, on)];
    await until(() => t.calls.order.length === 2);
    const around = ['above-1', 'above-2', 'below-1'].map((name) => fitPicture(name, box, t, undefined, off));
    const shown = fitPicture('shown', box, t, undefined, on);
    t.letGo('busy-1');
    t.letGo('busy-2');
    await Promise.all([...busy, ...around, shown]);
    expect(t.calls.order.slice(0, 3)).toEqual(['busy-1', 'busy-2', 'shown']);
  });

  it('that scrolls into view while it waits goes next', async () => {
    const t = tools({ hold: ['busy-1', 'busy-2'] });
    const busy = [fitPicture('busy-1', box, t, undefined, on), fitPicture('busy-2', box, t, undefined, on)];
    await until(() => t.calls.order.length === 2);
    let inView = false;
    const around = [fitPicture('above-1', box, t, undefined, off), fitPicture('above-2', box, t, undefined, off), fitPicture('coming', box, t, undefined, () => inView)];
    await new Promise((r) => setTimeout(r, 20));
    inView = true;
    t.letGo('busy-1');
    t.letGo('busy-2');
    await Promise.all([...busy, ...around]);
    expect(t.calls.order.slice(0, 3)).toEqual(['busy-1', 'busy-2', 'coming']);
  });

  it('starts at once while a picture off screen is being shrunk', async () => {
    const t = tools({ hold: ['away'] });
    const away = fitPicture('away', box, t, undefined, off);
    await until(() => t.calls.order.length === 1);
    const shown = fitPicture('shown', box, t, undefined, on);
    await until(() => t.calls.order.includes('shown'));
    expect(t.calls.now).toBe(2);
    t.letGo('away');
    await Promise.all([away, shown]);
  });
});

describe('pictures off screen', () => {
  it('are shrunk one at a time, so a turn is always free for the screen', async () => {
    const t = tools();
    await Promise.all(['a', 'b', 'c', 'd'].map((name) => fitPicture(name, box, t, undefined, off)));
    expect(t.calls.order).toEqual(['a', 'b', 'c', 'd']);
    expect(t.calls.most).toBe(1);
  });

  it('wait while a picture on screen is still on its way', async () => {
    const t = tools();
    let arrive: () => void = () => {};
    const slow = { ...t, fetch: async (url: string) => { if (url === 'shown') await new Promise<void>((r) => { arrive = r; }); return t.fetch(url); } } as typeof t;
    const shown = fitPicture('shown', box, slow, undefined, on);
    const away = fitPicture('away', box, slow, undefined, off);
    await new Promise((r) => setTimeout(r, 30));
    expect(t.calls.order).toEqual([]);
    arrive();
    await Promise.all([shown, away]);
    expect(t.calls.order).toEqual(['shown', 'away']);
  });

  it('go once the picture on screen gives up, rather than waiting for ever', async () => {
    const t = tools();
    const leaving = new AbortController();
    const slow = { ...t, fetch: async (url: string, signal?: AbortSignal) => {
      if (url === 'shown') await new Promise<void>((_, bad) => signal?.addEventListener('abort', () => bad(new DOMException('gone', 'AbortError'))));
      return t.fetch(url);
    } } as typeof t;
    const shown = fitPicture('shown', box, slow, leaving.signal, on).catch((e: Error) => e.name);
    const away = fitPicture('away', box, slow, undefined, off);
    await new Promise((r) => setTimeout(r, 30));
    expect(t.calls.order).toEqual([]);
    leaving.abort();
    await away;
    expect(await shown).toBe('AbortError');
    expect(t.calls.order).toEqual(['away']);
  });
});

describe('what keeps its order', () => {
  it('pictures all on screen are shrunk two at a time, as before', async () => {
    const t = tools();
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((name) => fitPicture(name, box, t, undefined, on)));
    expect([...t.calls.order].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(t.calls.most).toBe(2);
  });

  it('a caller that does not say where its picture is counts it as on screen', async () => {
    const t = tools();
    await Promise.all(['a', 'b', 'c'].map((name) => fitPicture(name, box, t)));
    expect(t.calls.most).toBe(2);
  });
});
