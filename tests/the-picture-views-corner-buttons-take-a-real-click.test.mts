// The full-screen picture's Close, Open beside and Open in Preview buttons did
// nothing when pressed; the view only closed from a click on the dark space
// beside the picture (w-a60ead236d, 2026-10-21). It had been reported before:
// the fix of 2026-10-16 moved the step arrows off the buttons and was checked
// with elementFromPoint in a browser, which cannot see the cause.
//
// The cause is the window's drag region. The buttons sit 21 to 57 px down the
// window, over `.topbar` (a drag region about 94 px tall on the inbox), the
// 34 to 40 px strips an opened task keeps for moving the window, and
// `.zoom-readout`, an invisible drag box parked in the top-right corner right
// where Close is. Electron turns those into a native region of the window: a
// press inside one moves the window and the page never hears it, whatever is
// painted on top. Headless Chrome has no app regions, so this is read off the
// source; the presses were measured in the real Electron app (see the commit).
//
// Electron builds the region from the page's rectangles in order, adding each
// drag one and cutting each no-drag one. So the view cuts the whole window
// while it is open, and it comes after every drag rectangle: portalled to the
// end of <body>, and above every drag rule's z-index.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = new URL('../renderer/src/', import.meta.url);
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const cssFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? cssFiles(p) : d.name.endsWith('.css') ? [p] : [];
});
const rules = cssFiles(src.pathname).flatMap((file) => {
  const css = bare(fs.readFileSync(file, 'utf8'));
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ file: path.basename(file), selector: m[1].trim(), body: m[2] }));
});
const view = fs.readFileSync(new URL('components/PictureView.tsx', src), 'utf8');

const DRAG = /-webkit-app-region:\s*drag\b/;
const zOf = (body) => Number(/z-index:\s*(\d+)/.exec(body)?.[1] ?? 0);
const own = rules.filter((r) => r.selector === '.picture-view').map((r) => r.body).join(';');

describe('the picture view is cut out of the window drag region', () => {
  it('says no-drag', () => {
    expect(own).toMatch(/-webkit-app-region:\s*no-drag/);
  });

  it('over the whole window, so the corner buttons are inside the cut', () => {
    expect(own).toMatch(/position:\s*fixed/);
    expect(own).toMatch(/inset:\s*0[;\s]/);
  });

  it('is drawn at the end of the page, after every drag strip the app draws', () => {
    expect(view).toMatch(/createPortal\([\s\S]*document\.body,?\s*\)/);
  });

  it('sits above every drag rule, so it is also last in paint order', () => {
    const drags = rules.filter((r) => DRAG.test(r.body));
    expect(drags.length).toBeGreaterThan(3);
    for (const d of drags) expect(zOf(d.body), `${d.file}: ${d.selector}`).toBeLessThan(zOf(own));
  });

  it('and nothing inside it puts a drag region back', () => {
    const inside = rules.filter((r) => /\.pv-|\.picture-view/.test(r.selector) && DRAG.test(r.body));
    expect(inside.map((r) => r.selector)).toEqual([]);
  });
});
