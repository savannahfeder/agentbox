// THE FULL SCREEN BUTTON ALSO TAKES A FILM OUT OF FULL SCREEN (w-d63fc585a9, 2026-11-23).
//
// What broke: the Full screen button in the corner of a film's bar only ever
// asked for full screen. Once the film filled the screen, pressing it again
// asked the same element to go full screen a second time, which the browser
// ignores, so the only way out was Escape. Reported from the app with a
// picture of a full-screen film and its bar. Measured by reading the button's
// handler: `wide()?.requestFullscreen?.()` and nothing else.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pressFullScreen } from '../renderer/src/full-screen-button.ts';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

const film = () => ({ requestFullscreen: vi.fn(() => Promise.resolve()) });
const page = (fullscreenElement: unknown) => ({ fullscreenElement, exitFullscreen: vi.fn(() => Promise.resolve()) });

describe('pressing Full screen', () => {
  it('on a film that is not full screen puts it full screen', () => {
    const f = film();
    const doc = page(null);
    pressFullScreen(f, doc);
    expect(f.requestFullscreen).toHaveBeenCalledOnce();
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
  });

  it('on a film that is full screen takes it out, and does not ask again', () => {
    const f = film();
    const doc = page(f);
    pressFullScreen(f, doc);
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
    expect(f.requestFullscreen).not.toHaveBeenCalled();
  });

  it('while anything else is full screen leaves full screen rather than switching to this film', () => {
    const f = film();
    const doc = page({});
    pressFullScreen(f, doc);
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
    expect(f.requestFullscreen).not.toHaveBeenCalled();
  });

  it('with the film gone and nothing full screen does nothing and does not throw', () => {
    const doc = page(null);
    expect(() => pressFullScreen(null, doc)).not.toThrow();
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
  });

  it('that the browser refuses leaves no unhandled rejection behind', async () => {
    const refused = { requestFullscreen: vi.fn(() => Promise.reject(new TypeError('Permissions check failed'))) };
    const seen = vi.fn();
    process.on('unhandledRejection', seen);
    try {
      pressFullScreen(refused, page(null));
      pressFullScreen(film(), { fullscreenElement: {}, exitFullscreen: () => Promise.reject(new TypeError('Document not active')) });
      await new Promise((r) => setTimeout(r, 0));
      expect(seen).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', seen);
    }
  });
});

describe('every film bar', () => {
  it('goes through the one press, so the bar beside the chat and the bar in a thread both get out', () => {
    const bar = read('renderer/src/components/FilmPlayer.tsx');
    expect(bar).toMatch(/onClick=\{\(\) => pressFullScreen\(wide\(\), document\)\}/);
    expect(bar).not.toMatch(/requestFullscreen/);
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/<FilmBar film=\{film\} wide=/);
  });
});
