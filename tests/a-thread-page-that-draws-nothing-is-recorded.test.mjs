// A THREAD PAGE THAT DRAWS NOTHING IS RECORDED, WITH WHICH KIND OF NOTHING.
//
// Threads opened from the team board (several of them running in the cloud) came
// up as a header over an empty window: no messages, no reply box. Rebuilt from
// the real ledgers, in a full copy of the app on the real pictures and on the
// team board itself, every one drew. Reading the live window through
// accessibility showed the page's text laid out on screen. So the window either
// had the page and did not paint it, or lost it in a way no copy reproduces,
// and nothing recorded which. Now, a moment after a thread opens, the screen
// says what it laid out and the app photographs that spot of its own window:
// text laid out and no ink painted is "paint-blank", nothing laid out is
// "dom-blank", and either is written to memory-log/blank-<day>.jsonl.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inkFraction, blankVerdict, recordBlankPages, INK_MIN } from '../main/blank-page.mts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// A BGRA picture the size of a strip of the thread page: the app's dark
// background, the faint dot grid it draws behind every page, and optionally
// lines of light text.
function strip({ width = 800, height = 60, textRows = [] } = {}) {
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let v = 33;
      if (x % 20 === 0 && y % 20 === 0) v = 39; // the dot grid
      if (textRows.includes(y) && x % 3 !== 0 && x > 40 && x < 700) v = 225; // glyphs
      px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255;
    }
  }
  return { bitmap: px, width, height };
}

describe('telling ink from an empty background', () => {
  it('the bare background and its dot grid have no ink', () => {
    const s = strip();
    expect(inkFraction(s.bitmap, s.width, s.height)).toBeLessThan(INK_MIN);
  });

  it('a line of text is ink', () => {
    const s = strip({ textRows: [20, 21, 22, 23] });
    expect(inkFraction(s.bitmap, s.width, s.height)).toBeGreaterThan(INK_MIN);
  });

  it('a single stray bright pixel is not a line of text', () => {
    const s = strip();
    s.bitmap.fill(255, 0, 4);
    expect(inkFraction(s.bitmap, s.width, s.height)).toBeLessThan(INK_MIN);
  });

  it('an empty or mis-sized picture reads as unknown, not as blank', () => {
    expect(inkFraction(Buffer.alloc(0), 0, 0)).toBeNull();
    expect(inkFraction(Buffer.alloc(10), 100, 100)).toBeNull();
  });
});

describe('what kind of blank it was', () => {
  it('text laid out on screen but no ink painted is a window that did not paint', () => {
    expect(blankVerdict({ text: 5, dock: true }, 0)).toBe('paint-blank');
  });

  it('nothing laid out and no reply box is a page that has nothing on it', () => {
    expect(blankVerdict({ text: 0, dock: false }, null)).toBe('dom-blank');
  });

  it('a drawn page is not recorded', () => {
    expect(blankVerdict({ text: 5, dock: true }, 0.02)).toBeNull();
  });

  it('a page still loading shows its reply box, which is not blank', () => {
    expect(blankVerdict({ text: 0, dock: true }, null)).toBeNull();
  });

  it('a picture that could not be read decides nothing', () => {
    expect(blankVerdict({ text: 5, dock: true }, null)).toBeNull();
  });
});

describe('the app photographs its own window and writes only blanks down', () => {
  const picture = (s) => ({ toBitmap: () => s.bitmap, getSize: () => ({ width: s.width, height: s.height }), isEmpty: () => false });
  const setUp = (shots) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blank-page-'));
    let handler = null;
    let repaints = 0;
    const webContents = { capturePage: async () => picture(shots.shift()), invalidate: () => { repaints++; } };
    const win = { isDestroyed: () => false, webContents };
    recordBlankPages({ ipcMain: { handle: (_c, fn) => { handler = fn; } }, window: () => win, dir, context: () => ({ inCloud: 2 }), now: () => new Date('2026-11-07T03:18:42Z') });
    const written = () => { const f = path.join(dir, 'blank-2026-11-07.jsonl'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []; };
    return { ask: (payload, sender = webContents) => handler({ sender }, payload), written, repaints: () => repaints };
  };
  const laidOut = { text: 6, dock: true, strip: { x: 360, y: 120, width: 400, height: 30 } };

  it('a painted page writes nothing', async () => {
    const t = setUp([strip({ textRows: [10, 11, 12] })]);
    expect(await t.ask({ thread: 'p/w-1', facts: laidOut })).toBeNull();
    expect(t.written()).toEqual([]);
  });

  it('a page laid out but not painted is written down, repainted once, and says whether that helped', async () => {
    const t = setUp([strip(), strip({ textRows: [10, 11, 12] })]);
    expect(await t.ask({ thread: 'p/w-1', facts: laidOut, lateMs: 900, longTaskMs: 1200 })).toBe('paint-blank');
    expect(t.repaints()).toBe(1);
    const [line] = t.written();
    expect(line).toMatchObject({ verdict: 'paint-blank', thread: 'p/w-1', healed: true, lateMs: 900, longTaskMs: 1200, inCloud: 2 });
  });

  it('a page with nothing on it is written down with what the screen saw', async () => {
    const t = setUp([]);
    expect(await t.ask({ thread: 'p/w-2', facts: { text: 0, dock: false, strip: null, listPane: 'none' } })).toBe('dom-blank');
    expect(t.written()[0]).toMatchObject({ verdict: 'dom-blank', facts: { listPane: 'none' } });
  });

  it('an ask from anywhere but the window itself (the phone door) is not answered', async () => {
    const t = setUp([strip()]);
    expect(await t.ask({ thread: 'p/w-1', facts: laidOut }, { aPhonesPage: true })).toBeNull();
    expect(t.written()).toEqual([]);
  });
});

describe('it runs when a thread opens, on the desktop only', () => {
  it('the screen and the desktop bridge share one channel for it', () => {
    expect(read('shared/bridge-map.mts')).toMatch(/blankCheck: 'zero:blank-check'/);
    expect(read('preload.cjs')).toMatch(/blankCheck: \(payload\) => ipcRenderer\.invoke\('zero:blank-check', payload\)/);
  });

  it('the app answers it by photographing its own window and writing the blank down', () => {
    const main = read('main/main.mts');
    expect(main).toMatch(/recordBlankPages\(/);
    const page = read('main/blank-page.mts');
    expect(page).toMatch(/capturePage\(/);
    expect(page).toMatch(/blank-\$\{/);
  });

  it('a browser tab has no window to photograph and is told nothing', () => {
    expect(read('main/serve.mts')).toMatch(/ipcMain\.handle\('zero:blank-check', \(\) => null\)/);
  });

  it('the thread page asks once each time a thread opens', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/watchForBlank\([^)]*\)[\s\S]{0,200}\[item\.product, item\.id\]/);
  });
});
