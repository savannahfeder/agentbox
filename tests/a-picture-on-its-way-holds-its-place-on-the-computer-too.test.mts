// A PICTURE ON ITS WAY HOLDS ITS PLACE ON THE COMPUTER TOO (2026-10-16).
//
// "Images or anything that takes up space would render as little dots ... Now
// they're rendering as dots again." The shimmering placeholder from 2026-10-12
// and 10-14 was only ever switched on for the phone page: its rules were scoped
// to [data-door="phone"] and only the phone's bridge started the watcher that
// marks a picture loading. Measured in Chrome with the app's own stylesheets
// and a picture held back 2.5 s (scripts/scratch/picture-dot.mjs): in the
// computer's thread the loading picture was 2 x 2 px and the words under it
// moved 449px when it landed; on the phone page it was 720 x 541 and they
// moved 83px.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stripCss = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const strip = (t) => stripCss(t).replace(/\/\/.*$/gm, '');
const css = stripCss(read('renderer/src/styles.css'));

/** Every selector in the stylesheet that names `sel`. */
const selectors = (sel) => [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
  .flatMap((m) => m[1].split(','))
  .map((s) => s.trim())
  .filter((s) => s.includes(sel));

describe('the placeholder for a picture on its way', () => {
  for (const sel of [
    '.inline-image[data-phone-img="loading"]',
    '.inline-image-open:has(> .inline-image[data-phone-img="loading"])',
    '.doc-picture[data-phone-img="loading"]',
    '.attach-row img[data-phone-img="loading"]',
    '.inline-image[data-phone-img="ready"]',
  ]) {
    it(`applies in the computer's window, not only on the phone: ${sel}`, () => {
      const found = selectors(sel);
      expect(found.length).toBeGreaterThan(0);
      expect(found.some((s) => !s.includes('data-door'))).toBe(true);
    });
  }

  it('does not widen a picture that has arrived, so a small one keeps its own size', () => {
    expect(css).not.toMatch(/\.inline-image-open\s*\{[^}]*(?<![-\w])width:\s*100%/);
    const widened = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => m[1].includes('.inline-image-open') && /(?<![-\w])width:\s*100%/.test(m[2]));
    expect(widened.length).toBeGreaterThan(0);
    expect(widened.every((m) => m[1].includes('data-phone-img="loading"'))).toBe(true);
  });
});

describe('the watcher that marks a picture loading', () => {
  it('is started by the computer window when it boots', () => {
    const boot = strip(read('renderer/src/main.tsx'));
    expect(boot).toMatch(/import\s*\{[^}]*\binstallPictureWatch\b[^}]*\}\s*from\s*'\.\/phone-files'/);
    expect(boot).toMatch(/\binstallPictureWatch\(\)/);
  });

  it('is started once, not again by the phone bridge on the same page', () => {
    const bridge = strip(read('renderer/src/browser-bridge.ts'));
    expect(bridge).not.toMatch(/\binstallPictureWatch\(\)/);
  });
});
