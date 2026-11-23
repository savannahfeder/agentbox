// With a file open full screen the window could not be moved from anywhere
// (w-b65fef60e2, 2026-11-16). `.artifact-view` covers the window and says
// no-drag so its buttons take clicks over the app's drag strips, and its own
// 44 px top bar never put a drag region back, so the whole window was cut.
// Measured off the source: no rule under `.av-top` said drag.
//
// Electron builds the region from the page's rectangles in document order,
// adding each drag one and cutting each no-drag one, and headless Chrome has
// no app regions, so this is read off the source rather than pressed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const css = read('components/artifact-view.css').replace(/\/\*[\s\S]*?\*\//g, '');
const view = read('components/ArtifactView.tsx');

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
const DRAG = /-webkit-app-region:\s*drag\b/;
const NO_DRAG = /-webkit-app-region:\s*no-drag\b/;
const said = (sel: string, re: RegExp) => rules.some((r) => r.selector.split(',').map((s) => s.trim()).includes(sel) && re.test(r.body));

/** The JSX of the top bar, from its opening tag to its closing one. */
const header = view.slice(view.indexOf('<header className="av-top">'), view.indexOf('</header>'));
/** One span's JSX, by class, when it is written as a self-closing tag or holds only an expression. */
const spanOf = (cls: string) => new RegExp(`<span className="${cls}"(?:\\s*/>|>[^<]*</span>)`).exec(header)?.[0];

describe('the full-screen file view\'s top bar moves the window', () => {
  it('the view still cuts the window, so nothing under it moves the window instead', () => {
    expect(rules.find((r) => r.selector === '.artifact-view')?.body).toMatch(NO_DRAG);
  });

  it('the top bar is drawn inside the view, so its drag comes after that cut', () => {
    expect(view.indexOf('<header className="av-top">')).toBeGreaterThan(view.indexOf('<div className="artifact-view"'));
    expect(view.indexOf('<div className="artifact-view"')).toBeGreaterThan(-1);
  });

  it('the top bar says drag', () => {
    expect(said('.av-top', DRAG)).toBe(true);
  });

  it('everything inside it is cut again, so Back, the version arrows, Share, Close and the Share panel take a click', () => {
    expect(said('.av-top *', NO_DRAG)).toBe(true);
  });

  it('only the file name and the empty space between put the drag back, and neither holds a control', () => {
    const back = rules.filter((r) => /\.av-/.test(r.selector) && r.selector !== '.av-top' && DRAG.test(r.body))
      .flatMap((r) => r.selector.split(',').map((s) => s.trim()));
    expect(back.sort()).toEqual(['.av-top .av-name', '.av-top .av-spring']);
    for (const cls of ['av-name', 'av-spring']) {
      const span = spanOf(cls);
      expect(span, cls).toBeTruthy();
      expect(span, cls).not.toMatch(/<button|<a\s|<input/);
    }
  });

  it('nothing below the top bar moves the window', () => {
    const below = rules.filter((r) => DRAG.test(r.body) && !/^\.av-top\b/.test(r.selector) && r.selector !== '.av-top');
    expect(below.map((r) => r.selector)).toEqual([]);
  });
});
