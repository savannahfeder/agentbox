// SCROLLING ON A PHONE PICKED UP A THREAD (2026-10-12): "every time I try to
// scroll in the mobile version, it detects it as me trying to drag the item
// and shows the dragging animation". A row is carried by pointer events
// (renderer/src/threads/row-drag.ts), and a finger's first few points of a
// scroll reach them before the browser takes the gesture over, which is past
// the carry threshold. The board's box select does the same on its ground,
// and calls preventDefault, which stops the scroll outright.
//
// A finger scrolls; it does not carry or box-select. On a phone the order of
// threads is set from their priority, in the summary.
//
// AND SAFARI'S BAND BEHIND THE CLOCK STAYED ITS OWN GREY, (19, 20, 22),
// against a top bar of (26, 24, 23) to (34, 29, 26), sampled off a fresh
// screenshot: this Safari takes no notice of theme-color and matches the
// page's top instead, which was the wall with its glow. The top bar is solid
// in the wall's colour, and the page's root wears it too.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/** The body of a function or arrow defined as `const name = (…) => {`. */
function body(src, name) {
  const at = src.indexOf(`const ${name} = (`);
  expect(at, `${name} is defined`).toBeGreaterThan(-1);
  const open = src.indexOf('{', src.indexOf('=>', at));
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  return '';
}

describe('a finger on a phone', () => {
  it('never picks up a row: the carry ignores touch before anything else', () => {
    const press = body(read('renderer/src/threads/row-drag.ts'), 'onPointerDown');
    const touch = press.indexOf("if (e.pointerType === 'touch') return;");
    expect(touch).toBeGreaterThan(-1);
    expect(touch).toBeLessThan(press.indexOf('dropNow.current'));
  });

  it('never draws a box on the board, so its preventDefault cannot stop a scroll', () => {
    const band = body(read('renderer/src/threads/Pages.tsx'), 'startBand');
    const touch = band.indexOf("if (e.pointerType === 'touch') return;");
    expect(touch).toBeGreaterThan(-1);
    expect(touch).toBeLessThan(band.indexOf('e.preventDefault()'));
  });

  it('a mouse still carries and boxes as before', () => {
    const press = body(read('renderer/src/threads/row-drag.ts'), 'onPointerDown');
    expect(press).not.toMatch(/pointerType !== 'mouse'/);
  });
});

describe('on a phone, the top of the page', () => {
  const css = read('renderer/src/phone.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const at = css.indexOf('@media (max-width: 700px), (max-height: 520px)');
  const rules = [...css.slice(at).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
  const decl = (piece, prop) => {
    const bodies = rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith(piece))).map((r) => r.body).join(';');
    const all = [...bodies.matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, 'g'))];
    return all.length ? all[all.length - 1][1].trim() : undefined;
  };
  // The bar was solid for Safari to match the band behind the clock to; the
  // edge strip does that now, and the bar shows the wall (w-33511040d7).
  it('lets the wall through, and the strip behind the clock wears the wall\'s colour', () => {
    expect(decl('.workspace-layout > .topbar', 'background')).toBe('transparent');
    expect(decl('.phone-edge-top', 'background')).toBe('var(--bg)');
  });
  it('and the page\'s root wears the same colour', () => {
    expect(decl(':root', 'background-color')).toBe('var(--bg)');
  });
});
