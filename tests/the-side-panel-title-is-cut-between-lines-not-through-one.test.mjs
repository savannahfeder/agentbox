// The thread's name in the side panel was sliced through the middle of a
// fourth line (power-test-2, issue 36): three lines ending in "…" and then the
// top half of another line under them.
//
// -webkit-line-clamp caps the CONTENT box at three lines, and `overflow:
// hidden` clips at the PADDING box, so every pixel of padding-bottom is a
// window onto the line the clamp just hid. The name is clickable, so it wears
// the 6px padding of a text box, and 6px is about a third of a 22px line. A
// max-height does not help: the clip edge is the padding edge either way.
//
// So the clamp moved off the click target and onto an inner span, which has no
// padding to leak through. Measured in the built renderer at 1440x944:
// before, the h2 was 80px tall over 122px of text and the fourth line showed;
// after, the span is 66px over 122px and nothing shows under line three.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/threads/summary.css'), 'utf8');
const tsx = fs.readFileSync(path.join(root, 'renderer/src/threads/Summary.tsx'), 'utf8');

// Every rule whose selector list begins with exactly this selector, latest
// first, so a property set twice reads the way the cascade gives it.
const rule = (selector) => {
  const found = css.split('\n')
    .map((line) => line.match(/^([^{]+)\{([^}]*)\}/))
    .filter((m) => m && m[1].trim().startsWith(selector) && /^[\s,]*$|^,/.test(m[1].trim().slice(selector.length)))
    .map((m) => m[2]);
  expect(found.length, `no rule for ${selector}`).toBeGreaterThan(0);
  return found.reverse().join(';');
};
const value = (body, prop) => {
  const m = body.match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
};

describe('where the clamp lives', () => {
  it('is on the words', () => {
    const words = rule('.ts-title-text');
    expect(value(words, '-webkit-line-clamp')).toBe('3');
    expect(value(words, 'overflow')).toBe('hidden');
  });

  it('is not on the click target, which has padding for it to leak through', () => {
    const box = rule('.ts-title[role="button"]');
    expect(value(box, 'padding')).toBeTruthy();
    expect(value(box, '-webkit-line-clamp')).toBe(null);
    expect(value(box, 'overflow')).toBe(null);
  });

  it('and not on the heading the click target is, either', () => {
    expect(value(rule('.ts-title'), '-webkit-line-clamp')).toBe(null);
  });
});

describe('the markup the clamp needs', () => {
  it('wraps the name in the span the rule names', () => {
    expect(tsx).toContain('className="ts-title-text"');
  });

  it('keeps the pencil with the words, so it still follows the last one', () => {
    const span = tsx.slice(tsx.indexOf('className="ts-title-text"'));
    expect(span.slice(0, span.indexOf('</span>'))).toContain('<Pen />');
  });
});
