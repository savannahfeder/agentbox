// ⌘K OPENS OVER A FILE OPENED BIG, AND ITS KEYS STAY ITS OWN.
//
// A tester opened a file from Home, pressed ⌘K and typed a thread name: the
// file stayed on screen and the words went into a box nobody could see.
// Read off the styles on 9494b19f: the command bar's backdrop is a
// .modal-backdrop at z-index 40, the big file view and the picture view are
// at 9400, the file sheet at 900. Behind that, each view takes keys before
// the bar does:
//   - the file view takes Escape on the window in the capture phase, ahead of
//     the bar's own Escape, so Escape closed the file and left the bar open;
//   - the file view stops every plain key at the document, so ← and → typed
//     in the bar stepped to another file (it counts only a textarea as typing);
//   - the picture view stops every plain key at the window, so Enter and the
//     arrows never reached the bar's list;
//   - the file sheet closes itself on any Escape.
// No jsdom here, so the rules run on stand-ins and the wiring is read from
// source, as the ⌘F test does.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paletteIsOpen, pressedInThePalette } from '../renderer/src/palette-rows';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');

const zIn = (css: string, selector: string): number => {
  const at = css.startsWith(`${selector} {`) ? 0 : css.indexOf(`\n${selector} {`);
  if (at < 0) return NaN;
  const rule = css.slice(at, css.indexOf('}', at));
  return Number(rule.match(/z-index:\s*(\d+)/)?.[1]);
};

const styles = read('renderer', 'src', 'styles.css');
const viewCss = read('renderer', 'src', 'components', 'artifact-view.css');
const sheetCss = read('renderer', 'src', 'components', 'file-views.css');
const tourCss = read('renderer', 'src', 'components', 'tour.css');

// The rule that lifts the bar while a file view is up, and the views it names.
const lift = styles.match(/\n([^\n{}]*:has\([^)]*\)[^\n{}]*\.palette-backdrop[^\n{}]*)\{([^}]*)\}/);
const liftZ = Number(lift?.[2].match(/z-index:\s*(\d+)/)?.[1]);

describe('the bar is drawn over a file opened big', () => {
  it('is lifted while a file view is on the page', () => {
    expect(lift).not.toBeNull();
  });

  it('names every view that covers the window with a file', () => {
    for (const view of ['.artifact-view', '.picture-view', '.file-sheet']) expect(lift![1]).toContain(view);
  });

  it('sits over the big file view, the picture view and the file sheet', () => {
    expect(liftZ).toBeGreaterThan(zIn(viewCss, '.artifact-view'));
    expect(liftZ).toBeGreaterThan(Number(styles.match(/\.picture-view \{[^}]*z-index:\s*(\d+)/)![1]));
    expect(liftZ).toBeGreaterThan(Number(sheetCss.match(/\.file-sheet \{[^}]*z-index:\s*(\d+)/)![1]));
  });

  it('sits over the bar for noting selected words and the key hints', () => {
    expect(liftZ).toBeGreaterThan(Number(viewCss.match(/\.selection-bar \{ z-index: (\d+)/)![1]));
    expect(liftZ).toBeGreaterThan(zIn(styles, '.hint-plate'));
  });

  it('stays under the ⌘F box and the screens that lock the whole app', () => {
    expect(liftZ).toBeLessThan(zIn(styles, '.find-bar'));
    expect(liftZ).toBeLessThan(zIn(styles, '#phone-locked-out'));
  });

  // The tour points at the bar from 1000 and up, so with no file open it stays where it was.
  it('stays under the tour when no file is open', () => {
    expect(zIn(styles, '.modal-backdrop')).toBe(40);
    expect(zIn(styles, '.modal-backdrop')).toBeLessThan(Number(tourCss.match(/z-index:\s*(\d+)/)![1]));
  });
});

describe('telling a press in the bar from one in the file', () => {
  const inBar = { closest: (sel: string) => (sel === '.palette-backdrop' ? {} : null) };
  const inFile = { closest: () => null };

  it('knows a press came from the bar', () => {
    expect(pressedInThePalette(inBar)).toBe(true);
  });

  it('knows a press in the file, its comment box, or nowhere did not', () => {
    expect(pressedInThePalette(inFile)).toBe(false);
    expect(pressedInThePalette(null)).toBe(false);
    expect(pressedInThePalette({})).toBe(false);
  });

  it('knows whether the bar is open', () => {
    expect(paletteIsOpen({ querySelector: (sel: string) => (sel === '.palette-backdrop' ? {} : null) })).toBe(true);
    expect(paletteIsOpen({ querySelector: () => null })).toBe(false);
  });
});

describe('the file views leave the bar its keys', () => {
  const view = read('renderer', 'src', 'components', 'ArtifactView.tsx');
  const escape = view.slice(view.indexOf('const escape = (e: KeyboardEvent)'), view.indexOf('const rest = (e: KeyboardEvent)'));
  const rest = view.slice(view.indexOf('const rest = (e: KeyboardEvent)'), view.indexOf("window.addEventListener('keydown', escape, true)"));

  it('the big file view leaves Escape to the open bar, so Escape closes the bar and not the file', () => {
    expect(escape).toContain('paletteIsOpen(document)');
    expect(escape.indexOf('paletteIsOpen(document)')).toBeLessThan(escape.indexOf('stopImmediatePropagation'));
  });

  it('the big file view lets keys typed in the bar through, so an arrow there does not step the file', () => {
    expect(rest).toContain('pressedInThePalette(e.target)');
    expect(rest.indexOf('pressedInThePalette(e.target)')).toBeLessThan(rest.indexOf('stopPropagation'));
  });

  it('the picture view lets keys typed in the bar through', () => {
    const pictures = read('renderer', 'src', 'components', 'PictureView.tsx');
    const key = pictures.slice(pictures.indexOf('const key = (e: KeyboardEvent)'));
    expect(key).toContain('pressedInThePalette(e.target)');
    expect(key.indexOf('pressedInThePalette(e.target)')).toBeLessThan(key.indexOf('stopImmediatePropagation'));
  });

  it('the file sheet leaves Escape to the open bar', () => {
    const sheet = read('renderer', 'src', 'components', 'FileSheet.tsx');
    const onKey = sheet.slice(sheet.indexOf('const onKey = (e: KeyboardEvent)'), sheet.indexOf("window.addEventListener('keydown', onKey, true)"));
    expect(onKey).toContain('paletteIsOpen(document)');
  });
});
