// A MEASURED PICTURE IS LET GO BEFORE THE PHONE RUNS OUT OF MEMORY.
//
// The phone app started drawing pictures with expo-image on 2026-10-31
// (554e8bfa), and measured them with `Image.loadAsync` instead of React
// Native's `Image.getSize`. getSize read a header; loadAsync decodes the whole
// picture into native memory and hands back a reference that holds it. Nothing
// let those references go, so opening a thread of screenshots piled up tens of
// megabytes each, outside anything a memory warning can clear, and iOS ends an
// app that does that. Measured on the code: both measuring places dropped the
// reference on the floor.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { shapeOfDrawn } from '../mobile/src/lib/files';

const held = (width, height) => {
  const it = { width, height, let_go: 0, release: () => { it.let_go += 1; } };
  return it;
};

describe('shapeOfDrawn', () => {
  it('answers the picture its own shape', async () => {
    expect(await shapeOfDrawn(async () => held(1290, 2796))).toEqual({ w: 1290, h: 2796 });
  });

  it('lets the picture go once it has been measured', async () => {
    const one = held(800, 600);
    await shapeOfDrawn(async () => one);
    expect(one.let_go).toBe(1);
  });

  it('lets it go even when reading its shape throws', async () => {
    const one = held(800, 600);
    Object.defineProperty(one, 'height', { get() { throw new Error('no longer there'); } });
    await expect(shapeOfDrawn(async () => one)).rejects.toThrow('no longer there');
    expect(one.let_go).toBe(1);
  });

  it('carries a picture that cannot be loaded out to its caller', async () => {
    await expect(shapeOfDrawn(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  });

  it('draws what a phone with no release gives it', async () => {
    expect(await shapeOfDrawn(async () => ({ width: 10, height: 20 }))).toEqual({ w: 10, h: 20 });
  });
});

// The two places that measure a picture are the thread's markdown and the
// picture viewer. Either one calling loadAsync directly is the leak back.
describe('the app measures pictures only through it', () => {
  for (const file of ['mobile/src/ui/Markdown.tsx', 'mobile/src/app/file.tsx']) {
    it(`${file} does not keep a loaded picture`, () => {
      const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const line of text.split('\n')) {
        if (!line.includes('loadAsync')) continue;
        expect(line, `${file}: loadAsync outside shapeOfDrawn`).toMatch(/shapeOfDrawn/);
      }
      expect(text).toContain('shapeOfDrawn');
    });
  }
});
