// A PICTURE SEEN BEFORE A RESTART COMES UP WITHOUT BEING SHRUNK AGAIN.
//
// What was slow: "I open a thread, and the pictures typically take a really
// long time to load." Every thread picture is fetched, decoded, shrunk and
// encoded before it shows (renderer/src/fit-picture.ts), and the copies were
// kept only in the window's memory. Measured in the real Electron app with 16
// screenshots of 2880x1800: the first open after a launch took 0.3-0.6 s
// before the two on screen showed and 0.4-1.8 s for each screenful scrolled
// to; reopening in the same session took 80 ms. A restart lost every copy.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fitPicture, keptCopies, oldestOverBudget } from '../renderer/src/fit-picture.ts';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (extra = '') => new Blob([new Uint8Array(PNG), extra]);

function stored({ broken = false } = {}) {
  const copies = new Map();
  const calls = { gets: 0, puts: 0 };
  return {
    copies, calls,
    get: async (key) => { calls.gets += 1; if (broken) throw new Error('no database'); return copies.get(key); },
    put: async (key, copy) => { calls.puts += 1; if (broken) throw new Error('no database'); copies.set(key, copy); },
  };
}

function tools({ blob = png(), disk }) {
  const calls = { decodes: 0 };
  return {
    calls,
    kept: keptCopies(1e6),
    stored: disk,
    fetch: async () => ({ ok: true, status: 200, blob: async () => (typeof blob === 'function' ? blob() : blob) }),
    decode: async (_from, resize) => {
      calls.decodes += 1;
      return resize ? { width: resize.resizeWidth, height: resize.resizeHeight, close() {} } : { width: 2880, height: 1800, close() {} };
    },
    encode: async (small) => new Blob([`small ${small.width}x${small.height}`]),
    link: () => 'blob:x',
    scale: () => 2,
  };
}

describe('a picture seen before the app was restarted', () => {
  it('is drawn from the copy kept on disk, with nothing decoded', async () => {
    const disk = stored();
    await fitPicture('pic', { width: 760 }, tools({ disk }));
    expect(disk.copies.size).toBe(1);
    const restarted = tools({ disk });
    const again = await fitPicture('pic', { width: 760 }, restarted);
    expect(again.shrunk).toBe(true);
    expect(restarted.calls.decodes).toBe(0);
  });

  it('is asked of the disk once, then comes from memory', async () => {
    const disk = stored();
    await fitPicture('pic', { width: 760 }, tools({ disk }));
    const restarted = tools({ disk });
    await fitPicture('pic', { width: 760 }, restarted);
    const gets = disk.calls.gets;
    await fitPicture('pic', { width: 760 }, restarted);
    expect(disk.calls.gets).toBe(gets);
  });

  it('is shrunk again when its file was redrawn under the same name', async () => {
    const disk = stored();
    let round = 1;
    await fitPicture('pic', { width: 760 }, tools({ disk, blob: () => png(`round ${round}`) }));
    round = 2;
    const restarted = tools({ disk, blob: () => png(`round ${round}`) });
    await fitPicture('pic', { width: 760 }, restarted);
    expect(restarted.calls.decodes).toBe(2);
  });

  it('is shrunk again for a box of another size', async () => {
    const disk = stored();
    await fitPicture('pic', { width: 760 }, tools({ disk }));
    const restarted = tools({ disk });
    await fitPicture('pic', { width: 300, height: 300, cover: true }, restarted);
    expect(restarted.calls.decodes).toBe(2);
  });

  it('is still drawn when the disk cannot be read or written', async () => {
    const t = tools({ disk: stored({ broken: true }) });
    const r = await fitPicture('pic', { width: 760 }, t);
    expect(r.shrunk).toBe(true);
    expect(t.calls.decodes).toBe(2);
  });
});

describe('the copies kept on disk', () => {
  it('stay under their budget, the one used longest ago going first', () => {
    const copies = [
      { key: 'a', size: 40, used: 3 },
      { key: 'b', size: 40, used: 1 },
      { key: 'c', size: 40, used: 2 },
    ];
    expect(oldestOverBudget(copies, 100)).toEqual(['b']);
    expect(oldestOverBudget(copies, 120)).toEqual([]);
    expect(oldestOverBudget(copies, 39)).toEqual(['b', 'c', 'a']);
  });

  it('are what the window uses wherever it has a database', () => {
    const src = fs.readFileSync(new URL('../renderer/src/fit-picture.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/stored: typeof indexedDB === 'undefined' \? undefined : storedCopies\(/);
  });
});
