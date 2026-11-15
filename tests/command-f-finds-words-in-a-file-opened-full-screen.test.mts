// ⌘F WORKS IN A FILE OPENED FULL SCREEN.
//
// w-6467465b4c: ⌘F did nothing in a markdown file opened big. The box did
// open, underneath: it sat at z-index 95 and the full-screen file view
// (.artifact-view) at 9400, the file sheet a group chat opens at 900. Read off
// styles.css, artifact-view.css and file-views.css on 326dd41f. Behind the
// box, three more faults were waiting once it showed:
//   - it read the whole page, so the thread hidden under the file was counted
//     and "1 of 9" could step to words nobody could see;
//   - the file view takes Escape first, on the window in the capture phase, so
//     Escape in the box closed the file instead of the box;
//   - the view takes ← and → to step files unless the press comes from a
//     textarea or a contentEditable, so moving the caret in the box changed
//     the file.
//
// This repo has no jsdom, so the rules are run on stand-ins and the wiring is
// read from source, the way the first ⌘F test does it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { whereToFind, pressedInTheFindBox } from '../renderer/src/find-in-page';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => {
  const file = path.join(here, '..', ...p);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};

const zOf = (css, selector) => {
  const at = css.startsWith(`${selector} {`) ? 0 : css.indexOf(`\n${selector} {`);
  if (at < 0) return NaN;
  const rule = css.slice(at, css.indexOf('}', at));
  return Number(rule.match(/z-index:\s*(\d+)/)?.[1]);
};

describe('the box is above a file opened full screen', () => {
  const styles = read('renderer', 'src', 'styles.css');
  const viewCss = read('renderer', 'src', 'components', 'artifact-view.css');
  const sheetCss = read('renderer', 'src', 'components', 'file-views.css');
  const bar = zOf(styles, '.find-bar');

  it('sits over the big file view, and the bar for noting selected words', () => {
    expect(zOf(viewCss, '.artifact-view')).toBeGreaterThan(0);
    expect(bar).toBeGreaterThan(zOf(viewCss, '.artifact-view'));
    expect(viewCss).toMatch(/\.selection-bar \{ z-index: (\d+)/);
    expect(bar).toBeGreaterThan(Number(viewCss.match(/\.selection-bar \{ z-index: (\d+)/)[1]));
  });

  it('sits over the file sheet a group chat opens', () => {
    expect(bar).toBeGreaterThan(zOf(sheetCss, '.file-sheet'));
  });

  // The screens that say the app cannot be used must still cover everything.
  it('stays under the screens that lock the whole app', () => {
    expect(zOf(styles, '#phone-locked-out')).toBe(10000);
    expect(bar).toBeLessThan(zOf(styles, '#phone-locked-out'));
  });
});

describe('it reads only the file while one is open full screen', () => {
  const body = { name: 'body' };
  const page = (layers) => ({ body, querySelectorAll: (sel) => (sel === '[data-find-layer]' ? layers : []) });

  it('reads the whole page when no file is open', () => {
    expect(whereToFind(page([]))).toBe(body);
  });

  it('reads the open file, not the thread under it', () => {
    const file = { name: 'file' };
    expect(whereToFind(page([file]))).toBe(file);
  });

  // A file sheet can open over a file view; the one on top is the one read.
  it('reads the newest when one opened over another', () => {
    const under = { name: 'under' };
    const over = { name: 'over' };
    expect(whereToFind(page([under, over]))).toBe(over);
  });

  it('marks both full-screen file views as the place to read', () => {
    expect(read('renderer', 'src', 'components', 'ArtifactView.tsx')).toMatch(/className="artifact-view"[^>]*data-find-layer/);
    expect(read('renderer', 'src', 'components', 'FileSheet.tsx')).toMatch(/className="file-sheet"[^>]*data-find-layer/);
    expect(read('renderer', 'src', 'components', 'FindBar.tsx')).toContain('whereToFind(document)');
  });
});

describe('keys typed in the box stay in the box', () => {
  const inBox = { closest: (sel) => (sel === '[data-find-bar]' ? {} : null) };
  const inFile = { closest: () => null };

  it('knows a press came from the box', () => {
    expect(pressedInTheFindBox(inBox)).toBe(true);
  });

  it('knows a press in the file or the comment box did not', () => {
    expect(pressedInTheFindBox(inFile)).toBe(false);
    expect(pressedInTheFindBox(null)).toBe(false);
    expect(pressedInTheFindBox({})).toBe(false);
  });

  const view = read('renderer', 'src', 'components', 'ArtifactView.tsx');
  const escape = view.slice(view.indexOf('const escape = (e: KeyboardEvent)'), view.indexOf('const rest = (e: KeyboardEvent)'));
  const rest = view.slice(view.indexOf('const rest = (e: KeyboardEvent)'), view.indexOf("window.addEventListener('keydown', escape, true)"));

  it('leaves Escape in the box to the box, so it closes the box and not the file', () => {
    expect(escape).toContain('pressedInTheFindBox(e.target)');
    expect(escape.indexOf('pressedInTheFindBox(e.target)')).toBeLessThan(escape.indexOf('stopImmediatePropagation'));
  });

  it('does not step to another file on an arrow typed in the box', () => {
    expect(rest).toContain('pressedInTheFindBox(e.target)');
  });
});
