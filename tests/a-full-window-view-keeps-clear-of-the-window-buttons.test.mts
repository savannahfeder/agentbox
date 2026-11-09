// A FULL-WINDOW VIEW KEEPS CLEAR OF THE WINDOW BUTTONS.
//
// The Mac window is frameless, so its close, minimise and full-screen buttons
// sit over whatever is drawn in the top-left corner. Opening a picture from a
// thread drew the viewer's header there: the three buttons sat on top of the
// thread's name (seen on the owner's screen, 2026-11-02). The full-screen
// picture view and the file sheet start their headers in the same corner. A
// window with no buttons (preload.cjs marks it flat) keeps the corner.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const rule = (css, sel) => css.match(new RegExp(`(^|\\n)${sel.replace(/[.[\]="()]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';
const px = (decl, prop) => Number(new RegExp(`${prop}:\\s*(\\d+)px`).exec(decl)?.[1] ?? NaN);
const CLEAR = 78;

const views = [
  ['renderer/src/components/artifact-view.css', '.av-top', 'padding-left'],
  ['renderer/src/styles.css', '.pv-top', 'left'],
  ['renderer/src/components/file-views.css', '.file-sheet-head', 'padding-left'],
];

describe('the top-left corner of a full-window view', () => {
  for (const [file, sel, prop] of views) {
    it(`${sel} starts past the window buttons on a Mac`, () => {
      expect(px(rule(read(file), sel), prop)).toBeGreaterThanOrEqual(CLEAR);
    });
    it(`${sel} uses the corner on a window with no buttons`, () => {
      expect(px(rule(read(file), `:root[data-window="flat"] ${sel}`), prop)).toBeLessThan(CLEAR);
    });
  }
});
