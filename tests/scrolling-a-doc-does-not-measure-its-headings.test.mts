// SCROLLING A DOC MEASURED EVERY HEADING IN IT, ON EVERY SCROLL EVENT.
// The contents beside a long doc lights the section being read. Its scroll
// handler looked up every heading in the page and asked each one where it was
// drawn, every time the page moved. Measured in a trace of the built app
// scrolling a 26 KB doc with 23 headings, the CPU slowed 4x: 2.6 ms of the
// main thread per scroll event, 150 calls costing 389 ms, and 3,451 forced
// layout checks. Now the headings are measured when the page changes size, and
// a scroll only compares the scroll position with what was measured.
// No jsdom here, so the rule runs on numbers and the wiring is read from source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { sectionAt } from '../renderer/src/doc-outline.ts';

const src = fs.readFileSync(new URL('../renderer/src/components/DocOutline.tsx', import.meta.url), 'utf8');

// A function's body, from `const name = (` to its closing brace.
const body = (name: string) => {
  const at = src.indexOf(`const ${name} = (`);
  expect(at, `${name} is gone`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`${name} never closes`);
};

describe('the section lit while a doc scrolls', () => {
  it('is worked out from the scroll position alone', () => {
    expect(src).toMatch(/addEventListener\('scroll', spy, \{ passive: true \}\)/);
    const spy = body('spy');
    expect(spy).not.toMatch(/getBoundingClientRect|querySelector|headingsIn/);
    expect(spy).toMatch(/scroller\.scrollTop/);
  });

  it('comes from headings measured when the page changes size', () => {
    expect(body('measure')).toMatch(/getBoundingClientRect/);
    expect(src).toMatch(/new ResizeObserver\(/);
    expect(src).toMatch(/\.observe\(page\)/);
  });

  it('is the last heading at or above the reading line, measured from the top of the scrolled page', () => {
    // Headings 0, 400 and 900px down the page; the reading line 120px below the top.
    const tops = [0, 400, 900];
    const at = (scrollTop: number) => sectionAt(tops.map((t) => t - scrollTop), 120);
    expect(at(0)).toBe(0);
    expect(at(279)).toBe(0);
    expect(at(280)).toBe(1);
    expect(at(779)).toBe(1);
    expect(at(780)).toBe(2);
  });

  it('is none above the first heading', () => {
    expect(sectionAt([200, 600].map((t) => t - 0), 120)).toBe(-1);
  });
});
