// THE EMPTY INBOX DRAWS ITS WORDS AND CONTROLS WHITE (w-f1a1d4c9db, 2026-11-15).
//
// "Nothing needs you" over the dark purple sky: "all of the text, buttons, and
// similar elements need to be white rather than gray because the gray just
// blends right in". Measured in the built renderer: the placeholder was
// #c4bdb8, the paperclip #a09994, the chip outlines #464443, the rule under the
// words and the priority bars #52504f, and an empty box's Send was drawn at
// 45%. Earlier rounds turned down any patch or shadow behind the words, so the
// fix is the colours alone.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = fs.readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');
const zero = '.app:has(> .inbox-sky-zero) .th-start';
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return null;
  return css.slice(at, css.indexOf('}', at) + 1);
};

describe('the empty Inbox over a sky', () => {
  it('draws the placeholder in the text colour, not a grey', () => {
    expect(rule(`${zero} .tc-text::placeholder`)).toContain('color: var(--text);');
  });

  it('turns every grey in the words and the bar white, and the lines a light white', () => {
    const tokens = rule(`${zero} :is(.tc-text, .tc-chip, .tc-icon, .tc-send)`);
    expect(tokens).toContain('--text-dim: var(--text);');
    expect(tokens).toContain('--text-faint: var(--text);');
    expect(tokens).toMatch(/--line: color-mix\(in srgb, var\(--text\) \d+%, transparent\);/);
    expect(tokens).toMatch(/--line-strong: color-mix\(in srgb, var\(--text\) \d+%, transparent\);/);
  });

  it('keeps the priority bars a step apart, so Agent Decides never reads as Urgent', () => {
    const tokens = rule(`${zero} :is(.tc-text, .tc-chip, .tc-icon, .tc-send)`) ?? '';
    const line = Number(tokens.match(/--line-strong: color-mix\(in srgb, var\(--text\) (\d+)%/)?.[1]);
    expect(line).toBeGreaterThanOrEqual(30);
    expect(line).toBeLessThanOrEqual(55);
  });

  it('draws Send at full strength while the box is empty', () => {
    expect(rule(`${zero} .tc-send > button:disabled`)).toContain('opacity: 1;');
    expect(rule(`${zero} .tc-send kbd`)).toContain('opacity: 1;');
  });

  it('leaves the dropdown menus their own greys, on their solid card', () => {
    expect(css).not.toMatch(/\.inbox-sky-zero\) \.th-start[^{]*\.tc-menu/);
    expect(rule(`${zero}`)).toBeNull();
  });

  // Except on the light purple sky (the-light-purple-skys-empty-inbox-softens-its-sky-and-fills-its-controls).
  it('changes colour only: nothing laid over the sky', () => {
    const others = css.split('\n').filter((l) => !l.startsWith(':root[data-sky-frame="dusk-light"]')).join('\n');
    expect(others).not.toMatch(/\.inbox-sky-zero\)[^{]*\{[^}]*(text-shadow|background)/);
  });
});
